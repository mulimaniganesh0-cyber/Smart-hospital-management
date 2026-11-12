/*
 * Read-only development verification for every hospital in the configured DB.
 * It compares the raw PostgreSQL inventory with the canonical representation
 * that is returned by both patient and hospital blood-bank APIs.
 */
const { pool } = require('../src/config/database');
const { getHospitalBloodStock } = require('../src/services/bloodInventoryService');

async function main() {
  const hospitals = await pool.query('SELECT id FROM hospitals ORDER BY id');
  let failed = 0;
  let checked = 0;

  for (const hospital of hospitals.rows) {
    const raw = await pool.query(
      `SELECT blood_group,
              COALESCE(SUM(units_available) FILTER (
                WHERE expiry_date IS NULL OR expiry_date >= CURRENT_DATE
              ), 0) AS units_available
       FROM blood_inventory_batches WHERE hospital_id = $1 GROUP BY blood_group`,
      [hospital.id],
    );
    const canonical = await getHospitalBloodStock(hospital.id);
    const rawByGroup = new Map(raw.rows.map((item) => [item.blood_group, Number(item.units_available) || 0]));
    const passed = canonical.bloodStock.length === 8 && canonical.bloodStock.every(
      (item) => (rawByGroup.get(item.blood_group) || 0) === Number(item.units_available),
    );
    checked += 1;
    if (!passed) failed += 1;
  }

  const integrity = await pool.query(`
    SELECT
      (SELECT count(*) FROM blood_bank bb WHERE NOT EXISTS (
        SELECT 1 FROM blood_inventory_batches b WHERE b.blood_bank_id=bb.id
      ))::int AS missing_batches,
      (SELECT count(*) FROM blood_inventory_batches b LEFT JOIN blood_bank bb ON bb.id=b.blood_bank_id
        WHERE bb.id IS NULL)::int AS orphan_batches,
      (SELECT count(*) FROM (SELECT hospital_id,blood_group FROM blood_bank
        GROUP BY hospital_id,blood_group HAVING count(*)>1) d)::int AS duplicate_canonical_groups,
      (SELECT count(*) FROM blood_bank WHERE blood_group NOT IN ('A+','A-','B+','B-','AB+','AB-','O+','O-'))::int AS noncanonical_groups,
      (SELECT count(*) FROM blood_bank bb WHERE bb.units_available <> COALESCE((
        SELECT SUM(b.units_available) FROM blood_inventory_batches b
        WHERE b.blood_bank_id=bb.id AND (b.expiry_date IS NULL OR b.expiry_date >= CURRENT_DATE)
      ),0))::int AS aggregate_total_mismatches
  `);
  const counts = integrity.rows[0];
  const passed = !failed && Object.values(counts).every((count) => count === 0);
  console.log(`Checked ${checked} hospitals; active batch totals ${failed ? 'mismatch' : 'match'} canonical inventory.`);
  console.log(`Batch integrity: ${JSON.stringify(counts)}; ${passed ? 'PASS' : 'FAIL'}`);
  if (!passed) failed += 1;
  if (failed) process.exitCode = 1;
}

main().catch((error) => {
  console.error('Blood inventory consistency check failed:', error.message);
  process.exitCode = 1;
}).finally(() => pool.end());
