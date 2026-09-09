// server.js
require('dotenv').config();
const app = require('./src/app');
const http = require('http');
const socketIo = require('socket.io');
const { pool, testConnection } = require('./src/config/database');
const jwt = require('jsonwebtoken');
const User = require('./src/models/User');
const Hospital = require('./src/models/Hospital');
const Patient = require('./src/models/Patient');
const { ensureMedicalSchema } = require('./src/config/medicalSchema');
const { ensureDonationCampaignSchema } = require('./src/config/donationCampaignSchema');
const { getOllamaHealth } = require('./src/services/ollamaService');
const { processDueQueueNotifications } = require('./src/services/queueTimingService');
const { ensureTodayForHospitals } = require('./src/controllers/dailyQrController');

// Keep failures visible without leaking request data or secrets. Express owns
// request errors; these handlers cover only unexpected background failures.
process.on('unhandledRejection', (reason) => {
  console.error('[Process] Unhandled rejection:', reason instanceof Error ? reason.message : reason);
});
process.on('uncaughtException', (error) => {
  console.error('[Process] Uncaught exception:', error.message);
});


const allowedOrigins = (process.env.ALLOWED_ORIGINS || process.env.FRONTEND_URL || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

// Get local IP addresses for display
const getLocalIPs = () => {
  const { networkInterfaces } = require('os');
  const nets = networkInterfaces();
  const results = [];
  
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        results.push(net.address);
      }
    }
  }
  return results;
};

const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  },
});

// Authenticate the handshake before a socket can subscribe to private rooms.
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Authentication required'));

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);
    if (!user) return next(new Error('Authentication failed'));

    socket.data.user = user;
    if (user.user_type === 'hospital') {
      socket.data.hospital = await Hospital.findByUserId(user.id);
    } else if (user.user_type === 'patient') {
      socket.data.patient = await Patient.findByUserId(user.id);
    }
    return next();
  } catch (_) {
    return next(new Error('Authentication failed'));
  }
});

// Store active connections
const activeConnections = new Map();

