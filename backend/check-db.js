const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'db1234',
  database: process.env.DB_NAME || 'hospital_resource_db',
});

async function main() {
  try {
    const colRes = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'doctors'
    `);
    console.log('Columns in doctors table:');
    colRes.rows.forEach(r => console.log(` - ${r.column_name}: ${r.data_type}`));

    const docRes = await pool.query('SELECT count(*) FROM doctors');
    console.log(`Total doctors: ${docRes.rows[0].count}`);

    if (docRes.rows[0].count > 0) {
      const sample = await pool.query('SELECT * FROM doctors LIMIT 5');
      console.log('Sample doctors:');
      console.log(JSON.stringify(sample.rows, null, 2));
    }

    const hospColRes = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'hospitals'
    `);
    console.log('Columns in hospitals table:');
    hospColRes.rows.forEach(r => console.log(` - ${r.column_name}: ${r.data_type}`));

  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

main();
