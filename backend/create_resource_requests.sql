-- create_resource_requests.sql
-- Create resource_requests table for patients to request beds, ventilators, etc.

CREATE TABLE IF NOT EXISTS resource_requests (
  id SERIAL PRIMARY KEY,
  patient_id INTEGER REFERENCES patients(id) ON DELETE CASCADE,
  hospital_id INTEGER REFERENCES hospitals(id) ON DELETE CASCADE,
  resource_type VARCHAR(50) NOT NULL CHECK (resource_type IN ('bed', 'icu_bed', 'ventilator', 'oxygen_bed')),
  units_requested INTEGER DEFAULT 1,
  urgency VARCHAR(20) DEFAULT 'normal' CHECK (urgency IN ('normal', 'urgent', 'emergency')),
  notes TEXT,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'fulfilled')),
  response_notes TEXT,
  request_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  responded_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_resource_requests_patient_id ON resource_requests(patient_id);
CREATE INDEX IF NOT EXISTS idx_resource_requests_hospital_id ON resource_requests(hospital_id);
CREATE INDEX IF NOT EXISTS idx_resource_requests_status ON resource_requests(status);

-- Add comment to table
COMMENT ON TABLE resource_requests IS 'Stores patient requests for hospital resources like beds, ventilators, etc.';