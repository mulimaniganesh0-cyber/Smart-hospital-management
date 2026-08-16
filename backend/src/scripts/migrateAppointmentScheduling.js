// Safe, repeatable migration for live installations that already have the
// base schema. Run with: npm run migrate:appointment-scheduling
const { pool } = require('../config/database');

async function migrate() {
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS doctor_available_slots (
      id SERIAL PRIMARY KEY, doctor_id INTEGER NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
      slot_date DATE NOT NULL, slot_time TIME NOT NULL, is_available BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(doctor_id, slot_date, slot_time))`);
    await pool.query(`CREATE TABLE IF NOT EXISTS appointment_reschedule_history (
      id SERIAL PRIMARY KEY, appointment_id INTEGER NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
      previous_date DATE NOT NULL, previous_time TIME NOT NULL, new_date DATE NOT NULL, new_time TIME NOT NULL,
      changed_by_user_id INTEGER REFERENCES users(id), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_active_doctor_appointment_slot
      ON appointments(doctor_id, appointment_date, appointment_time)
      WHERE status NOT IN ('cancelled', 'rejected', 'completed')`);
    console.log('Appointment scheduling migration complete.');
  } finally { await pool.end(); }
}

migrate().catch((error) => { console.error(error); process.exitCode = 1; });
