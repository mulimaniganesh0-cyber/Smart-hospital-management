-- A recorded entrance is used for navigation only after hospital confirmation.
ALTER TABLE hospitals ADD COLUMN IF NOT EXISTS entrance_address TEXT;
ALTER TABLE hospitals ADD COLUMN IF NOT EXISTS entrance_verified BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE hospitals ADD COLUMN IF NOT EXISTS entrance_verified_at TIMESTAMP;
