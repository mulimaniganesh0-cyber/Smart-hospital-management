// migrate-blood-expiry.js
const { pool } = require('./src/config/database');

async function migrateBloodExpiry() {
  try {
    console.log('🔍 Starting blood expiry migration...');

    // Check if columns exist and add them
    const columnsToAdd = [
      { name: 'expiry_date', type: 'DATE' },
      { name: 'batch_number', type: 'VARCHAR(50)' },
      { name: 'donation_date', type: 'DATE' },
      { name: 'donor_name', type: 'VARCHAR(255)' },
      { name: 'is_expired', type: 'BOOLEAN DEFAULT FALSE' },
    ];

    for (const col of columnsToAdd) {
      try {
        await pool.query(`ALTER TABLE blood_bank ADD COLUMN IF NOT EXISTS ${col.name} ${col.type}`);
        console.log(`✅ Added column: ${col.name}`);
      } catch (err) {
        console.log(`⚠️ Column ${col.name} may already exist:`, err.message);
      }
    }

    // Create blood_expiry_notifications table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS blood_expiry_notifications (
        id SERIAL PRIMARY KEY,
        hospital_id INTEGER REFERENCES hospitals(id) ON DELETE CASCADE,
        blood_group VARCHAR(5) NOT NULL,
        batch_number VARCHAR(50),
        units_affected INTEGER NOT NULL,
        expiry_date DATE NOT NULL,
        notification_type VARCHAR(50) DEFAULT 'warning',
        message TEXT,
        is_read BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Created blood_expiry_notifications table');

    // Create blood_donation_history table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS blood_donation_history (
        id SERIAL PRIMARY KEY,
        hospital_id INTEGER REFERENCES hospitals(id) ON DELETE CASCADE,
        donor_name VARCHAR(255),
        donor_phone VARCHAR(20),
        blood_group VARCHAR(5),
        units_donated INTEGER DEFAULT 1,
        donation_date DATE,
        expiry_date DATE,
        batch_number VARCHAR(50),
        status VARCHAR(50) DEFAULT 'active',
        used_at TIMESTAMP,
        used_for VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Created blood_donation_history table');

    console.log('✅ Migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
}

migrateBloodExpiry();