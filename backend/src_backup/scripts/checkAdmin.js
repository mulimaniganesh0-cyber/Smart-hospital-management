// src/scripts/checkAdmin.js
const { pool } = require('../config/database');
require('dotenv').config();

async function checkAdmin() {
    try {
        console.log('🔍 Checking for admin user...');
        
        // Check if users table exists
        const tableCheck = await pool.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'users'
            )
        `);
        
        if (!tableCheck.rows[0].exists) {
            console.log('❌ Users table does not exist!');
            console.log('Please run the SQL to create tables first.');
            await pool.end();
            return;
        }
        
        // Check if admin exists
        const result = await pool.query(
            'SELECT * FROM users WHERE email = $1',
            ['mulimaniganesh0@gmail.com']
        );
        
        if (result.rows.length === 0) {
            console.log('❌ Admin user does NOT exist in the database.');
            console.log('📝 Please run the createAdmin.js script.');
            console.log('   Or insert manually using SQL.');
        } else {
            console.log('✅ Admin user exists:');
            console.log({
                id: result.rows[0].id,
                name: result.rows[0].name,
                email: result.rows[0].email,
                user_type: result.rows[0].user_type,
                password_hash: result.rows[0].password_hash ? 'Hashed (present)' : 'MISSING!',
                is_verified: result.rows[0].is_verified
            });
            
            // Check if password_hash is valid
            if (!result.rows[0].password_hash || result.rows[0].password_hash.length < 10) {
                console.log('⚠️ Password hash seems invalid or too short.');
                console.log('📝 Please reset the password.');
            }
        }
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await pool.end();
    }
}

checkAdmin();