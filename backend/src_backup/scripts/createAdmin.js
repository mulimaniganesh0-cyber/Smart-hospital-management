// src/scripts/createAdmin.js
const bcrypt = require('bcryptjs');
const { pool } = require('../config/database');
require('dotenv').config();

async function createAdmin() {
    console.log('🔄 Creating admin user...');
    
    try {
        // Admin credentials
        const adminData = {
            name: 'Admin User',
            email: 'mulimaniganesh0@gmail.com',
            password: 'admin123',
            user_type: 'admin',
            phone: '1234567890'
        };

        // Hash the password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(adminData.password, salt);
        
        console.log('🔐 Password hashed successfully');

        // First, check if user exists
        const checkResult = await pool.query(
            'SELECT * FROM users WHERE email = $1',
            [adminData.email]
        );

        let result;
        
        if (checkResult.rows.length > 0) {
            // Update existing user
            console.log('📝 Admin already exists, updating password...');
            
            result = await pool.query(
                `UPDATE users 
                 SET password_hash = $1, 
                     name = $2, 
                     phone = $3, 
                     is_verified = true,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE email = $4
                 RETURNING id, name, email, user_type, is_verified`,
                [hashedPassword, adminData.name, adminData.phone, adminData.email]
            );
            
            console.log('✅ Admin user updated successfully!');
        } else {
            // Insert new admin
            console.log('📝 Creating new admin user...');
            
            result = await pool.query(
                `INSERT INTO users (name, email, password_hash, user_type, phone, is_verified, created_at)
                 VALUES ($1, $2, $3, $4, $5, true, CURRENT_TIMESTAMP)
                 RETURNING id, name, email, user_type, is_verified`,
                [adminData.name, adminData.email, hashedPassword, adminData.user_type, adminData.phone]
            );
            
            console.log('✅ Admin user created successfully!');
        }

        console.log('\n📋 Admin Credentials:');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('📧 Email:', adminData.email);
        console.log('🔑 Password:', adminData.password);
        console.log('👤 User Type:', adminData.user_type);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('✅ Admin user data:', result.rows[0]);

    } catch (error) {
        console.error('❌ Error creating admin:', error.message);
        console.error('Full error:', error);
    } finally {
        await pool.end();
    }
}

// Run the function
createAdmin();