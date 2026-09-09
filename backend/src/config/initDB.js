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
      user_type VARCHAR(50) CHECK (user_type IN ('patient', 'hospital', 'admin', 'staff')) NOT NULL,
      role VARCHAR(50) DEFAULT NULL,
      hospital_role VARCHAR(50) DEFAULT NULL,
      permissions TEXT[] DEFAULT '{}',
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
      area VARCHAR(255),
      city VARCHAR(100),
      state VARCHAR(100),
      country VARCHAR(100),
      pincode VARCHAR(10),
      hospital_type VARCHAR(100),
      departments TEXT[] DEFAULT '{}',
      specialties TEXT[] DEFAULT '{}',
      services TEXT[] DEFAULT '{}',
      emergency_available BOOLEAN DEFAULT FALSE,
      phone VARCHAR(20),
      email VARCHAR(255),
      latitude DECIMAL(10, 8),
      longitude DECIMAL(11, 8),
      entrance_latitude DECIMAL(10, 8),
      entrance_longitude DECIMAL(11, 8),
      is_verified BOOLEAN DEFAULT FALSE,
      directory_visible BOOLEAN DEFAULT FALSE,
      verification_status VARCHAR(50) DEFAULT 'pending',
      rating DECIMAL(3, 2) DEFAULT 0,
      total_reviews INTEGER DEFAULT 0,
      google_rating DECIMAL(2, 1),
      google_review_count INTEGER,
      google_place_id TEXT,
      google_maps_url TEXT,
      rating_source VARCHAR(50),
      rating_verified BOOLEAN DEFAULT FALSE,
      rating_last_updated TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,

    // Hospital Resources table
    `CREATE TABLE IF NOT EXISTS hospital_resources (
      id SERIAL PRIMARY KEY,
      hospital_id INTEGER NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
      general_beds_total INTEGER DEFAULT 0,
      general_beds_available INTEGER DEFAULT 0,
      icu_beds_total INTEGER DEFAULT 0,
      icu_beds_available INTEGER DEFAULT 0,
      ventilators_total INTEGER DEFAULT 0,
      ventilators_available INTEGER DEFAULT 0,
      oxygen_supported_beds_total INTEGER DEFAULT 0,
      oxygen_supported_beds_available INTEGER DEFAULT 0,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(hospital_id)
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
      hospital_id INTEGER NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      name VARCHAR(255) NOT NULL,
      specialization VARCHAR(255),
      designation TEXT,
      department TEXT,
      qualification TEXT,
      experience_years INTEGER,
      experience_display TEXT,
      registration_number TEXT,
      availability TEXT,
      availability_status BOOLEAN DEFAULT TRUE,
      -- is_active controls whether a directory doctor can be shown or booked.
      -- availability_status is retained for compatibility with existing clients.
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      consultation_fee DECIMAL(10, 2),
      phone VARCHAR(20),
      email VARCHAR(255),
      profile_image TEXT,
      bio TEXT,
      verification_status VARCHAR(80) DEFAULT 'HOSPITAL_CONFIRMATION_REQUIRED',
      source_url TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,

    // Appointments table
    `CREATE TABLE IF NOT EXISTS appointments (
      id SERIAL PRIMARY KEY,
      patient_id INTEGER REFERENCES patients(id) ON DELETE CASCADE,
      hospital_id INTEGER NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
      doctor_id INTEGER REFERENCES doctors(id),
      appointment_date DATE NOT NULL,
      appointment_time TIME NOT NULL,
      status VARCHAR(50) DEFAULT 'pending',
      symptoms TEXT,
      notes TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,

    // A configured slot is the source of truth for booking and rescheduling.
    // Hospitals can populate these from their scheduling dashboard; patients
    // never receive a fabricated list of availability.
    `CREATE TABLE IF NOT EXISTS doctor_available_slots (
      id SERIAL PRIMARY KEY,
      doctor_id INTEGER NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
      slot_date DATE NOT NULL,
      slot_time TIME NOT NULL,
      is_available BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(doctor_id, slot_date, slot_time)
    )`,
    `CREATE TABLE IF NOT EXISTS appointment_reschedule_history (
      id SERIAL PRIMARY KEY,
      appointment_id INTEGER NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
      previous_date DATE NOT NULL,
      previous_time TIME NOT NULL,
      new_date DATE NOT NULL,
      new_time TIME NOT NULL,
      changed_by_user_id INTEGER REFERENCES users(id),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_active_doctor_appointment_slot
      ON appointments(doctor_id, appointment_date, appointment_time)
      WHERE status NOT IN ('cancelled', 'rejected', 'completed')`,

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
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
      status VARCHAR(30) NOT NULL DEFAULT 'AVAILABLE',
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      current_location_lat DECIMAL(10, 8),
      current_location_lng DECIMAL(11, 8),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,

    `CREATE TABLE IF NOT EXISTS ambulance_bookings (
      id SERIAL PRIMARY KEY,
      patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
      hospital_id INTEGER REFERENCES hospitals(id),
      ambulance_id INTEGER NOT NULL REFERENCES ambulances(id),
      pickup_location TEXT,
      pickup_lat DECIMAL(10, 8),
      pickup_lng DECIMAL(11, 8),
      dropoff_location TEXT,
      patient_name VARCHAR(255),
      patient_phone VARCHAR(30),
      status VARCHAR(50) NOT NULL DEFAULT 'pending',
      is_sos BOOLEAN NOT NULL DEFAULT FALSE,
      emergency_request_id INTEGER REFERENCES emergency_requests(id) ON DELETE SET NULL,
      booking_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      completed_at TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,

    `CREATE TABLE IF NOT EXISTS emergency_hospital_dispatches (
      id SERIAL PRIMARY KEY,
      emergency_id INTEGER NOT NULL REFERENCES emergency_requests(id) ON DELETE CASCADE,
      hospital_id INTEGER NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
      sequence_number INTEGER NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
      notified_at TIMESTAMP,
      response_deadline TIMESTAMP,
      responded_at TIMESTAMP,
      accepted_at TIMESTAMP,
      rejected_at TIMESTAMP,
      timed_out_at TIMESTAMP,
      rejection_reason TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(emergency_id, hospital_id), UNIQUE(emergency_id, sequence_number)
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
      recipient_phone VARCHAR(30),
      delivery_status VARCHAR(20) NOT NULL DEFAULT 'pending',
      failure_reason TEXT,
      hospital_id INTEGER REFERENCES hospitals(id) ON DELETE CASCADE,
      priority VARCHAR(20) NOT NULL DEFAULT 'normal',
      related_type VARCHAR(50),
      related_id INTEGER,
      patient_id INTEGER REFERENCES patients(id) ON DELETE SET NULL,
      ambulance_id INTEGER REFERENCES ambulances(id) ON DELETE SET NULL,
      emergency_id INTEGER REFERENCES emergency_requests(id) ON DELETE SET NULL,
      read_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,

    `CREATE TABLE IF NOT EXISTS roles (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) UNIQUE NOT NULL,
      description TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,

    `CREATE TABLE IF NOT EXISTS staff_activity_log (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      hospital_id INTEGER REFERENCES hospitals(id) ON DELETE CASCADE,
      action VARCHAR(100) NOT NULL,
      details JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`
  ];

  try {
    console.log('Creating database tables...');
    
    for (const query of queries) {
      await pool.query(query);
    }

    // These ALTERs make initialization safe for databases created before the
    // doctor-directory fields were introduced.
    await pool.query(`ALTER TABLE doctors ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE`);
    await pool.query(`CREATE TABLE IF NOT EXISTS doctor_schedules (
      id SERIAL PRIMARY KEY, doctor_id INTEGER NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
      hospital_id INTEGER NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
      weekday SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6), start_time TIME NOT NULL, end_time TIME NOT NULL,
      slot_duration_minutes INTEGER NOT NULL CHECK (slot_duration_minutes > 0 AND slot_duration_minutes <= 480),
      break_start_time TIME, break_end_time TIME, is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CHECK (start_time < end_time),
      CHECK ((break_start_time IS NULL AND break_end_time IS NULL) OR (break_start_time IS NOT NULL AND break_end_time IS NOT NULL AND break_start_time < break_end_time AND break_start_time >= start_time AND break_end_time <= end_time)),
      UNIQUE (doctor_id, hospital_id, weekday, start_time))`);
    await pool.query(`CREATE TABLE IF NOT EXISTS doctor_leaves (
      id SERIAL PRIMARY KEY, doctor_id INTEGER NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
      hospital_id INTEGER NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
      leave_start_date DATE NOT NULL, leave_end_date DATE NOT NULL, status VARCHAR(20) NOT NULL DEFAULT 'approved', reason TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, CHECK (leave_end_date >= leave_start_date))`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_doctor_schedules_lookup ON doctor_schedules(doctor_id, hospital_id, weekday) WHERE is_active`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_doctor_leaves_lookup ON doctor_leaves(doctor_id, hospital_id, leave_start_date, leave_end_date) WHERE status='approved'`);
    await pool.query(`ALTER TABLE patients ADD COLUMN IF NOT EXISTS emergency_contact_relationship VARCHAR(100)`);
    await pool.query(`ALTER TABLE ambulances ADD COLUMN IF NOT EXISTS status VARCHAR(30) NOT NULL DEFAULT 'AVAILABLE', ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE, ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP`);
    await pool.query(`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS recipient_phone VARCHAR(30), ADD COLUMN IF NOT EXISTS delivery_status VARCHAR(20) NOT NULL DEFAULT 'pending', ADD COLUMN IF NOT EXISTS failure_reason TEXT`);
    await pool.query(`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS hospital_id INTEGER REFERENCES hospitals(id) ON DELETE CASCADE, ADD COLUMN IF NOT EXISTS priority VARCHAR(20) NOT NULL DEFAULT 'normal', ADD COLUMN IF NOT EXISTS related_type VARCHAR(50), ADD COLUMN IF NOT EXISTS related_id INTEGER, ADD COLUMN IF NOT EXISTS patient_id INTEGER REFERENCES patients(id) ON DELETE SET NULL, ADD COLUMN IF NOT EXISTS ambulance_id INTEGER REFERENCES ambulances(id) ON DELETE SET NULL, ADD COLUMN IF NOT EXISTS emergency_id INTEGER REFERENCES emergency_requests(id) ON DELETE SET NULL, ADD COLUMN IF NOT EXISTS read_at TIMESTAMP`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_notifications_recipient_unread ON notifications(user_id, is_read, created_at DESC)`);
    await pool.query(`ALTER TABLE emergency_requests ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP`);
    await pool.query(`ALTER TABLE emergency_requests ADD COLUMN IF NOT EXISTS accepting_hospital_id INTEGER REFERENCES hospitals(id), ADD COLUMN IF NOT EXISTS location_accuracy NUMERIC(10,2), ADD COLUMN IF NOT EXISTS location_timestamp TIMESTAMP, ADD COLUMN IF NOT EXISTS escalation_exhausted_at TIMESTAMP, ADD COLUMN IF NOT EXISTS secure_location_token_hash VARCHAR(128), ADD COLUMN IF NOT EXISTS secure_location_expires_at TIMESTAMP`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_emergency_dispatch_active_deadline ON emergency_hospital_dispatches(response_deadline) WHERE status='NOTIFIED'`);
    await pool.query(`ALTER TABLE ambulance_bookings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP`);
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_doctors_hospital_normalized_name
      ON doctors (hospital_id, lower(regexp_replace(name, '[^a-zA-Z0-9]', '', 'g')))`);

    await pool.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS hospital_id INTEGER REFERENCES hospitals(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS hospital_role VARCHAR(50) DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS permissions TEXT[] DEFAULT '{}'::text[]
    `);

    await pool.query(`
      INSERT INTO roles (name, description)
      VALUES
        ('doctor', 'Hospital doctor access'),
        ('nurse', 'Hospital nursing access'),
        ('frontdesk', 'Front desk and scheduling access'),
        ('billing', 'Billing and records access'),
        ('hospital_admin', 'Hospital admin access'),
        ('super_admin', 'System administrator access')
      ON CONFLICT (name) DO NOTHING
    `);
    
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
        `INSERT INTO users (name, email, password_hash, user_type, role, is_verified)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (email) DO NOTHING`,
        ['System Admin', trimmedEmail, hashedPassword, 'admin', 'super_admin', true]
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
