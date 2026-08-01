// src/scripts/createAdminDirect.js
const { pool } = require('../config/database');
const bcrypt = require('bcryptjs');
require('dotenv').config();

async function createAdminDirect() {
    console.log('🔄 Creating admin user directly...');
    
    try {
        const email = 'mulimaniganesh0@gmail.com';
        const password = 'admin123';
        const name = 'Admin User';
        const userType = 'admin';
        const phone = '1234567890';

        // Hash the password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        console.log('✅ Password hashed successfully');

        // Check if user exists
        const checkResult = await pool.query(
            'SELECT * FROM users WHERE email = $1',
            [email]
        );

        if (checkResult.rows.length > 0) {
            // Update existing user
            console.log('📝 Admin already exists, updating password...');
            
            await pool.query(
                `UPDATE users 
                 SET password_hash = $1, 
                     name = $2, 
                     phone = $3, 
                     is_verified = true
                 WHERE email = $4`,
                [hashedPassword, name, phone, email]
            );
            console.log('✅ Admin password updated successfully!');
        } else {
            // Insert new admin
            console.log('📝 Creating new admin user...');
            
            await pool.query(
                `INSERT INTO users (name, email, password_hash, user_type, phone, is_verified, created_at)
                 VALUES ($1, $2, $3, $4, $5, true, CURRENT_TIMESTAMP)`,
                [name, email, hashedPassword, userType, phone]
            );
            console.log('✅ Admin user created successfully!');
        }

        // Verify the user was created
        const verifyResult = await pool.query(
            'SELECT id, name, email, user_type, is_verified FROM users WHERE email = $1',
            [email]
        );

        console.log('\n✅ Admin user verified:');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('📧 Email:', email);
        console.log('👤 Name:', name);
        console.log('🏷️ Type:', userType);
        console.log('✅ Verified:', true);
        console.log('📱 Phone:', phone);
        console.log('🔑 Password:', password);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

        if (verifyResult.rows.length > 0) {
            console.log('📋 Database record:', verifyResult.rows[0]);
        }

    } catch (error) {
        console.error('❌ Error creating admin:', error.message);
        console.error('Full error:', error);
    } finally {
        await pool.end();
    }
}

// Run the function
createAdminDirect();