// Socket.io for real-time updates
io.on('connection', (socket) => {
  console.log('🟢 New client connected:', socket.id);
  
  activeConnections.set(socket.id, { socket, joinedAt: new Date() });
  socket.join(`user_${socket.data.user.id}`);
  if (socket.data.user.user_type === 'admin') socket.join('admins');
  
  socket.on('join-hospital', () => {
    const hospitalId = socket.data.hospital?.id;
    if (!hospitalId) {
      return socket.emit('socket-error', { message: 'Hospital access required' });
    }
    socket.join(`hospital_${hospitalId}`);
    console.log(`📌 Socket ${socket.id} joined hospital_${hospitalId}`);
  });
  
  socket.on('join-patient', () => {
    const patientId = socket.data.patient?.id;
    if (!patientId) {
      return socket.emit('socket-error', { message: 'Patient access required' });
    }
    socket.join(`patient_${patientId}`);
    console.log(`📌 Socket ${socket.id} joined patient_${patientId}`);
  });
  
  // SOS creation is REST/transaction driven. Accepting a client-created alert
  // here would let a patient select arbitrary hospital rooms or forge details.
  socket.on('emergency-alert', () => {
    socket.emit('socket-error', { message: 'Create SOS requests through the authenticated emergency API' });
  });
  
  socket.on('emergency-location-update', async (data) => {
    const emergencyId = Number(data?.emergencyId);
    const patientId = socket.data.patient?.id;
    const latitude = Number(data?.latitude);
    const longitude = Number(data?.longitude);
    if (!patientId || !Number.isInteger(emergencyId) ||
        !Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
        !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      return socket.emit('socket-error', { message: 'A valid patient emergency location update is required' });
    }
    try {
      // Never accept a patient or hospital id supplied by the socket client.
      // Ownership and the notification room are derived from the stored SOS.
      const result = await pool.query(
        `SELECT hospital_id FROM emergency_requests
         WHERE id = $1 AND patient_id = $2
           AND status NOT IN ('completed', 'resolved', 'cancelled')`,
        [emergencyId, patientId]
      );
      if (!result.rows.length) {
        return socket.emit('socket-error', { message: 'Emergency request not found or no longer active' });
      }
      const payload = {
        emergencyId,
        patientId,
        hospitalId: result.rows[0].hospital_id,
        latitude,
        longitude,
        timestamp: data?.timestamp || new Date().toISOString(),
      };
      if (payload.hospitalId) {
        io.to(`hospital_${payload.hospitalId}`).emit('emergency-location-changed', payload);
      }
      io.to(`patient_${patientId}`).emit('emergency-location-changed', payload);
      console.log(`📍 Emergency location update for emergency #${emergencyId}`);
    } catch (error) {
      console.error('Emergency socket location update failed:', error.message);
      socket.emit('socket-error', { message: 'Unable to update emergency location' });
    }
  });

  socket.on('ambulance-location-update', (data) => {
    if (data?.ambulanceId) {
      io.emit(`ambulance_${data.ambulanceId}_location`, data);
      if (data?.emergencyId) {
        io.emit(`emergency_${data.emergencyId}_ambulance`, data);
      }
      console.log(`🚑 Ambulance #${data.ambulanceId} location updated`);
    }
  });

  // Queue updates are emitted only by the transactional queue API, never by
  // an untrusted client that could otherwise alter another hospital's view.
  socket.on('queue-update', () => socket.emit('socket-error', {
    message: 'Queue updates are published by the server after an API action.',
  }));

  socket.on('appointment-update', (data) => {
    if (data?.hospitalId) {
      io.to(`hospital_${data.hospitalId}`).emit('appointment-changed', data);
    }
    if (data?.patientId) {
      io.to(`patient_${data.patientId}`).emit('appointment-changed', data);
    }
  });

  socket.on('dashboard-update', (data) => {
    const hospitalId = socket.data.hospital?.id || data?.hospitalId;
    if (hospitalId) {
      io.to(`hospital_${hospitalId}`).emit('dashboard-stats-changed', data);
    }
  });

  socket.on('resource-update', (data) => {
    const hospitalId = socket.data.hospital?.id || data?.hospitalId;
    if (hospitalId) {
      io.to(`hospital_${hospitalId}`).emit('resources-changed', data);
      io.emit('global-resources-changed', { hospitalId, ...data });
      console.log(`📊 Resource update sent to hospital_${hospitalId}`);
    }
  });
  
  socket.on('blood-request', (data) => {
    const hospitalId = data?.hospitalId || data?.hospital_id;
    if (hospitalId) {
      io.to(`hospital_${hospitalId}`).emit('new-blood-request', data);
      console.log(`🩸 Blood request sent to hospital_${hospitalId}`);
    }
  });

  socket.on('blood-inventory-update', (data) => {
    const hospitalId = socket.data.hospital?.id || data?.hospitalId;
    if (hospitalId) {
      io.to(`hospital_${hospitalId}`).emit('blood-stock-changed', data);
      io.emit('global-blood-stock-changed', { hospitalId, ...data });
    }
  });
  
  socket.on('disconnect', () => {
    console.log('🔴 Client disconnected:', socket.id);
    activeConnections.delete(socket.id);
  });
});

// Keep the runtime fallback aligned with .env.example and the Flutter client.
// A mismatched default made the CareGuide endpoint unreachable in local runs.
const PORT = Number(process.env.PORT || 5001);
// Explicitly bind all interfaces for Android emulator and LAN-device testing.
// In production this server should be behind an HTTPS reverse proxy/firewall.
const HOST = process.env.HOST || '0.0.0.0';

