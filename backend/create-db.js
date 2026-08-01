// create-db.js
const { Pool } = require('pg');
require('dotenv').config();

const createDatabase = async () => {
  // Connect to default 'postgres' database
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: 'postgres',
  });

  const dbName = process.env.DB_NAME || 'hospital_resource_db';

  try {
    // Check if database exists
    const res = await pool.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [dbName]
    );

    if (res.rowCount === 0) {
      // Database doesn't exist, create it
      await pool.query(`CREATE DATABASE ${dbName}`);
      console.log(`✅ Database "${dbName}" created successfully`);
    } else {
      console.log(`✅ Database "${dbName}" already exists`);
    }

    await pool.end();
    
    // Now run the table creation
    console.log('\n📋 Running table creation...');
    require('./src/config/initDB');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.message.includes('password authentication failed')) {
      console.log('\n🔑 Password issue: Update your .env file with correct DB_PASSWORD');
    }
    process.exit(1);
  }
};

createDatabase();