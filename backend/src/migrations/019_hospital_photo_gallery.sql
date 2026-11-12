CREATE TABLE IF NOT EXISTS hospital_photos (
  id SERIAL PRIMARY KEY,
  hospital_id INTEGER NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  storage_key VARCHAR(80) NOT NULL UNIQUE,
  caption VARCHAR(200) NOT NULL DEFAULT '',
  category VARCHAR(40) NOT NULL DEFAULT 'other'
    CHECK (category IN ('exterior', 'entrance', 'emergency', 'ward', 'icu', 'laboratory', 'pharmacy', 'other')),
  display_order INTEGER NOT NULL DEFAULT 0 CHECK (display_order >= 0),
  is_cover BOOLEAN NOT NULL DEFAULT FALSE,
  is_published BOOLEAN NOT NULL DEFAULT FALSE,
  uploaded_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_hospital_photos_public_gallery
  ON hospital_photos(hospital_id, display_order, id)
  WHERE is_published = TRUE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_hospital_photos_one_published_cover
  ON hospital_photos(hospital_id)
  WHERE is_cover = TRUE AND is_published = TRUE;
