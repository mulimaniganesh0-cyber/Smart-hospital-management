const ensureMedicalSchema = async (pool) => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS medical_profiles (
      id SERIAL PRIMARY KEY, patient_id INTEGER UNIQUE NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
      blood_group VARCHAR(5), height_cm NUMERIC(5,2), weight_kg NUMERIC(5,2),
      allergies JSONB NOT NULL DEFAULT '[]', chronic_conditions JSONB NOT NULL DEFAULT '[]',
      current_medications JSONB NOT NULL DEFAULT '[]', emergency_contacts JSONB NOT NULL DEFAULT '[]',
      onboarding_completed_at TIMESTAMP, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS medical_records (
      id SERIAL PRIMARY KEY, patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
      record_type VARCHAR(40) NOT NULL, title VARCHAR(255) NOT NULL, record_date DATE NOT NULL,
      source VARCHAR(30) NOT NULL CHECK (source IN ('PATIENT_PROVIDED','PATIENT_UPLOADED','DOCTOR_VERIFIED','HOSPITAL_VERIFIED','SYSTEM_GENERATED')),
      verification_status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (verification_status IN ('PENDING','VERIFIED')),
      details JSONB NOT NULL DEFAULT '{}', created_by_user_id INTEGER REFERENCES users(id), verified_by_user_id INTEGER REFERENCES users(id),
      version INTEGER NOT NULL DEFAULT 1, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS medical_record_versions (
      id SERIAL PRIMARY KEY, medical_record_id INTEGER NOT NULL REFERENCES medical_records(id) ON DELETE CASCADE,
      version INTEGER NOT NULL, details JSONB NOT NULL, changed_by_user_id INTEGER REFERENCES users(id), change_reason TEXT NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(medical_record_id, version)
    );
    CREATE TABLE IF NOT EXISTS medical_access_grants (
      id SERIAL PRIMARY KEY, patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
      doctor_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, purpose VARCHAR(50) NOT NULL,
      expires_at TIMESTAMP, revoked_at TIMESTAMP, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS medical_access_audit_logs (
      id SERIAL PRIMARY KEY, patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
      actor_user_id INTEGER NOT NULL REFERENCES users(id), action VARCHAR(50) NOT NULL, reason TEXT,
      appointment_id INTEGER REFERENCES appointments(id), emergency_access BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_medical_records_patient_date ON medical_records(patient_id, record_date DESC);
    CREATE INDEX IF NOT EXISTS idx_medical_access_doctor ON medical_access_grants(doctor_user_id, patient_id);
    ALTER TABLE medical_records ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP, ADD COLUMN IF NOT EXISTS deleted_by_user_id INTEGER REFERENCES users(id), ADD COLUMN IF NOT EXISTS deletion_reason TEXT;
    CREATE INDEX IF NOT EXISTS idx_medical_records_active_patient_date ON medical_records(patient_id, record_date DESC) WHERE deleted_at IS NULL;
    CREATE TABLE IF NOT EXISTS chatbot_conversations (
      conversation_id VARCHAR(64) PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      state JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_chatbot_conversations_user_updated ON chatbot_conversations(user_id, updated_at DESC);
  `);
};

module.exports = { ensureMedicalSchema };
