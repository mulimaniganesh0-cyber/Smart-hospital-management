-- One opaque, auditable queue QR per hospital per local calendar day.
CREATE TABLE IF NOT EXISTS hospital_daily_qr (
  id SERIAL PRIMARY KEY,
  hospital_id INTEGER NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  qr_date DATE NOT NULL,
  qr_token VARCHAR(128) NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'EXPIRED', 'REVOKED')),
  valid_from TIMESTAMPTZ NOT NULL,
  valid_until TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT hospital_daily_qr_one_per_day UNIQUE (hospital_id, qr_date),
  CONSTRAINT hospital_daily_qr_window CHECK (valid_until > valid_from)
);

CREATE INDEX IF NOT EXISTS idx_hospital_daily_qr_validation
  ON hospital_daily_qr (qr_token, status, valid_until);
