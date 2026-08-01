// src/config/initChatbotDB.js
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT) || 5432,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

async function initChatbotTables() {
  const client = await pool.connect();
  
  try {
    console.log('🗄️ Initializing chatbot database tables...');

    // Emergency contacts table
    await client.query(`
      CREATE TABLE IF NOT EXISTS emergency_contacts (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        number VARCHAR(20) NOT NULL,
        type VARCHAR(50) NOT NULL,
        description TEXT,
        priority INTEGER DEFAULT 1,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ Emergency contacts table created');

    // Blood inventory table
    await client.query(`
      CREATE TABLE IF NOT EXISTS blood_inventory (
        id SERIAL PRIMARY KEY,
        blood_group VARCHAR(5) NOT NULL,
        units_available INTEGER DEFAULT 0,
        minimum_threshold INTEGER DEFAULT 10,
        last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        hospital_id INTEGER REFERENCES hospitals(id) ON DELETE CASCADE,
        UNIQUE(blood_group, hospital_id)
      );
    `);
    console.log('✅ Blood inventory table created');

    // Chat history table
    await client.query(`
      CREATE TABLE IF NOT EXISTS chat_history (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        message TEXT NOT NULL,
        response TEXT NOT NULL,
        intent VARCHAR(50),
        language VARCHAR(10),
        latitude FLOAT,
        longitude FLOAT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ Chat history table created');

    // Insert default emergency contacts
    await client.query(`
      INSERT INTO emergency_contacts (name, number, type, description, priority)
      VALUES 
        ('Emergency Ambulance', '108', 'ambulance', 'National Emergency Ambulance Service', 1),
        ('Police Emergency', '112', 'police', 'National Police Emergency', 2),
        ('Fire Emergency', '101', 'fire', 'National Fire Service', 3),
        ('NGO Helpline', '1098', 'ngo', 'Child Helpline', 4)
      ON CONFLICT (id) DO NOTHING;
    `);
    console.log('✅ Default emergency contacts added');

    console.log('🎉 Chatbot database initialization completed!');

  } catch (error) {
    console.error('❌ Database initialization error:', error);
  } finally {
    client.release();
  }
}

// Run initialization
if (require.main === module) {
  initChatbotTables().then(() => process.exit(0));
}

module.exports = initChatbotTables;