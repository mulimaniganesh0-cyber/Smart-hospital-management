-- Managed doctor and driver credentials. A version bump invalidates JWTs issued
-- before a hospital password reset or a user's password change.
ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM users
    WHERE phone IS NOT NULL AND length(regexp_replace(phone,'[^0-9]','','g')) BETWEEN 8 AND 15
    GROUP BY regexp_replace(phone,'[^0-9]','','g') HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot enable normalized mobile login: duplicate account phone numbers must be resolved first';
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_mobile_lookup
  ON users ((regexp_replace(phone,'[^0-9]','','g')))
  WHERE phone IS NOT NULL AND length(regexp_replace(phone,'[^0-9]','','g')) BETWEEN 8 AND 15;
