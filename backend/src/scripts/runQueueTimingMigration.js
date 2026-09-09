const fs = require('fs');
const path = require('path');
const { pool } = require('../config/database');
(async () => { try { await pool.query(fs.readFileSync(path.join(__dirname, '../migrations/008_queue_timing.sql'), 'utf8')); console.log('Queue timing migration applied.'); } finally { await pool.end(); } })().catch(error => { console.error(error.message); process.exitCode = 1; });
