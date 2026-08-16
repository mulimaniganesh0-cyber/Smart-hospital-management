const { pool } = require('../config/database');

async function migrate() {
  try {
    await pool.query(`ALTER TABLE hospitals
      ADD COLUMN IF NOT EXISTS google_rating DECIMAL(2,1),
      ADD COLUMN IF NOT EXISTS google_review_count INTEGER,
      ADD COLUMN IF NOT EXISTS google_place_id TEXT,
      ADD COLUMN IF NOT EXISTS google_maps_url TEXT,
      ADD COLUMN IF NOT EXISTS rating_source VARCHAR(50),
      ADD COLUMN IF NOT EXISTS rating_verified BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS rating_last_updated TIMESTAMP`);
    await pool.query(`ALTER TABLE hospitals ADD CONSTRAINT hospitals_google_rating_range CHECK (google_rating IS NULL OR (google_rating >= 1 AND google_rating <= 5))`)
      .catch((error) => { if (error.code !== '42710') throw error; });
    console.log('Google Places rating migration complete.');
  } finally { await pool.end(); }
}
migrate().catch((error) => { console.error(error); process.exitCode = 1; });
