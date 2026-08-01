// src/config/initDB.js
const { pool } = require('./database');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const createTables = async () => {
  const queries = [
    // Users table
    `CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      phone VARCHAR(20),
      password_hash VARCHAR(255) NOT NULL,
      user_type VARCHAR(50) CHECK (user_type IN ('patient', 'hospital', 'admin')) NOT NULL,
      is_verified BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,

    // Hospitals table
    `CREATE TABLE IF NOT EXISTS hospitals (
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
    )`,

    // Hospital Resources table
    `CREATE TABLE IF NOT EXISTS hospital_resources (
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
    )`,

    // Patients table
    `CREATE TABLE IF NOT EXISTS patients (
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
    )`,

    // Doctors table
    `CREATE TABLE IF NOT EXISTS doctors (
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
    )`,

    // Appointments table
    `CREATE TABLE IF NOT EXISTS appointments (
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
    )`,

    // Emergency Requests table
    `CREATE TABLE IF NOT EXISTS emergency_requests (
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
    )`,

    // Blood Bank table
    `CREATE TABLE IF NOT EXISTS blood_bank (
      id SERIAL PRIMARY KEY,
      hospital_id INTEGER REFERENCES hospitals(id) ON DELETE CASCADE,
      blood_group VARCHAR(5) NOT NULL,
      units_available INTEGER DEFAULT 0,
      minimum_threshold INTEGER DEFAULT 10,
      last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(hospital_id, blood_group)
    )`,

    // Ambulances table
    `CREATE TABLE IF NOT EXISTS ambulances (
      id SERIAL PRIMARY KEY,
      hospital_id INTEGER REFERENCES hospitals(id),
      vehicle_number VARCHAR(50) UNIQUE NOT NULL,
      driver_name VARCHAR(255),
      driver_phone VARCHAR(20),
      type VARCHAR(50),
      is_available BOOLEAN DEFAULT TRUE,
      current_location_lat DECIMAL(10, 8),
      current_location_lng DECIMAL(11, 8),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,

    // Blood Requests table
    `CREATE TABLE IF NOT EXISTS blood_requests (
      id SERIAL PRIMARY KEY,
      patient_id INTEGER REFERENCES patients(id),
      hospital_id INTEGER REFERENCES hospitals(id),
      blood_group VARCHAR(5) NOT NULL,
      units_required INTEGER NOT NULL,
      status VARCHAR(50) DEFAULT 'pending',
      request_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      fulfilled_date TIMESTAMP
    )`,

    // Notifications table
    `CREATE TABLE IF NOT EXISTS notifications (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      title VARCHAR(255),
      message TEXT,
      type VARCHAR(50),
      is_read BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`
  ];

  try {
    console.log('Creating database tables...');
    
    for (const query of queries) {
      await pool.query(query);
    }
    
    console.log('✅ All tables created successfully');
    
    // Insert admin users
    console.log('Creating admin users...');
    if (!process.env.ADMIN_EMAILS || !process.env.ADMIN_PASSWORD) {
      throw new Error('ADMIN_EMAILS and ADMIN_PASSWORD must be set to provision administrator accounts');
    }
    const adminEmails = process.env.ADMIN_EMAILS.split(',');
    const adminPassword = process.env.ADMIN_PASSWORD;
    const hashedPassword = await bcrypt.hash(adminPassword, 10);
    
    for (const email of adminEmails) {
      const trimmedEmail = email.trim();
      await pool.query(
        `INSERT INTO users (name, email, password_hash, user_type, is_verified)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (email) DO NOTHING`,
        ['System Admin', trimmedEmail, hashedPassword, 'admin', true]
      );
    }
    
    console.log('✅ Admin users created successfully');
    console.log('\n📝 Admin Login Credentials:');
    console.log('Administrator accounts provisioned');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating tables:', error);
    process.exit(1);
  }
};

// Wait for pool to be ready
setTimeout(() => {
  createTables();
}, 1000);
