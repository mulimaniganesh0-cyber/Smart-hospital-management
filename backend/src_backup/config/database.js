// src/config/database.js
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'Ganesh@2578',
  database: process.env.DB_NAME || 'hospital_resource_db',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// Test database connection function
const testConnection = async () => {
  try {
    const client = await pool.connect();
    console.log('✅ Connected to PostgreSQL database successfully');
    client.release();
    return true;
  } catch (err) {
    console.error('❌ Error connecting to database:', err.message);
    return false;
  }
};

// Test connection on startup
pool.connect((err, client, release) => {
  if (err) {
    console.error('❌ Error connecting to database:', err.message);
  } else {
    console.log('✅ Connected to PostgreSQL database successfully');
    release();
  }
});

module.exports = { pool, testConnection };