// Report configuration state without ever exposing credentials.
console.info('[AI CONFIG]');
console.info(`[Config] GEMINI_API_KEY configured: ${Boolean(String(process.env.GEMINI_API_KEY || '').trim())}`);
console.info(`[Config] GEMINI_MODEL: ${process.env.GEMINI_MODEL || '(not configured)'}`);
console.info(`[Config] OLLAMA_BASE_URL: ${process.env.OLLAMA_BASE_URL || '(not configured)'}`);
console.info(`[Config] OLLAMA_MODEL: ${process.env.OLLAMA_MODEL || '(not configured)'}`);
console.info(`[Config] process.cwd(): ${process.cwd()}`);
console.info(`[Config] dotenv path: ${process.env.CAREGUIDE_ENV_PATH || '(not loaded)'}`);

if (!process.env.JWT_SECRET || String(process.env.JWT_SECRET).trim().length < 32) {
  throw new Error('JWT_SECRET must be set to a value at least 32 characters long before starting the server');
}

// Function to ensure database schema is correct
const ensureDatabaseSchema = async () => {
  try {
    console.log('🔧 Checking database schema...');
    
    // Check blood_bank table exists
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'blood_bank'
      );
    `);
    
    if (!tableCheck.rows[0].exists) {
      console.log('📝 Creating blood_bank table...');
      await pool.query(`
        CREATE TABLE IF NOT EXISTS blood_bank (
          id SERIAL PRIMARY KEY,
          hospital_id INTEGER REFERENCES hospitals(id) ON DELETE CASCADE,
          blood_group VARCHAR(10) NOT NULL,
          units_available INTEGER DEFAULT 0,
          minimum_threshold INTEGER DEFAULT 10,
          expiry_date DATE,
          batch_number VARCHAR(50),
          last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(hospital_id, blood_group)
        )
      `);
    }

    // Upgrade existing databases for the enhanced blood-request endpoints.
    await pool.query(`
      ALTER TABLE blood_requests
        ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS urgency_level VARCHAR(50),
        ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    `);
    
    // Check hospital_resources columns
    const columnCheck = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'hospital_resources' 
      AND column_name IN ('updated_at', 'created_at')
    `);
    
    const existingColumns = columnCheck.rows.map(row => row.column_name);
    
    if (!existingColumns.includes('updated_at')) {
      await pool.query(`
        ALTER TABLE hospital_resources 
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      `);
    }
    
    if (!existingColumns.includes('created_at')) {
      await pool.query(`
        ALTER TABLE hospital_resources 
        ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      `);
    }
    
    // Update existing records
    await pool.query(`
      UPDATE hospital_resources 
      SET updated_at = CURRENT_TIMESTAMP 
      WHERE updated_at IS NULL
    `);
    
    // Create or replace trigger
    await pool.query(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
          NEW.updated_at = CURRENT_TIMESTAMP;
          RETURN NEW;
      END;
      $$ language 'plpgsql'
    `);
    
    await pool.query(`
      DROP TRIGGER IF EXISTS update_hospital_resources_updated_at ON hospital_resources;
      CREATE TRIGGER update_hospital_resources_updated_at 
      BEFORE UPDATE ON hospital_resources 
      FOR EACH ROW 
      EXECUTE FUNCTION update_updated_at_column()
    `);
    
    await pool.query(`
      DROP TRIGGER IF EXISTS update_hospitals_updated_at ON hospitals;
      CREATE TRIGGER update_hospitals_updated_at 
      BEFORE UPDATE ON hospitals 
      FOR EACH ROW 
      EXECUTE FUNCTION update_updated_at_column()
    `);
    
    // Ensure resources exist for all hospitals
    await pool.query(`
      INSERT INTO hospital_resources (hospital_id, general_beds_total, general_beds_available)
      SELECT h.id, 0, 0
      FROM hospitals h
      WHERE NOT EXISTS (
        SELECT 1 FROM hospital_resources hr WHERE hr.hospital_id = h.id
      )
    `);
    
    console.log('✅ Database schema verified and updated');
    return true;
  } catch (error) {
    console.error('❌ Schema check failed:', error.message);
    return false;
  }
};

// Start server only after database connection
const startServer = async () => {
  console.log('🔍 Checking database connection...');
  const isDbConnected = await testConnection();

  // Ollama is optional at startup: database-backed directory features remain
  // available while local medical generation is temporarily offline.
  const ollamaHealth = await getOllamaHealth();
  if (ollamaHealth.available) console.info(`[OLLAMA] Ready: ${ollamaHealth.model}`);
  else console.warn('[OLLAMA] Service unavailable; medical generation temporarily unavailable');
  
  if (!isDbConnected && process.env.NODE_ENV === 'production') {
    console.error('❌ Cannot start server: Database connection failed');
    process.exit(1);
  }
  
  if (isDbConnected) {
    await ensureDatabaseSchema();
    await ensureMedicalSchema(pool);
    await ensureDonationCampaignSchema(pool);
    await pool.query(`ALTER TABLE users
      ADD COLUMN IF NOT EXISTS role VARCHAR(50),
      ADD COLUMN IF NOT EXISTS hospital_role VARCHAR(50),
      ADD COLUMN IF NOT EXISTS permissions TEXT[] NOT NULL DEFAULT '{}'::text[],
      ADD COLUMN IF NOT EXISTS hospital_id INTEGER REFERENCES hospitals(id) ON DELETE SET NULL`);
    // Upgrade the legacy user_type check constraint so older databases accept staff.
    await pool.query(`DO $$
    DECLARE constraint_name text;
    BEGIN
      FOR constraint_name IN
        SELECT c.conname
        FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE t.relname = 'users' AND n.nspname = current_schema()
          AND c.contype = 'c' AND pg_get_constraintdef(c.oid) ILIKE '%user_type%'
      LOOP
        EXECUTE format('ALTER TABLE users DROP CONSTRAINT %I', constraint_name);
      END LOOP;
      ALTER TABLE users ADD CONSTRAINT users_user_type_check
        CHECK (user_type IN ('patient', 'hospital', 'admin', 'staff'));
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;`);
    await pool.query(`CREATE TABLE IF NOT EXISTS roles (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) UNIQUE NOT NULL,
      description TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);
    await pool.query(`CREATE TABLE IF NOT EXISTS staff_activity_log (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      hospital_id INTEGER REFERENCES hospitals(id) ON DELETE CASCADE,
      action VARCHAR(100) NOT NULL,
      details JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);
    await pool.query(`INSERT INTO roles (name, description) VALUES
      ('doctor', 'Hospital doctor access'),
      ('nurse', 'Hospital nursing access'),
      ('frontdesk', 'Front desk and scheduling access'),
      ('billing', 'Billing and records access'),
      ('hospital_admin', 'Hospital admin access'),
      ('super_admin', 'System administrator access')
      ON CONFLICT (name) DO NOTHING`);
    await pool.query(`ALTER TABLE doctors ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE SET NULL`);
    await pool.query(`ALTER TABLE doctors ADD COLUMN IF NOT EXISTS designation TEXT, ADD COLUMN IF NOT EXISTS department TEXT, ADD COLUMN IF NOT EXISTS experience_display TEXT, ADD COLUMN IF NOT EXISTS registration_number TEXT, ADD COLUMN IF NOT EXISTS availability TEXT, ADD COLUMN IF NOT EXISTS profile_image TEXT, ADD COLUMN IF NOT EXISTS bio TEXT, ADD COLUMN IF NOT EXISTS verification_status VARCHAR(80) DEFAULT 'HOSPITAL_CONFIRMATION_REQUIRED', ADD COLUMN IF NOT EXISTS source_url TEXT, ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_doctors_hospital_name_normalized ON doctors (hospital_id, lower(regexp_replace(name, '[^a-zA-Z0-9]', '', 'g')))`);
    // Older databases stored a doctor name only. The booking controller uses the
    // real doctor relationship, so upgrade those installations safely on startup.
    await pool.query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS doctor_id INTEGER REFERENCES doctors(id) ON DELETE SET NULL`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_appointments_doctor_schedule ON appointments (doctor_id, appointment_date, appointment_time)`);
    await pool.query(`ALTER TABLE hospitals ADD COLUMN IF NOT EXISTS area VARCHAR(100), ADD COLUMN IF NOT EXISTS country VARCHAR(100), ADD COLUMN IF NOT EXISTS hospital_type VARCHAR(100), ADD COLUMN IF NOT EXISTS departments TEXT[] NOT NULL DEFAULT '{}', ADD COLUMN IF NOT EXISTS specialties TEXT[] NOT NULL DEFAULT '{}', ADD COLUMN IF NOT EXISTS services TEXT[] NOT NULL DEFAULT '{}', ADD COLUMN IF NOT EXISTS emergency_available BOOLEAN NOT NULL DEFAULT FALSE, ADD COLUMN IF NOT EXISTS directory_visible BOOLEAN NOT NULL DEFAULT FALSE`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_hospitals_coordinates ON hospitals(latitude, longitude) WHERE latitude IS NOT NULL AND longitude IS NOT NULL`);
    await pool.query(`UPDATE users u SET hospital_id = d.hospital_id FROM doctors d WHERE d.user_id = u.id AND u.hospital_id IS NULL`);
  }

  server.listen(PORT, HOST, () => {
    // The database persists ETA state and notification de-duplication; this
    // worker is safe to rerun after a process restart or on multiple servers.
    const processQueueNotifications = () => processDueQueueNotifications({ io }).catch(error => console.error('[Queue ETA worker]', error.message));
    processQueueNotifications();
    setInterval(processQueueNotifications, 60_000).unref();
    // Daily QR records are also lazily created by the protected endpoint.
    // This worker pre-generates them after a restart and around midnight.
    const rotateDailyQrs = () => ensureTodayForHospitals().catch(error => console.error('[Daily QR worker]', error.message));
    rotateDailyQrs();
    setInterval(rotateDailyQrs, 60 * 60_000).unref();
    console.log(`\n🚀 Server running on port ${PORT}`);
    console.log(`🧭 Listening host: ${HOST}`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`\n📡 Access URLs:`);
    console.log(`   Local: http://localhost:${PORT}`);
    console.log(`   Local: http://127.0.0.1:${PORT}`);

    const ips = getLocalIPs();
    if (ips.length > 0) {
      console.log(`\n📡 Network Access:`);
      ips.forEach(ip => {
        console.log(`   ${ip}: http://${ip}:${PORT}`);
      });
    }

    console.log(`\n📡 Socket.IO:`);
    console.log(`   ws://localhost:${PORT}/socket.io/`);
    ips.forEach(ip => {
      console.log(`   ${ip}: ws://${ip}:${PORT}/socket.io/`);
    });

    if (!isDbConnected) {
      console.warn('\n⚠️  Running without database connection (development mode)');
    } else {
      console.log('\n✅ Database connected');
    }

    if (process.env.NODE_ENV === 'production') {
      if (process.env.DB_PASSWORD === 'db1234') {
        console.warn('⚠️  SECURITY WARNING: Default development DB password in production!');
      }
      if (!process.env.JWT_SECRET || process.env.JWT_SECRET.includes('ChangeThisToYourOwn')) {
        console.warn('⚠️  SECURITY WARNING: Default or weak JWT_SECRET detected in production!');
      }
    }
    console.log('');
  });
};

startServer();

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('\n🛑 SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('✅ HTTP server closed');
    pool.end();
    console.log('✅ Database connection closed');
    process.exit(0);
  });
});
// Controllers publish only after their database transaction commits. Keeping
// the instance on Express avoids a circular server/controller dependency.
app.set('io', io);

process.on('SIGINT', () => {
  console.log('\n🛑 SIGINT signal received: closing HTTP server');
  server.close(() => {
    console.log('✅ HTTP server closed');
    pool.end();
    console.log('✅ Database connection closed');
    process.exit(0);
  });
});

module.exports = { server, io };
