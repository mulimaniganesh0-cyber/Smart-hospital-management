// src/scripts/createTables.js
const { pool } = require('../config/database');
require('dotenv').config();

async function createTables() {
    console.log('🔄 Creating database tables...');
    
    try {
        // Create users table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                email VARCHAR(255) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                user_type VARCHAR(50) NOT NULL,
                phone VARCHAR(20),
                is_verified BOOLEAN DEFAULT false,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_login TIMESTAMP
            )
        `);
        console.log('✅ Users table created/verified');

        // Create password_resets table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS password_resets (
                id SERIAL PRIMARY KEY,
                email VARCHAR(255) NOT NULL,
                reset_code VARCHAR(10) NOT NULL,
                expires_at TIMESTAMP NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(email)
            )
        `);
        console.log('✅ Password resets table created/verified');

        // Create hospitals table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS hospitals (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                name VARCHAR(255) NOT NULL,
                registration_number VARCHAR(100),
                address TEXT,
                phone VARCHAR(20),
                email VARCHAR(255),
                latitude DECIMAL(10, 8),
                longitude DECIMAL(11, 8),
                emergency_services BOOLEAN DEFAULT false,
                rating DECIMAL(3, 2) DEFAULT 0,
                is_verified BOOLEAN DEFAULT false,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ Hospitals table created/verified');

        // Create patient_profiles table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS patient_profiles (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                date_of_birth DATE,
                blood_group VARCHAR(5),
                emergency_contact VARCHAR(20),
                address TEXT,
                allergies TEXT,
                medical_history TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ Patient profiles table created/verified');

        console.log('✅ All tables created successfully!');

    } catch (error) {
        console.error('❌ Error creating tables:', error.message);
    } finally {
        await pool.end();
    }
}

createTables();