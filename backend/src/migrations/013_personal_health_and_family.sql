-- Additive longitudinal-record, publication, and consent support.
ALTER TABLE medical_records ADD COLUMN IF NOT EXISTS appointment_id INTEGER REFERENCES appointments(id) ON DELETE SET NULL;
ALTER TABLE medical_records ADD COLUMN IF NOT EXISTS doctor_id INTEGER REFERENCES doctors(id) ON DELETE SET NULL;
ALTER TABLE medical_records ADD COLUMN IF NOT EXISTS hospital_id INTEGER REFERENCES hospitals(id) ON DELETE SET NULL;
ALTER TABLE medical_records ADD COLUMN IF NOT EXISTS publication_status VARCHAR(20) NOT NULL DEFAULT 'PUBLISHED';
ALTER TABLE medical_records ADD COLUMN IF NOT EXISTS published_at TIMESTAMP;
UPDATE medical_records SET published_at=COALESCE(published_at,created_at) WHERE publication_status='PUBLISHED';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='medical_records_publication_status_check') THEN
    ALTER TABLE medical_records ADD CONSTRAINT medical_records_publication_status_check CHECK (publication_status IN ('DRAFT','PUBLISHED'));
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_medical_records_patient_published_date ON medical_records(patient_id, publication_status, record_date DESC) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_doctor_record_per_appointment_type ON medical_records(appointment_id,record_type) WHERE appointment_id IS NOT NULL AND source='DOCTOR_VERIFIED' AND deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS family_relationships (
  id SERIAL PRIMARY KEY,
  owner_patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  member_patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  relationship VARCHAR(100) NOT NULL,
  permission VARCHAR(20) NOT NULL DEFAULT 'VIEW' CHECK(permission IN ('OWNER','VIEW','MANAGE','DOCTOR_SHARED')),
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','ACTIVE','REVOKED')),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK(owner_patient_id <> member_patient_id),
  UNIQUE(owner_patient_id,member_patient_id)
);
CREATE INDEX IF NOT EXISTS idx_family_relationship_access ON family_relationships(owner_patient_id,member_patient_id,status);

CREATE TABLE IF NOT EXISTS medical_record_shares (
  id SERIAL PRIMARY KEY,
  patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  doctor_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scope VARCHAR(30) NOT NULL DEFAULT 'ENTIRE_HISTORY' CHECK(scope IN ('ENTIRE_HISTORY','RECENT_RECORDS','PRESCRIPTIONS','LAB_REPORTS','SELECTED_RECORDS')),
  record_ids INTEGER[] NOT NULL DEFAULT '{}', expires_at TIMESTAMP, revoked_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_medical_shares_active ON medical_record_shares(doctor_user_id,patient_id) WHERE revoked_at IS NULL;
