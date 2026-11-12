-- Driver accounts reuse users.role='ambulance_driver'. These links make SOS
-- assignment explicit and enforceable without exposing all SOS records.
ALTER TABLE ambulances ADD COLUMN IF NOT EXISTS driver_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE emergency_requests ADD COLUMN IF NOT EXISTS assigned_driver_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE ambulances ADD COLUMN IF NOT EXISTS driver_location_lat DECIMAL(10,8);
ALTER TABLE ambulances ADD COLUMN IF NOT EXISTS driver_location_lng DECIMAL(11,8);
ALTER TABLE ambulances ADD COLUMN IF NOT EXISTS driver_location_timestamp TIMESTAMP;
CREATE INDEX IF NOT EXISTS idx_emergency_driver_active
  ON emergency_requests(assigned_driver_user_id, updated_at DESC)
  WHERE assigned_driver_user_id IS NOT NULL;
