-- Persistent, one-hospital-at-a-time SOS dispatch state. No inventory, hospital,
-- patient, or ambulance data is manufactured or modified by this migration.
ALTER TABLE emergency_requests ADD COLUMN IF NOT EXISTS accepting_hospital_id INTEGER REFERENCES hospitals(id);
ALTER TABLE emergency_requests ADD COLUMN IF NOT EXISTS location_accuracy NUMERIC(10,2);
ALTER TABLE emergency_requests ADD COLUMN IF NOT EXISTS location_timestamp TIMESTAMP;
ALTER TABLE emergency_requests ADD COLUMN IF NOT EXISTS escalation_exhausted_at TIMESTAMP;
ALTER TABLE emergency_requests ADD COLUMN IF NOT EXISTS secure_location_token_hash VARCHAR(128);
ALTER TABLE emergency_requests ADD COLUMN IF NOT EXISTS secure_location_expires_at TIMESTAMP;
CREATE UNIQUE INDEX IF NOT EXISTS idx_emergency_secure_location_token ON emergency_requests(secure_location_token_hash) WHERE secure_location_token_hash IS NOT NULL;

CREATE TABLE IF NOT EXISTS emergency_hospital_dispatches (
  id SERIAL PRIMARY KEY,
  emergency_id INTEGER NOT NULL REFERENCES emergency_requests(id) ON DELETE CASCADE,
  hospital_id INTEGER NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  sequence_number INTEGER NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  notified_at TIMESTAMP,
  response_deadline TIMESTAMP,
  responded_at TIMESTAMP,
  accepted_at TIMESTAMP,
  rejected_at TIMESTAMP,
  timed_out_at TIMESTAMP,
  rejection_reason TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(emergency_id, hospital_id),
  UNIQUE(emergency_id, sequence_number)
);
CREATE INDEX IF NOT EXISTS idx_emergency_dispatch_active_deadline
  ON emergency_hospital_dispatches(response_deadline) WHERE status='NOTIFIED';
CREATE INDEX IF NOT EXISTS idx_emergency_dispatch_hospital
  ON emergency_hospital_dispatches(hospital_id, status, created_at DESC);
