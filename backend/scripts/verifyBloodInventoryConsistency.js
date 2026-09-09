/*
 * Read-only development verification for every hospital in the configured DB.
 * It compares the raw PostgreSQL inventory with the canonical representation
 * that is returned by both patient and hospital blood-bank APIs.
 */
const { pool } = require('../src/config/database');
const { getHospitalBloodStock } = require('../src/services/bloodInventoryService');

async function main() {
  const hospitals = await pool.query('SELECT id, name FROM hospitals ORDER BY id');
  let failed = 0;
  console.log('Hospital\tID\tPostgreSQL\tCanonical\tResult');

  for (const hospital of hospitals.rows) {
    const raw = await pool.query(
      'SELECT blood_group, units_available FROM blood_bank WHERE hospital_id = $1', [hospital.id]
    );
    const canonical = await getHospitalBloodStock(hospital.id);
    const canonicalTotal = canonical.bloodStock.reduce((total, item) => total + Number(item.units), 0);
    const rawTotal = raw.rows.reduce((total, item) => total + (Number(item.units_available) || 0), 0);
    const passed = rawTotal === canonicalTotal && canonical.bloodStock.length === 8;
    if (!passed) failed += 1;
    console.log(`${hospital.name}\t${hospital.id}\t${rawTotal}\t${canonicalTotal}\t${passed ? 'PASS' : 'FAIL'}`);
  }

  if (failed) process.exitCode = 1;
}

main().catch((error) => {
  console.error('Blood inventory consistency check failed:', error.message);
  process.exitCode = 1;
}).finally(() => pool.end());
