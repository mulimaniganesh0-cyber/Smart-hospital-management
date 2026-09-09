/* Removes only confirmed development fixture doctors. It never creates or
 * modifies genuine clinician records, and is safe to run repeatedly. */
const { pool } = require('../config/database');

async function removeSeedDoctors() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const seeded = await client.query(`SELECT id FROM doctors
      WHERE email LIKE '%@seed.invalid'
         OR name ~* '^Dr\\.?[[:space:]]*(Test|Demo|Dummy|Example|Fake)\\b'
         OR qualification = 'Test data'
         OR phone LIKE '91000000%'`);
    const ids = seeded.rows.map((row) => Number(row.id));
    if (ids.length) {
      // Preserve any accidentally linked appointment history by unassigning
      // it; only the known fixture clinician rows are removed.
      await client.query('UPDATE appointments SET doctor_id=NULL WHERE doctor_id = ANY($1::int[])', [ids]);
      await client.query('DELETE FROM doctors WHERE id = ANY($1::int[])', [ids]);
    }
    await client.query('COMMIT');
    console.log(`Removed ${ids.length} confirmed seed doctor record(s).`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

removeSeedDoctors().catch((error) => {
  console.error('Seed doctor cleanup failed:', error.message);
  process.exitCode = 1;
});
