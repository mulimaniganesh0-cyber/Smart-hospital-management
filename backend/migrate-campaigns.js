// migrate-campaigns.js
const { pool } = require('./src/config/database');

async function migrateCampaigns() {
  try {
    console.log('🔍 Starting campaign tables migration...');

    // Create blood_donation_campaigns table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS blood_donation_campaigns (
        id SERIAL PRIMARY KEY,
        hospital_id INTEGER REFERENCES hospitals(id) ON DELETE CASCADE,
        campaign_name VARCHAR(255) NOT NULL,
        description TEXT,
        location TEXT NOT NULL,
        city VARCHAR(100),
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        start_time TIME NOT NULL,
        end_time TIME NOT NULL,
        target_donors INTEGER DEFAULT 50,
        registered_donors INTEGER DEFAULT 0,
        blood_groups_needed TEXT[] DEFAULT '{"A+","A-","B+","B-","AB+","AB-","O+","O-"}',
        status VARCHAR(50) DEFAULT 'pending',
        contact_person VARCHAR(255),
        contact_phone VARCHAR(20),
        total_blood_collected INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Created blood_donation_campaigns table');

    // Create blood_donation_registrations table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS blood_donation_registrations (
        id SERIAL PRIMARY KEY,
        campaign_id INTEGER REFERENCES blood_donation_campaigns(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        patient_id INTEGER REFERENCES patients(id) ON DELETE CASCADE,
        donor_name VARCHAR(255) NOT NULL,
        donor_phone VARCHAR(20) NOT NULL,
        donor_email VARCHAR(255),
        blood_group VARCHAR(5) NOT NULL,
        age INTEGER,
        weight DECIMAL(5,2),
        last_donation_date DATE,
        medical_conditions TEXT,
        registration_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        status VARCHAR(50) DEFAULT 'registered',
        check_in_time TIMESTAMP,
        donation_time TIMESTAMP,
        units_donated INTEGER DEFAULT 0,
        notes TEXT
      )
    `);
    console.log('✅ Created blood_donation_registrations table');

    // Create blood_donation_records table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS blood_donation_records (
        id SERIAL PRIMARY KEY,
        registration_id INTEGER REFERENCES blood_donation_registrations(id) ON DELETE CASCADE,
        hospital_id INTEGER REFERENCES hospitals(id) ON DELETE CASCADE,
        campaign_id INTEGER REFERENCES blood_donation_campaigns(id) ON DELETE CASCADE,
        donor_name VARCHAR(255) NOT NULL,
        donor_phone VARCHAR(20),
        blood_group VARCHAR(5) NOT NULL,
        units_donated INTEGER DEFAULT 1,
        donation_date DATE NOT NULL,
        donation_time TIME NOT NULL,
        batch_number VARCHAR(50),
        expiry_date DATE,
        collected_by VARCHAR(255),
        hemoglobin_level DECIMAL(4,1),
        blood_pressure VARCHAR(20),
        pulse_rate INTEGER,
        temperature DECIMAL(4,1),
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Created blood_donation_records table');

    // Create indexes
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_campaigns_hospital ON blood_donation_campaigns(hospital_id)',
      'CREATE INDEX IF NOT EXISTS idx_campaigns_status ON blood_donation_campaigns(status)',
      'CREATE INDEX IF NOT EXISTS idx_campaigns_dates ON blood_donation_campaigns(start_date, end_date)',
      'CREATE INDEX IF NOT EXISTS idx_registrations_campaign ON blood_donation_registrations(campaign_id)',
      'CREATE INDEX IF NOT EXISTS idx_registrations_user ON blood_donation_registrations(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_registrations_status ON blood_donation_registrations(status)',
      'CREATE INDEX IF NOT EXISTS idx_records_campaign ON blood_donation_records(campaign_id)',
      'CREATE INDEX IF NOT EXISTS idx_records_hospital ON blood_donation_records(hospital_id)',
    ];

    for (const idx of indexes) {
      await pool.query(idx);
      console.log(`✅ Created index: ${idx.split('ON')[0].trim()}`);
    }

    console.log('✅ Migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
}

migrateCampaigns();