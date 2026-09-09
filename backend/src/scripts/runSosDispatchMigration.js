const fs = require('fs');
const path = require('path');
const { pool } = require('../config/database');

async function run() {
  try {
    const sql = fs.readFileSync(path.join(__dirname, '..', 'migrations', '010_sos_dispatch_escalation.sql'), 'utf8');
    await pool.query(sql);
    console.log('SOS dispatch escalation migration applied.');
  } finally { await pool.end(); }
}
run().catch((error) => { console.error('SOS dispatch migration failed:', error.message); process.exitCode = 1; });
