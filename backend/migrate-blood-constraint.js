// migrate-blood-constraint.js
const { pool } = require('./src/config/database');

async function migrateBloodConstraint() {
  try {
    console.log('🔍 Adding unique constraint to blood_bank...');
    
    // Remove existing constraint if any
    await pool.query(`
      ALTER TABLE blood_bank DROP CONSTRAINT IF EXISTS blood_bank_hospital_id_blood_group_key
    `);
    console.log('✅ Dropped existing constraint');
    
    // Add new unique constraint
    await pool.query(`
      ALTER TABLE blood_bank ADD CONSTRAINT blood_bank_hospital_id_blood_group_key UNIQUE (hospital_id, blood_group)
    `);
    console.log('✅ Added unique constraint on (hospital_id, blood_group)');
    
    // Add expiry_date column if missing
    await pool.query(`
      ALTER TABLE blood_bank ADD COLUMN IF NOT EXISTS expiry_date DATE
    `);
    console.log('✅ Added expiry_date column');
    
    // Add batch_number column if missing
    await pool.query(`
      ALTER TABLE blood_bank ADD COLUMN IF NOT EXISTS batch_number VARCHAR(50)
    `);
    console.log('✅ Added batch_number column');
    
    console.log('✅ Migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
}

migrateBloodConstraint();