// server.js
const app = require('./src/app');
const http = require('http');
const socketIo = require('socket.io');
const { pool, testConnection } = require('./src/config/database');
const jwt = require('jsonwebtoken');
const User = require('./src/models/User');
const Hospital = require('./src/models/Hospital');
const Patient = require('./src/models/Patient');
const { ensureMedicalSchema } = require('./src/config/medicalSchema');

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
  
  socket.on('emergency-alert', (data) => {
    if (!socket.data.patient) {
      return socket.emit('socket-error', { message: 'Patient authentication required' });
    }
    const targetHospital = data?.hospitalId || data?.hospital_id;
    if (targetHospital) {
      io.to(`hospital_${targetHospital}`).emit('new-emergency', data);
      console.log(`🚨 Emergency alert sent to hospital_${targetHospital}`);
    } else {
      // Broadcast to all hospitals if no specific hospital target
      io.emit('new-emergency', data);
      console.log(`🚨 Emergency alert broadcasted globally`);
    }
  });
  
  socket.on('emergency-location-update', (data) => {
    if (data?.emergencyId) {
      if (data?.hospitalId) {
        io.to(`hospital_${data.hospitalId}`).emit('emergency-location-changed', data);
      }
      if (data?.patientId) {
        io.to(`patient_${data.patientId}`).emit('emergency-location-changed', data);
      }
      io.emit(`emergency_${data.emergencyId}_location`, data);
      console.log(`📍 Emergency location update for emergency #${data.emergencyId}`);
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

  socket.on('queue-update', (data) => {
    if (data?.hospitalId) {
      io.to(`hospital_${data.hospitalId}`).emit('queue-changed', data);
    }
    if (data?.patientId) {
      io.to(`patient_${data.patientId}`).emit('queue-changed', data);
    }
  });

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

const PORT = process.env.PORT || 5000;

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
  
  if (!isDbConnected && process.env.NODE_ENV === 'production') {
    console.error('❌ Cannot start server: Database connection failed');
    process.exit(1);
  }
  
  if (isDbConnected) {
    await ensureDatabaseSchema();
    await ensureMedicalSchema(pool);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS hospital_id INTEGER REFERENCES hospitals(id) ON DELETE SET NULL`);
    await pool.query(`ALTER TABLE doctors ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE SET NULL`);
    // Older databases stored a doctor name only. The booking controller uses the
    // real doctor relationship, so upgrade those installations safely on startup.
    await pool.query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS doctor_id INTEGER REFERENCES doctors(id) ON DELETE SET NULL`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_appointments_doctor_schedule ON appointments (doctor_id, appointment_date, appointment_time)`);
    await pool.query(`ALTER TABLE hospitals ADD COLUMN IF NOT EXISTS area VARCHAR(100), ADD COLUMN IF NOT EXISTS country VARCHAR(100), ADD COLUMN IF NOT EXISTS hospital_type VARCHAR(100), ADD COLUMN IF NOT EXISTS departments TEXT[] NOT NULL DEFAULT '{}', ADD COLUMN IF NOT EXISTS specialties TEXT[] NOT NULL DEFAULT '{}', ADD COLUMN IF NOT EXISTS services TEXT[] NOT NULL DEFAULT '{}', ADD COLUMN IF NOT EXISTS emergency_available BOOLEAN NOT NULL DEFAULT FALSE`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_hospitals_coordinates ON hospitals(latitude, longitude) WHERE latitude IS NOT NULL AND longitude IS NOT NULL`);
    await pool.query(`UPDATE users u SET hospital_id = d.hospital_id FROM doctors d WHERE d.user_id = u.id AND u.hospital_id IS NULL`);
  }
  
  server.listen(PORT, () => {
    console.log(`\n🚀 Server running on port ${PORT}`);
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
