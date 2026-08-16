const { pool } = require('../config/database');

async function migrate() {
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS hospital_reviews (
      id SERIAL PRIMARY KEY, hospital_id INTEGER NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
      patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
      appointment_id INTEGER NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
      rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5), review TEXT,
      is_verified BOOLEAN NOT NULL DEFAULT FALSE, is_visible BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(appointment_id))`);
    await pool.query(`CREATE TABLE IF NOT EXISTS doctor_reviews (
      id SERIAL PRIMARY KEY, doctor_id INTEGER NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
      patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
      appointment_id INTEGER NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
      rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5), review TEXT,
      is_verified BOOLEAN NOT NULL DEFAULT FALSE, is_visible BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(appointment_id))`);
    await pool.query(`CREATE TABLE IF NOT EXISTS review_reports (
      id SERIAL PRIMARY KEY, review_type VARCHAR(20) NOT NULL CHECK (review_type IN ('hospital','doctor')),
      review_id INTEGER NOT NULL, reported_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      reason VARCHAR(40) NOT NULL CHECK (reason IN ('spam','abusive','fake','offensive','privacy','other')),
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
      UNIQUE(review_type, review_id, reported_by))`);
    console.log('Patient review migration complete.');
  } finally { await pool.end(); }
}
migrate().catch((error) => { console.error(error); process.exitCode = 1; });
