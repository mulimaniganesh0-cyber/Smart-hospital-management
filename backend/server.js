// server.js
require('dotenv').config();
const app = require('./src/app');
const http = require('http');
const socketIo = require('socket.io');
const bcrypt = require('bcryptjs');
const { pool, testConnection } = require('./src/config/database');
const jwt = require('jsonwebtoken');
const User = require('./src/models/User');
const Hospital = require('./src/models/Hospital');
const Patient = require('./src/models/Patient');
const { ensureMedicalSchema } = require('./src/config/medicalSchema');
const { ensureDonationCampaignSchema } = require('./src/config/donationCampaignSchema');
const { ensureBloodInventoryBatchSchema } = require('./src/config/bloodInventoryBatchSchema');
const { getOllamaHealth } = require('./src/services/ollamaService');
const { processDueQueueNotifications } = require('./src/services/queueTimingService');
const { ensureTodayForHospitals } = require('./src/controllers/dailyQrController');
const { canAccessAssignment } = require('./src/services/driverWorkflowService');
const { registerServerPublishedEventGuards } = require('./src/services/socketClientEventPolicy');
const { getJwtSecret, assertJwtSecretConfigured } = require('./src/config/jwt');

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

const ensureStartupAdmin = async () => {
  const configuredEmails = process.env.ADMIN_EMAILS;
  const password = process.env.ADMIN_PASSWORD;
  if (!configuredEmails || !password) {
    return;
  }

  const adminEmails = configuredEmails
    .split(',')
    .map((email) => email.trim())
    .filter(Boolean);

  if (!adminEmails.length) {
    return;
  }

  for (const email of adminEmails) {
    const name = email.split('@')[0] || 'Admin';
    const passwordHash = await bcrypt.hash(password, 12);
    await pool.query(
      `INSERT INTO users (name, email, phone, password_hash, user_type, is_verified, account_status, created_at, updated_at)
       VALUES ($1, $2, '', $3, 'admin', TRUE, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT (email) DO NOTHING`,
      [name, email, passwordHash]
    );
  }
};

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
    // Keep realtime requests under the same origin policy as Express. An
    // empty origin array rejects every browser origin, including local dev.
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (process.env.NODE_ENV !== 'production' &&
          allowedOrigins.length === 0 &&
          /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
        return callback(null, true);
      }
      return callback(null, allowedOrigins.includes(origin));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  },
});

