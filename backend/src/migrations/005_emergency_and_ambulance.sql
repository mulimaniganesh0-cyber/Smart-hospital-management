-- Makes the legacy emergency/ambulance schema match the APIs without removing data.
CREATE TABLE IF NOT EXISTS ambulance_bookings (
  id SERIAL PRIMARY KEY,
  patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  hospital_id INTEGER REFERENCES hospitals(id),
  ambulance_id INTEGER NOT NULL REFERENCES ambulances(id),
  pickup_location TEXT,
  pickup_lat DECIMAL(10, 8),
  pickup_lng DECIMAL(11, 8),
  dropoff_location TEXT,
  patient_name VARCHAR(255),
  patient_phone VARCHAR(30),
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  is_sos BOOLEAN NOT NULL DEFAULT FALSE,
  emergency_request_id INTEGER REFERENCES emergency_requests(id) ON DELETE SET NULL,
  booking_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP
);

ALTER TABLE patients ADD COLUMN IF NOT EXISTS emergency_contact_relationship VARCHAR(100);
ALTER TABLE ambulances ADD COLUMN IF NOT EXISTS status VARCHAR(30) NOT NULL DEFAULT 'AVAILABLE';
ALTER TABLE ambulances ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE ambulances ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE ambulance_bookings ADD COLUMN IF NOT EXISTS hospital_id INTEGER REFERENCES hospitals(id);
ALTER TABLE ambulance_bookings ADD COLUMN IF NOT EXISTS pickup_location TEXT;
ALTER TABLE ambulance_bookings ADD COLUMN IF NOT EXISTS pickup_lat DECIMAL(10, 8);
ALTER TABLE ambulance_bookings ADD COLUMN IF NOT EXISTS pickup_lng DECIMAL(11, 8);
ALTER TABLE ambulance_bookings ADD COLUMN IF NOT EXISTS dropoff_location TEXT;
ALTER TABLE ambulance_bookings ADD COLUMN IF NOT EXISTS is_sos BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE ambulance_bookings ADD COLUMN IF NOT EXISTS emergency_request_id INTEGER REFERENCES emergency_requests(id) ON DELETE SET NULL;
ALTER TABLE ambulance_bookings ADD COLUMN IF NOT EXISTS booking_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE ambulance_bookings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE emergency_requests ADD COLUMN IF NOT EXISTS location_recorded_at TIMESTAMP;
ALTER TABLE emergency_requests ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS recipient_phone VARCHAR(30);
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS delivery_status VARCHAR(20) NOT NULL DEFAULT 'pending';
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS failure_reason TEXT;

UPDATE ambulances
SET status = CASE WHEN is_available THEN 'AVAILABLE' ELSE 'BUSY' END
WHERE status IS NULL OR status NOT IN ('AVAILABLE', 'ASSIGNED', 'BUSY', 'OUT_OF_SERVICE');

-- Older installations used different names for these fields.  Referencing a
-- missing legacy column directly would abort the entire migration, so copy it
-- only when both columns exist.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'ambulance_bookings' AND column_name = 'pickup_address')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'ambulance_bookings' AND column_name = 'pickup_location') THEN
    EXECUTE 'UPDATE ambulance_bookings SET pickup_location = pickup_address WHERE pickup_location IS NULL AND pickup_address IS NOT NULL';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'ambulance_bookings' AND column_name = 'created_at')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'ambulance_bookings' AND column_name = 'booking_time') THEN
    EXECUTE 'UPDATE ambulance_bookings SET booking_time = created_at WHERE booking_time IS NULL AND created_at IS NOT NULL';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_ambulances_available
  ON ambulances(hospital_id, status) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_ambulance_bookings_patient ON ambulance_bookings(patient_id, booking_time DESC);

-- Seed only against hospitals that already exist; no hospital records are fabricated.
INSERT INTO ambulances (hospital_id, vehicle_number, type, is_available, status, is_active)
SELECT id, 'KA-23-GHC-108', 'Basic Life Support (BLS)', TRUE, 'AVAILABLE', TRUE
FROM hospitals
WHERE lower(name) = lower('Government Hospital, Chikodi')
   OR (lower(name) LIKE '%government%' AND lower(coalesce(city, '')) IN ('chikodi', 'chikkodi'))
ON CONFLICT (vehicle_number) DO NOTHING;

INSERT INTO ambulances (hospital_id, vehicle_number, type, is_available, status, is_active)
SELECT id, 'KA-23-KLE-108', 'Advanced Life Support (ALS)', TRUE, 'AVAILABLE', TRUE
FROM hospitals
WHERE lower(name) = lower('KLE Dr Prabhakar Kore Hospital, Chikodi')
   OR (lower(name) LIKE '%prabhakar kore%' AND lower(coalesce(city, '')) IN ('chikodi', 'chikkodi'))
ON CONFLICT (vehicle_number) DO NOTHING;
