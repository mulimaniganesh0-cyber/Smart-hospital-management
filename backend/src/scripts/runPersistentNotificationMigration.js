const fs = require('fs');
const path = require('path');
const { pool } = require('../config/database');

async function run() {
  try {
    const sql = fs.readFileSync(path.join(__dirname, '..', 'migrations', '006_persistent_notifications.sql'), 'utf8');
    await pool.query(sql);
    console.log('Persistent notification migration applied.');
  } finally {
    await pool.end();
  }
}

run().catch((error) => { console.error('Persistent notification migration failed:', error.message); process.exit(1); });
