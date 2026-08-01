// setup-db.js
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'hospital_resource_db',
});

// Tables in correct order (dependencies first)
const createTablesSQL = `
-- ============================================================
-- 1. USERS TABLE (Base table - no dependencies)
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  phone VARCHAR(20),
  password_hash VARCHAR(255) NOT NULL,
  user_type VARCHAR(50) CHECK (user_type IN ('patient', 'hospital', 'admin')) NOT NULL,
  is_verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 2. PATIENTS TABLE (depends on users)
-- ============================================================
CREATE TABLE IF NOT EXISTS patients (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  date_of_birth DATE,
  blood_group VARCHAR(5),
  emergency_contact VARCHAR(20),
  emergency_contact_name VARCHAR(255),
  allergies TEXT,
  chronic_conditions TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 3. HOSPITALS TABLE (depends on users)
-- ============================================================
CREATE TABLE IF NOT EXISTS hospitals (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  registration_number VARCHAR(100) UNIQUE NOT NULL,
  address TEXT NOT NULL,
  city VARCHAR(100),
  state VARCHAR(100),
  pincode VARCHAR(10),
  phone VARCHAR(20),
  email VARCHAR(255),
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  is_verified BOOLEAN DEFAULT FALSE,
  verification_status VARCHAR(50) DEFAULT 'pending',
  rating DECIMAL(3, 2) DEFAULT 0,
  total_reviews INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 4. HOSPITAL RESOURCES TABLE (depends on hospitals)
-- ============================================================
CREATE TABLE IF NOT EXISTS hospital_resources (
  id SERIAL PRIMARY KEY,
  hospital_id INTEGER REFERENCES hospitals(id) ON DELETE CASCADE,
  general_beds_total INTEGER DEFAULT 0,
  general_beds_available INTEGER DEFAULT 0,
  icu_beds_total INTEGER DEFAULT 0,
  icu_beds_available INTEGER DEFAULT 0,
  ventilators_total INTEGER DEFAULT 0,
  ventilators_available INTEGER DEFAULT 0,
  oxygen_supported_beds_total INTEGER DEFAULT 0,
  oxygen_supported_beds_available INTEGER DEFAULT 0,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 5. DOCTORS TABLE (depends on hospitals)
-- ============================================================
CREATE TABLE IF NOT EXISTS doctors (
  id SERIAL PRIMARY KEY,
  hospital_id INTEGER REFERENCES hospitals(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  specialization VARCHAR(255),
  qualification TEXT,
  experience_years INTEGER,
  availability_status BOOLEAN DEFAULT TRUE,
  consultation_fee DECIMAL(10, 2),
  phone VARCHAR(20),
  email VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 6. APPOINTMENTS TABLE (depends on patients, hospitals, doctors)
-- ============================================================
CREATE TABLE IF NOT EXISTS appointments (
  id SERIAL PRIMARY KEY,
  patient_id INTEGER REFERENCES patients(id) ON DELETE CASCADE,
  hospital_id INTEGER REFERENCES hospitals(id) ON DELETE CASCADE,
  doctor_id INTEGER REFERENCES doctors(id),
  appointment_date DATE NOT NULL,
  appointment_time TIME NOT NULL,
  status VARCHAR(50) DEFAULT 'pending',
  symptoms TEXT,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 7. EMERGENCY REQUESTS TABLE (depends on patients, hospitals)
-- ============================================================
CREATE TABLE IF NOT EXISTS emergency_requests (
  id SERIAL PRIMARY KEY,
  patient_id INTEGER REFERENCES patients(id) ON DELETE CASCADE,
  hospital_id INTEGER REFERENCES hospitals(id),
  ambulance_id INTEGER,
  emergency_type VARCHAR(100),
  severity VARCHAR(50),
  description TEXT,
  location_lat DECIMAL(10, 8),
  location_lng DECIMAL(11, 8),
  status VARCHAR(50) DEFAULT 'pending',
  assigned_at TIMESTAMP,
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 8. BLOOD BANK TABLE (depends on hospitals)
-- ============================================================
CREATE TABLE IF NOT EXISTS blood_bank (
  id SERIAL PRIMARY KEY,
  hospital_id INTEGER REFERENCES hospitals(id) ON DELETE CASCADE,
  blood_group VARCHAR(5) NOT NULL,
  units_available INTEGER DEFAULT 0,
  minimum_threshold INTEGER DEFAULT 10,
  last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(hospital_id, blood_group)
);

-- ============================================================
-- 9. BLOOD REQUESTS TABLE (depends on patients, hospitals)
-- ============================================================
CREATE TABLE IF NOT EXISTS blood_requests (
  id SERIAL PRIMARY KEY,
  patient_id INTEGER REFERENCES patients(id),
  hospital_id INTEGER REFERENCES hospitals(id),
  blood_group VARCHAR(5) NOT NULL,
  units_required INTEGER NOT NULL,
  status VARCHAR(50) DEFAULT 'pending',
  patient_name VARCHAR(255),
  hospital_address TEXT,
  request_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  fulfilled_date TIMESTAMP
);

-- ============================================================
-- 10. AMBULANCES TABLE (depends on hospitals)
-- ============================================================
CREATE TABLE IF NOT EXISTS ambulances (
  id SERIAL PRIMARY KEY,
  hospital_id INTEGER REFERENCES hospitals(id),
  vehicle_number VARCHAR(50) UNIQUE NOT NULL,
  driver_name VARCHAR(255),
  driver_phone VARCHAR(20),
  type VARCHAR(50),
  is_available BOOLEAN DEFAULT TRUE,
  is_private BOOLEAN DEFAULT FALSE,
  current_location_lat DECIMAL(10, 8),
  current_location_lng DECIMAL(11, 8),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 11. AMBULANCE BOOKINGS TABLE (depends on patients, users, ambulances)
-- ============================================================
CREATE TABLE IF NOT EXISTS ambulance_bookings (
  id SERIAL PRIMARY KEY,
  patient_id INTEGER REFERENCES patients(id) ON DELETE SET NULL,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  ambulance_id INTEGER REFERENCES ambulances(id) ON DELETE SET NULL,
  pickup_lat DECIMAL(10, 8),
  pickup_lng DECIMAL(11, 8),
  pickup_address TEXT,
  patient_condition TEXT,
  special_requirements TEXT,
  patient_phone VARCHAR(20),
  patient_name VARCHAR(255),
  status VARCHAR(50) DEFAULT 'pending',
  assigned_at TIMESTAMP,
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 12. RESOURCE REQUESTS TABLE (depends on patients, users, hospitals)
-- ============================================================
CREATE TABLE IF NOT EXISTS resource_requests (
  id SERIAL PRIMARY KEY,
  patient_id INTEGER REFERENCES patients(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  hospital_id INTEGER REFERENCES hospitals(id) ON DELETE CASCADE,
  resource_type VARCHAR(50) NOT NULL,
  quantity INTEGER DEFAULT 1,
  description TEXT,
  status VARCHAR(50) DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  fulfilled_at TIMESTAMP,
  rejected_at TIMESTAMP
);

-- ============================================================
-- 13. NOTIFICATIONS TABLE (depends on users)
-- ============================================================
CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255),
  message TEXT,
  type VARCHAR(50),
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 14. CREATE INDEXES FOR BETTER PERFORMANCE
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_user_type ON users(user_type);
CREATE INDEX IF NOT EXISTS idx_hospitals_city ON hospitals(city);
CREATE INDEX IF NOT EXISTS idx_hospitals_verification_status ON hospitals(verification_status);
CREATE INDEX IF NOT EXISTS idx_appointments_patient_id ON appointments(patient_id);
CREATE INDEX IF NOT EXISTS idx_appointments_hospital_id ON appointments(hospital_id);
CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(appointment_date);
CREATE INDEX IF NOT EXISTS idx_emergency_requests_status ON emergency_requests(status);
CREATE INDEX IF NOT EXISTS idx_resource_requests_user_id ON resource_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_resource_requests_hospital_id ON resource_requests(hospital_id);
CREATE INDEX IF NOT EXISTS idx_resource_requests_status ON resource_requests(status);
CREATE INDEX IF NOT EXISTS idx_ambulance_bookings_user_id ON ambulance_bookings(user_id);
CREATE INDEX IF NOT EXISTS idx_ambulance_bookings_status ON ambulance_bookings(status);
CREATE INDEX IF NOT EXISTS idx_blood_requests_hospital_id ON blood_requests(hospital_id);
CREATE INDEX IF NOT EXISTS idx_blood_requests_status ON blood_requests(status);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
`;

async function setupDatabase() {
  try {
    console.log('📋 Creating database tables...');
    
    // Split SQL into individual statements (in case of any issues)
    await pool.query(createTablesSQL);
    
    console.log('✅ All tables created successfully!');
    console.log('📊 Tables created:');
    
    // List all tables
    const result = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    
    result.rows.forEach(row => {
      console.log(`  - ${row.table_name}`);
    });
    
    await pool.end();
  } catch (error) {
    console.error('❌ Error creating tables:', error.message);
    console.log('💡 Tip: Make sure the database exists. Run: CREATE DATABASE hospital_resource_db;');
    await pool.end();
    process.exit(1);
  }
}

setupDatabase();