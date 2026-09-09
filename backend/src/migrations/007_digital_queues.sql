CREATE TABLE IF NOT EXISTS hospital_queues (
  id SERIAL PRIMARY KEY,
  hospital_id INTEGER NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  doctor_id INTEGER REFERENCES doctors(id) ON DELETE SET NULL,
  department TEXT,
  queue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  service_type TEXT NOT NULL DEFAULT 'OUTPATIENT',
  current_token_number INTEGER,
  next_token_number INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','PAUSED','CLOSED')),
  default_consultation_minutes INTEGER NOT NULL DEFAULT 10 CHECK (default_consultation_minutes BETWEEN 1 AND 120),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_hospital_queues_scope
  ON hospital_queues(hospital_id, COALESCE(doctor_id, -1), COALESCE(department, ''), queue_date, service_type);

CREATE TABLE IF NOT EXISTS queue_tokens (
  id SERIAL PRIMARY KEY,
  queue_id INTEGER NOT NULL REFERENCES hospital_queues(id) ON DELETE RESTRICT,
  patient_id INTEGER REFERENCES patients(id) ON DELETE SET NULL,
  token_number INTEGER NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('ONLINE','QR','WALK_IN')),
  status TEXT NOT NULL CHECK (status IN ('BOOKED','CHECKED_IN','WAITING','CALLED','SERVING','COMPLETED','CANCELLED','SKIPPED','NO_SHOW','EXPIRED','HELD')),
  priority TEXT NOT NULL DEFAULT 'NORMAL' CHECK (priority IN ('NORMAL','PRIORITY','EMERGENCY')),
  booked_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  checked_in_at TIMESTAMP,
  called_at TIMESTAMP,
  serving_at TIMESTAMP,
  completed_at TIMESTAMP,
  cancelled_at TIMESTAMP,
  expires_at TIMESTAMP,
  estimated_wait_minutes INTEGER,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT queue_tokens_number_unique UNIQUE (queue_id, token_number)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_queue_tokens_one_active_patient
  ON queue_tokens(queue_id, patient_id)
  WHERE patient_id IS NOT NULL AND status IN ('BOOKED','CHECKED_IN','WAITING','CALLED','SERVING','HELD');
CREATE INDEX IF NOT EXISTS idx_queue_tokens_queue_state ON queue_tokens(queue_id, status, token_number);
CREATE INDEX IF NOT EXISTS idx_queue_tokens_patient_active ON queue_tokens(patient_id, created_at DESC);