// Authenticate the handshake before a socket can subscribe to private rooms.
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Authentication required'));

    const decoded = jwt.verify(token, getJwtSecret());
    const user = await User.findById(decoded.id);
    if (!user) return next(new Error('Authentication failed'));
    if (user.account_status && user.account_status !== 'ACTIVE') return next(new Error('Account is not active'));
    if (user.role === 'ambulance_driver' && (user.driver_status !== 'active' || !['hospital_driver','private_driver'].includes(user.driver_type))) return next(new Error('Driver is not authorized'));

    socket.data.user = user;
    socket.data.tokenExpiresAt = decoded.exp ? decoded.exp * 1000 : null;
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
  // Drivers join assignment-specific rooms only after a fresh ownership check.
  if (socket.data.user.role !== 'ambulance_driver') socket.join(`user_${socket.data.user.id}`);
  else socket.join(`driver_${socket.data.user.id}`);
  if (socket.data.tokenExpiresAt) {
    const expiresIn = Math.max(0, socket.data.tokenExpiresAt - Date.now());
    const expiryTimer = setTimeout(() => socket.disconnect(true), expiresIn);
    expiryTimer.unref?.();
    socket.once('disconnect', () => clearTimeout(expiryTimer));
  }
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

  // Contract: assignment:subscribe {type: "emergency"|"booking", id: number}.
  // Room names are derived only after checking the authenticated participant
  // against current database assignment records.
  socket.on('assignment:subscribe', async (data = {}) => {
    const type = String(data.type || '');
    const id = Number(data.id);
    if (!['emergency','booking'].includes(type) || !Number.isSafeInteger(id) || id < 1) {
      return socket.emit('socket-error', { message: 'Valid assignment type and id are required' });
    }
    try {
      const socketUser = { ...socket.data.user, patient_id: socket.data.patient?.id, hospital_id: socket.data.hospital?.id };
      const assignment = type === 'emergency'
        ? await pool.query(`SELECT e.assigned_driver_user_id,e.patient_id,COALESCE(e.accepting_hospital_id,e.hospital_id) hospital_id,e.status
            FROM emergency_requests e JOIN users d ON d.id=e.assigned_driver_user_id AND d.role='ambulance_driver' AND d.driver_status='active' AND d.account_status='ACTIVE'
            JOIN ambulances a ON a.id=e.ambulance_id AND a.driver_user_id=d.id AND a.is_active=TRUE
            WHERE e.id=$1 AND e.status NOT IN ('completed','resolved','cancelled')`, [id])
        : await pool.query(`SELECT b.driver_user_id,b.patient_id,b.hospital_id,b.status
            FROM ambulance_bookings b JOIN users d ON d.id=b.driver_user_id AND d.role='ambulance_driver' AND d.driver_status='active' AND d.account_status='ACTIVE'
            JOIN ambulances a ON a.id=b.ambulance_id AND a.driver_user_id=d.id AND a.is_active=TRUE
            WHERE b.id=$1 AND b.status NOT IN ('completed','cancelled')`, [id]);
      const row = assignment.rows[0];
      if (!row) return socket.emit('socket-error', { message: 'Active assignment not found' });
      if (!canAccessAssignment(socketUser,row)) return socket.emit('socket-error', { message: 'Not authorized for this assignment' });
      socket.join(`${type}_assignment_${id}`);
      socket.emit('assignment:subscribed', { type, id });
    } catch (error) {
      console.error('Assignment subscription check failed:', error.message);
      socket.emit('socket-error', { message: 'Unable to authorize assignment subscription' });
    }
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
    const fixTime = data?.timestamp ? new Date(data.timestamp) : new Date();
    const accuracy = data?.accuracy == null ? null : Number(data.accuracy);
    if (!patientId || !Number.isInteger(emergencyId) ||
        !Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
        !Number.isFinite(longitude) || longitude < -180 || longitude > 180 ||
        (accuracy != null && (!Number.isFinite(accuracy) || accuracy < 0 || accuracy > 10000)) ||
        Number.isNaN(fixTime.getTime()) || fixTime > new Date(Date.now()+30000) || Date.now()-fixTime.getTime()>120000) {
      return socket.emit('socket-error', { message: 'A valid patient emergency location update is required' });
    }
    try {
      // Never accept a patient or hospital id supplied by the socket client.
      // Ownership and the notification room are derived from the stored SOS.
      const result = await pool.query(
        `SELECT COALESCE(accepting_hospital_id,hospital_id) hospital_id,assigned_driver_user_id,status,patient_location_updated_at
         FROM emergency_requests WHERE id = $1 AND patient_id = $2
           AND status NOT IN ('completed', 'resolved', 'cancelled')`,
        [emergencyId, patientId]
      );
      if (!result.rows.length) {
        return socket.emit('socket-error', { message: 'Emergency request not found or no longer active' });
      }
      if (result.rows[0].patient_location_updated_at && Date.now()-new Date(result.rows[0].patient_location_updated_at).getTime()<3000) return socket.emit('socket-error',{message:'Location updates are arriving too quickly'});
      const payload = {
        emergencyId,
        patientId,
        hospitalId: result.rows[0].hospital_id,
        latitude,
        longitude,
        timestamp: new Date().toISOString(),
        accuracy: Number.isFinite(Number(data?.accuracy)) && Number(data.accuracy) >= 0 ? Number(data.accuracy) : null,
      };
      const persisted=await pool.query(`UPDATE emergency_requests SET location_lat=$1,location_lng=$2,location_accuracy=$3,location_timestamp=CURRENT_TIMESTAMP,patient_location_updated_at=CURRENT_TIMESTAMP WHERE id=$4 AND patient_id=$5 AND patient_location_sharing=TRUE AND status NOT IN ('completed','resolved','cancelled') AND (patient_location_updated_at IS NULL OR patient_location_updated_at<CURRENT_TIMESTAMP-INTERVAL '3 seconds') RETURNING patient_location_updated_at`, [latitude,longitude,accuracy,emergencyId,patientId]);
      if(!persisted.rowCount)return socket.emit('socket-error',{message:'Location sharing is unavailable or updates are arriving too quickly'});
      payload.accuracy=accuracy;
      payload.timestamp=persisted.rows[0].patient_location_updated_at;
      io.to(`emergency_assignment_${emergencyId}`).emit('patient:location_updated', payload);
      if (result.rows[0].assigned_driver_user_id) io.to(`driver_${result.rows[0].assigned_driver_user_id}`).emit('patient:location_updated', payload);
      if (payload.hospitalId) {
        io.to(`hospital_${payload.hospitalId}`).emit('emergency-location-changed', payload);
      }
      io.to(`patient_${patientId}`).emit('emergency-location-changed', payload);
      // Deliberately omit coordinates from application logs.
    } catch (error) {
      console.error('Emergency socket location update failed:', error.message);
      socket.emit('socket-error', { message: 'Unable to update emergency location' });
    }
  });

  // Ambulance location is accepted only through the authenticated driver REST
  // endpoint, which verifies the active driver/ambulance/emergency assignment
  // and emits only to the assigned patient, driver, and hospital rooms.
  socket.on('ambulance-location-update', () => socket.emit('socket-error', {
    message: 'Submit ambulance location through the authenticated driver API.',
  }));

  // Queue updates are emitted only by the transactional queue API, never by
  // an untrusted client that could otherwise alter another hospital's view.
  socket.on('queue-update', () => socket.emit('socket-error', {
    message: 'Queue updates are published by the server after an API action.',
  }));
  registerServerPublishedEventGuards(socket);
  
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
if (process.env.NODE_ENV === 'production' && String(process.env.JWT_SECRET).includes('ChangeThisToYourOwn')) {
  throw new Error('Replace the placeholder JWT_SECRET before starting the server in production');
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

    // `initDB` creates the compact aggregate inventory table. Older versions
    // of this startup path only added expiry columns when the table was absent,
    // so databases initialized through `initDB` crashed in the add-expiry API.
    await pool.query(`
      ALTER TABLE blood_bank
        ADD COLUMN IF NOT EXISTS expiry_date DATE,
        ADD COLUMN IF NOT EXISTS batch_number VARCHAR(50),
        ADD COLUMN IF NOT EXISTS donation_date DATE,
        ADD COLUMN IF NOT EXISTS donor_name VARCHAR(255),
        ADD COLUMN IF NOT EXISTS donor_phone VARCHAR(30),
        ADD COLUMN IF NOT EXISTS minimum_threshold INTEGER DEFAULT 10,
        ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS blood_expiry_notifications (
        id SERIAL PRIMARY KEY,
        hospital_id INTEGER NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
        blood_group VARCHAR(5) NOT NULL,
        units_affected NUMERIC(8,2) NOT NULL DEFAULT 0,
        expiry_date DATE NOT NULL,
        notification_type VARCHAR(20) NOT NULL CHECK (notification_type IN ('critical','warning')),
        message TEXT NOT NULL,
        is_read BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await pool.query(`
      ALTER TABLE blood_expiry_notifications
        ADD COLUMN IF NOT EXISTS hospital_id INTEGER REFERENCES hospitals(id) ON DELETE CASCADE,
        ADD COLUMN IF NOT EXISTS blood_group VARCHAR(5),
        ADD COLUMN IF NOT EXISTS units_affected NUMERIC(8,2) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS expiry_date DATE,
        ADD COLUMN IF NOT EXISTS notification_type VARCHAR(20),
        ADD COLUMN IF NOT EXISTS message TEXT,
        ADD COLUMN IF NOT EXISTS is_read BOOLEAN NOT NULL DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_blood_expiry_notifications_hospital
      ON blood_expiry_notifications(hospital_id, created_at DESC)`);

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
  assertJwtSecretConfigured();
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

  if (typeof process.env.JWT_SECRET === 'undefined' || !String(process.env.JWT_SECRET).trim()) {
    console.warn('[Auth] JWT_SECRET is not set; using an in-memory development fallback. Set it in your environment before production use.');
  }
  
  if (isDbConnected) {
    await ensureDatabaseSchema();
    await ensureMedicalSchema(pool);
    await ensureDonationCampaignSchema(pool);
    await ensureBloodInventoryBatchSchema(pool);
    await pool.query(`ALTER TABLE users
      ADD COLUMN IF NOT EXISTS role VARCHAR(50),
      ADD COLUMN IF NOT EXISTS hospital_role VARCHAR(50),
      ADD COLUMN IF NOT EXISTS permissions TEXT[] NOT NULL DEFAULT '{}'::text[],
      ADD COLUMN IF NOT EXISTS hospital_id INTEGER REFERENCES hospitals(id) ON DELETE SET NULL`);
    try {
      await ensureStartupAdmin();
    } catch (error) {
      console.error('[Startup] Failed to ensure default admin accounts:', error.message);
    }
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
        CHECK (user_type IN ('patient', 'hospital', 'admin', 'staff', 'doctor'));
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
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS account_status VARCHAR(40) NOT NULL DEFAULT 'ACTIVE', ADD COLUMN IF NOT EXISTS password_reset_required BOOLEAN NOT NULL DEFAULT FALSE`);
    await pool.query(`ALTER TABLE doctors ADD COLUMN IF NOT EXISTS account_activation_status VARCHAR(40) NOT NULL DEFAULT 'EMAIL_REQUIRED'`);
    await pool.query(`ALTER TABLE doctors ADD COLUMN IF NOT EXISTS designation TEXT, ADD COLUMN IF NOT EXISTS department TEXT, ADD COLUMN IF NOT EXISTS experience_display TEXT, ADD COLUMN IF NOT EXISTS registration_number TEXT, ADD COLUMN IF NOT EXISTS availability TEXT, ADD COLUMN IF NOT EXISTS profile_image TEXT, ADD COLUMN IF NOT EXISTS bio TEXT, ADD COLUMN IF NOT EXISTS verification_status VARCHAR(80) DEFAULT 'HOSPITAL_CONFIRMATION_REQUIRED', ADD COLUMN IF NOT EXISTS source_url TEXT, ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_doctors_hospital_name_normalized ON doctors (hospital_id, lower(regexp_replace(name, '[^a-zA-Z0-9]', '', 'g')))`);
    // Older databases stored a doctor name only. The booking controller uses the
    // real doctor relationship, so upgrade those installations safely on startup.
    await pool.query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS doctor_id INTEGER REFERENCES doctors(id) ON DELETE SET NULL`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_appointments_doctor_schedule ON appointments (doctor_id, appointment_date, appointment_time)`);
    await pool.query(`ALTER TABLE hospitals ADD COLUMN IF NOT EXISTS area VARCHAR(100), ADD COLUMN IF NOT EXISTS country VARCHAR(100), ADD COLUMN IF NOT EXISTS hospital_type VARCHAR(100), ADD COLUMN IF NOT EXISTS departments TEXT[] NOT NULL DEFAULT '{}', ADD COLUMN IF NOT EXISTS specialties TEXT[] NOT NULL DEFAULT '{}', ADD COLUMN IF NOT EXISTS services TEXT[] NOT NULL DEFAULT '{}', ADD COLUMN IF NOT EXISTS emergency_available BOOLEAN NOT NULL DEFAULT FALSE, ADD COLUMN IF NOT EXISTS directory_visible BOOLEAN NOT NULL DEFAULT FALSE`);
    await pool.query(`ALTER TABLE hospitals ADD COLUMN IF NOT EXISTS google_formatted_address TEXT, ADD COLUMN IF NOT EXISTS google_latitude DECIMAL(10, 8), ADD COLUMN IF NOT EXISTS google_longitude DECIMAL(11, 8), ADD COLUMN IF NOT EXISTS navigation_point_token TEXT, ADD COLUMN IF NOT EXISTS navigation_point_name TEXT, ADD COLUMN IF NOT EXISTS navigation_point_type VARCHAR(50), ADD COLUMN IF NOT EXISTS navigation_verified BOOLEAN NOT NULL DEFAULT FALSE, ADD COLUMN IF NOT EXISTS location_verified BOOLEAN NOT NULL DEFAULT FALSE, ADD COLUMN IF NOT EXISTS location_source VARCHAR(50), ADD COLUMN IF NOT EXISTS location_updated_at TIMESTAMP`);
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

if (require.main === module) {
  startServer().catch(async (error) => {
    console.error('[Startup] Server initialization failed:', error.message);
    await pool.end().catch(() => {});
    process.exitCode = 1;
  });
}

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
