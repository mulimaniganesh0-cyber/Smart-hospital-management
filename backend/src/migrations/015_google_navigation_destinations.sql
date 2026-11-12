-- Cached Google destination data. It is intentionally separate from the
-- hospital marker coordinates: routing may end at a road-side entrance.
ALTER TABLE hospitals ADD COLUMN IF NOT EXISTS google_formatted_address TEXT;
ALTER TABLE hospitals ADD COLUMN IF NOT EXISTS google_latitude DECIMAL(10, 8);
ALTER TABLE hospitals ADD COLUMN IF NOT EXISTS google_longitude DECIMAL(11, 8);
ALTER TABLE hospitals ADD COLUMN IF NOT EXISTS navigation_point_token TEXT;
ALTER TABLE hospitals ADD COLUMN IF NOT EXISTS navigation_point_name TEXT;
ALTER TABLE hospitals ADD COLUMN IF NOT EXISTS navigation_point_type VARCHAR(50);
ALTER TABLE hospitals ADD COLUMN IF NOT EXISTS navigation_verified BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE hospitals ADD COLUMN IF NOT EXISTS location_verified BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE hospitals ADD COLUMN IF NOT EXISTS location_source VARCHAR(50);
ALTER TABLE hospitals ADD COLUMN IF NOT EXISTS location_updated_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_hospitals_google_place_id
  ON hospitals (google_place_id) WHERE google_place_id IS NOT NULL;
