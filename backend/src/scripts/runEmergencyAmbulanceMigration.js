const fs = require('fs');
const path = require('path');
const { pool } = require('../config/database');

async function run() {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'migrations', '005_emergency_and_ambulance.sql'), 'utf8');
  try {
    await pool.query(sql);
    console.log('Emergency and ambulance migration applied.');
  } finally {
    await pool.end();
  }
}

run().catch((error) => {
  console.error('Emergency and ambulance migration failed:', error.message);
  process.exit(1);
});
