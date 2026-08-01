// migrate.js
const { Pool } = require('pg');
const readline = require('readline');
require('dotenv').config();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function getPassword() {
  return new Promise((resolve) => {
    rl.question('Enter PostgreSQL password: ', (answer) => {
      resolve(answer);
      rl.close();
    });
  });
}

async function createTable() {
  const password = process.env.DB_PASSWORD || await getPassword();
  
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    user: process.env.DB_USER || 'postgres',
    password: password,
    database: process.env.DB_NAME || 'hospital_resource_db',
  });

  try {
    console.log('Creating resource_requests table...');
    
    await pool.query(`
      CREATE TABLE IF NOT EXISTS resource_requests (
        id SERIAL PRIMARY KEY,
        patient_id INTEGER REFERENCES patients(id) ON DELETE CASCADE,
        hospital_id INTEGER REFERENCES hospitals(id) ON DELETE CASCADE,
        resource_type VARCHAR(50) NOT NULL CHECK (resource_type IN ('bed', 'icu_bed', 'ventilator', 'oxygen_bed')),
        units_requested INTEGER DEFAULT 1,
        urgency VARCHAR(20) DEFAULT 'normal' CHECK (urgency IN ('normal', 'urgent', 'emergency')),
        notes TEXT,
        status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'fulfilled')),
        response_notes TEXT,
        request_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        responded_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    console.log('✅ resource_requests table created successfully');
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_resource_requests_patient_id ON resource_requests(patient_id);
      CREATE INDEX IF NOT EXISTS idx_resource_requests_hospital_id ON resource_requests(hospital_id);
      CREATE INDEX IF NOT EXISTS idx_resource_requests_status ON resource_requests(status);
    `);
    
    console.log('✅ Indexes created successfully');
    console.log('✅ Migration completed successfully!');
    
    await pool.end();
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    await pool.end();
    process.exit(1);
  }
}

createTable();