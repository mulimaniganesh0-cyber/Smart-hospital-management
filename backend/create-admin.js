// create-admin.js
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'hospital_resource_db',
  password: process.env.DB_PASSWORD || 'your_password',
  port: process.env.DB_PORT || 5432,
});

async function createAdmin() {
  try {
    console.log('🔐 Creating admin user...');
    
    // Create admins table if not exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS admins (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        phone VARCHAR(20),
        is_verified BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const hashedPassword = await bcrypt.hash('admin123', 10);
    
    const result = await pool.query(
      `INSERT INTO admins (name, email, password, phone, is_verified) 
       VALUES ($1, $2, $3, $4, $5) 
       ON CONFLICT (email) DO UPDATE 
       SET password = EXCLUDED.password,
           updated_at = CURRENT_TIMESTAMP
       RETURNING id, name, email, is_verified`,
      ['Admin User', 'admin@system.com', hashedPassword, '1234567890', true]
    );
    
    console.log('✅ Admin user created/updated successfully!');
    console.log('📧 Email: admin@system.com');
    console.log('🔑 Password: admin123');
    console.log('👤 User:', result.rows[0]);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating admin:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

createAdmin();