// src/scripts/updateAdminPassword.js
const { pool } = require('../config/database');
const bcrypt = require('bcryptjs');
require('dotenv').config();

async function updateAdminPassword() {
    console.log('🔄 Updating admin password...');
    
    try {
        const email = 'mulimaniganesh0@gmail.com';
        const newPassword = 'admin123';

        // Hash the password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);
        console.log('✅ Password hashed successfully');

        // Update the password
        const result = await pool.query(
            `UPDATE users 
             SET password_hash = $1, updated_at = CURRENT_TIMESTAMP
             WHERE email = $2
             RETURNING id, name, email, user_type, is_verified`,
            [hashedPassword, email]
        );

        if (result.rows.length > 0) {
            console.log('✅ Admin password updated successfully!');
            console.log('📋 User:', result.rows[0]);
            console.log('🔑 New Password:', newPassword);
        } else {
            console.log('❌ Admin user not found!');
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await pool.end();
    }
}

updateAdminPassword();