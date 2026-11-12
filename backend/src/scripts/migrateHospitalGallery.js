const fs = require('fs');
const path = require('path');
const { pool } = require('../config/database');

async function main() {
  try {
    const target = await pool.query('SELECT current_database() AS database, inet_server_addr()::text AS server_address');
    const identity = target.rows[0];
    console.log(`Hospital gallery migration target: database=${identity.database}; server=${identity.server_address || 'local socket'}`);
    if (!process.argv.includes('--apply')) {
      console.log('Status only. Add --apply to execute migration 019_hospital_photo_gallery.sql on this target.');
      return;
    }
    const sqlPath = path.join(__dirname, '..', 'migrations', '019_hospital_photo_gallery.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('COMMIT');
      console.log('Migration 019_hospital_photo_gallery.sql applied successfully.');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error('Hospital gallery migration failed:', error.message);
  process.exitCode = 1;
});
