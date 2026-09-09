const { Pool } = require('pg');
const path = require('path');
const dotenv = require('dotenv');

// The project .env lives beside backend/, while some deployments keep a
// backend-local .env.  Load either location without overriding explicit env.
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const pool = new Pool({
  host:
    process.env.DB_HOST ||
    'localhost',

  port:
    Number(
      process.env.DB_PORT || 5432
    ),

  user:
    process.env.DB_USER ||
    'postgres',

  password:
    String(
      process.env.DB_PASSWORD || ''
    ),

  database:
    process.env.DB_NAME ||
    'hospital_resource_db',

  // A shared, bounded pool keeps concurrent mobile/web requests from opening
  // an unbounded number of PostgreSQL connections. These values are
  // configurable per deployment rather than embedded in route handlers.
  max: Number(process.env.DB_POOL_MAX || 12),
  min: Number(process.env.DB_POOL_MIN || 0),
  idleTimeoutMillis: Number(process.env.DB_IDLE_TIMEOUT_MS || 30_000),
  connectionTimeoutMillis: Number(process.env.DB_CONNECTION_TIMEOUT_MS || 5_000),
  query_timeout: Number(process.env.DB_QUERY_TIMEOUT_MS || 15_000),
  application_name: process.env.DB_APPLICATION_NAME || 'smart-hospital-api',
});

pool.on(
  'error',
  (error) => {
    console.error(
      'Unexpected PostgreSQL pool error:',
      error
    );
  }
);

async function testConnection() {
  const client =
    await pool.connect();

  try {
    await client.query(
      'SELECT 1'
    );

    console.log(
      '✅ Connected to PostgreSQL database successfully'
    );
    return true;
  } finally {
    client.release();
  }
}

module.exports = {
  pool,
  testConnection,
};
