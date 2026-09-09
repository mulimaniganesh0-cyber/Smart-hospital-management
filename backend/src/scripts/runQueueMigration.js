const fs = require('fs');
const path = require('path');
const { pool } = require('../config/database');

(async () => {
  try {
    await pool.query(fs.readFileSync(path.join(__dirname, '../migrations/007_digital_queues.sql'), 'utf8'));
    console.log('Digital queue migration applied.');
  } finally {
    await pool.end();
  }
})().catch((error) => { console.error('Digital queue migration failed:', error.message); process.exitCode = 1; });
