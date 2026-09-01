-- Optional destination coordinates for navigation.  The ordinary hospital
-- coordinates remain the fallback until an administrator records a main gate.
ALTER TABLE IF EXISTS hospitals
  ADD COLUMN IF NOT EXISTS entrance_latitude DECIMAL(10, 8);

ALTER TABLE IF EXISTS hospitals
  ADD COLUMN IF NOT EXISTS entrance_longitude DECIMAL(11, 8);
