-- Driver identity and approval are separate from general user roles.
ALTER TABLE users ADD COLUMN IF NOT EXISTS driver_type VARCHAR(30);
ALTER TABLE users ADD COLUMN IF NOT EXISTS driver_status VARCHAR(30);
ALTER TABLE users ADD COLUMN IF NOT EXISTS driver_license_number VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS driver_license_expiry DATE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS driver_service_area TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS driver_operating_location TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS driver_vehicle_details JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE users ADD COLUMN IF NOT EXISTS driver_verification_documents JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE users ADD COLUMN IF NOT EXISTS driver_reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS driver_reviewed_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS driver_review_notes TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS driver_invite_token_hash VARCHAR(128);
ALTER TABLE users ADD COLUMN IF NOT EXISTS driver_invite_expires_at TIMESTAMP;

-- Existing hospital driver accounts were provisioned by hospital staff. Preserve
-- those accounts while requiring explicit classification and a healthy status.
UPDATE users SET driver_type='hospital_driver', driver_status='active'
WHERE role='ambulance_driver' AND driver_type IS NULL AND hospital_id IS NOT NULL
  AND COALESCE(account_status,'ACTIVE')='ACTIVE';
UPDATE users SET driver_type='hospital_driver', driver_status='suspended'
WHERE role='ambulance_driver' AND driver_type IS NULL AND hospital_id IS NOT NULL;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='users_driver_type_check') THEN
    ALTER TABLE users ADD CONSTRAINT users_driver_type_check
      CHECK (driver_type IS NULL OR driver_type IN ('hospital_driver','private_driver'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='users_driver_status_check') THEN
    ALTER TABLE users ADD CONSTRAINT users_driver_status_check
      CHECK (driver_status IS NULL OR driver_status IN ('invited','pending_verification','active','rejected','suspended','deactivated'));
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_users_driver_review ON users(driver_type,driver_status,created_at DESC)
  WHERE role='ambulance_driver';

ALTER TABLE ambulances ADD COLUMN IF NOT EXISTS driver_location_accuracy NUMERIC(10,2);
ALTER TABLE ambulances ADD COLUMN IF NOT EXISTS private_operator_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE ambulances ADD COLUMN IF NOT EXISTS registration_document JSONB NOT NULL DEFAULT '[]'::jsonb;
-- Keep this migration safe to apply when 016 was skipped or only partially
-- deployed. This is the same nullable driver relationship defined in 016.
ALTER TABLE ambulances ADD COLUMN IF NOT EXISTS driver_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE ambulance_bookings ADD COLUMN IF NOT EXISTS driver_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE ambulance_bookings ADD COLUMN IF NOT EXISTS pickup_accuracy NUMERIC(10,2);
ALTER TABLE ambulance_bookings ADD COLUMN IF NOT EXISTS pickup_timestamp TIMESTAMP;
ALTER TABLE ambulance_bookings ADD COLUMN IF NOT EXISTS pickup_location_shared BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE ambulance_bookings ADD COLUMN IF NOT EXISTS patient_location_updated_at TIMESTAMP;
ALTER TABLE ambulance_bookings ADD COLUMN IF NOT EXISTS patient_location_accuracy NUMERIC(10,2);
ALTER TABLE ambulance_bookings ADD COLUMN IF NOT EXISTS patient_location_lat DECIMAL(10,8);
ALTER TABLE ambulance_bookings ADD COLUMN IF NOT EXISTS patient_location_lng DECIMAL(11,8);
UPDATE ambulance_bookings b SET driver_user_id=a.driver_user_id FROM ambulances a
WHERE b.ambulance_id=a.id AND b.driver_user_id IS NULL;

ALTER TABLE emergency_requests ADD COLUMN IF NOT EXISTS patient_location_sharing BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE emergency_requests ADD COLUMN IF NOT EXISTS patient_location_updated_at TIMESTAMP;
ALTER TABLE emergency_requests ADD COLUMN IF NOT EXISTS patient_location_accuracy NUMERIC(10,2);
UPDATE emergency_requests SET patient_location_updated_at=location_timestamp
WHERE location_timestamp IS NOT NULL AND patient_location_updated_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_active_booking_driver ON ambulance_bookings(driver_user_id,updated_at DESC)
  WHERE driver_user_id IS NOT NULL AND status NOT IN ('completed','cancelled');
