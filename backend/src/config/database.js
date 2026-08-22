// src/config/database.js
const { Pool } = require('pg');
require('dotenv').config();

const requiredEnv = ['DB_PASSWORD'];
const missingEnv = requiredEnv.filter((key) => !process.env[key] || !String(process.env[key]).trim());

if (missingEnv.length > 0) {
  throw new Error(`Missing required environment variable(s): ${missingEnv.join(', ')}`);
}

if (!process.env.JWT_SECRET || String(process.env.JWT_SECRET).trim().length < 32) {
  throw new Error('JWT_SECRET must be set to a value at least 32 characters long');
}

if (process.env.NODE_ENV === 'production') {
  const origins = (process.env.ALLOWED_ORIGINS || process.env.FRONTEND_URL || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (origins.length === 0) {
    throw new Error('ALLOWED_ORIGINS or FRONTEND_URL must be set in production');
  }
}

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
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
