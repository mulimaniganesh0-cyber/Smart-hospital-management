// src/scripts/runMigrations.js
// Simple migration runner: executes SQL files in src/migrations in alphanumeric order.
const path = require('path');
const fs = require('fs');
const { pool } = require('../config/database');

async function run() {
  const dir = path.join(__dirname, '..', 'migrations');
  if (!fs.existsSync(dir)) {
    console.log('No migrations directory found, skipping.');
    process.exit(0);
  }

  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  if (files.length === 0) {
    console.log('No migration files found.');
    process.exit(0);
  }

  const client = await pool.connect();
  try {
    for (const file of files) {
      const full = path.join(dir, file);
      const sql = fs.readFileSync(full, 'utf8');
      console.log(`Running migration: ${file}`);
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('COMMIT');
      console.log(`Applied ${file}`);
    }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Migration failed:', err.message || err);
    process.exit(1);
  } finally {
    client.release();
    process.exit(0);
  }
}

run().catch((err) => {
  console.error('Migration runner error:', err);
  process.exit(1);
});