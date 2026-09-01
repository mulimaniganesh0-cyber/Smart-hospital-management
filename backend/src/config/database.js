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
