-- Doctor portal: additive, safe to rerun and compatible with existing records.
ALTER TABLE users ADD COLUMN IF NOT EXISTS account_status VARCHAR(40) NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_required BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE doctors ADD COLUMN IF NOT EXISTS account_activation_status VARCHAR(40) NOT NULL DEFAULT 'EMAIL_REQUIRED';
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS consultation_started_at TIMESTAMP;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS consultation_completed_at TIMESTAMP;

CREATE TABLE IF NOT EXISTS doctor_consultation_reports (
  id SERIAL PRIMARY KEY,
  appointment_id INTEGER NOT NULL UNIQUE REFERENCES appointments(id) ON DELETE CASCADE,
  patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  doctor_id INTEGER NOT NULL REFERENCES doctors(id) ON DELETE RESTRICT,
  hospital_id INTEGER NOT NULL REFERENCES hospitals(id) ON DELETE RESTRICT,
  diagnosis TEXT, symptoms TEXT, clinical_observations TEXT, treatment TEXT,
  advice TEXT, follow_up_date DATE, notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_doctor_reports_patient ON doctor_consultation_reports(patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_doctors_user ON doctors(user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_doctors_user_unique ON doctors(user_id) WHERE user_id IS NOT NULL;

-- Permit doctor accounts without disturbing existing roles.
DO $$ BEGIN
  ALTER TABLE users DROP CONSTRAINT IF EXISTS users_user_type_check;
  ALTER TABLE users ADD CONSTRAINT users_user_type_check
    CHECK (user_type IN ('patient', 'hospital', 'admin', 'staff', 'doctor'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
