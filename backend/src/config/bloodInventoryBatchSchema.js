const fs = require('fs');
const path = require('path');

async function ensureBloodInventoryBatchSchema(pool) {
  const migrationPath = path.resolve(__dirname, '../migrations/022_blood_inventory_batches.sql');
  const migrationSql = fs.readFileSync(migrationPath, 'utf8');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(migrationSql);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { ensureBloodInventoryBatchSchema };
