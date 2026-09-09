const fs = require('fs');
const path = require('path');
const { pool } = require('../config/database');
(async () => { try { await pool.query(fs.readFileSync(path.join(__dirname, '../migrations/009_hospital_daily_qr.sql'), 'utf8')); console.log('Daily hospital QR migration applied.'); } finally { await pool.end(); } })().catch((error) => { console.error('Daily QR migration failed:', error.message); process.exitCode = 1; });
