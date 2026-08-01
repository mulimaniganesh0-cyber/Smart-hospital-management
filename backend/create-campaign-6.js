// create-campaign-6.js
const { pool } = require('./src/config/database');

async function createCampaign6() {
  try {
    console.log('Creating campaign with ID 6...');
    
    // Check if campaign with ID 6 exists
    const checkResult = await pool.query(
      'SELECT * FROM campaigns WHERE id = 6'
    );
    
    if (checkResult.rows.length > 0) {
      console.log('Campaign ID 6 already exists:', checkResult.rows[0]);
    } else {
      // Insert campaign with ID 6
      const result = await pool.query(
        `INSERT INTO campaigns (id, hospital_id, title, description, start_date, end_date, location, contact_number, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active')
         RETURNING *`,
        [
          6,
          3,
          'Blood Donation Drive 2026',
          'Help save lives by donating blood. Every donation counts!',
          '2026-07-10',
          '2026-07-25',
          'City Hospital - Blood Bank Center',
          '+91 9876543210'
        ]
      );
      console.log('✅ Campaign ID 6 created:', result.rows[0]);
    }
    
    // Also check if campaign ID 1 exists (from migration)
    const check1 = await pool.query('SELECT * FROM campaigns WHERE id = 1');
    if (check1.rows.length === 0) {
      await pool.query(
        `INSERT INTO campaigns (id, hospital_id, title, description, start_date, end_date, location, contact_number, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active')`,
        [
          1,
          3,
          'Summer Blood Donation Camp',
          'Join us for a blood donation camp to help save lives. All blood types are welcome.',
          '2026-07-15',
          '2026-07-20',
          'City General Hospital - Main Hall',
          '+91 9876543210'
        ]
      );
      console.log('✅ Campaign ID 1 created');
    }
    
    console.log('✅ Campaigns creation completed!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

createCampaign6();