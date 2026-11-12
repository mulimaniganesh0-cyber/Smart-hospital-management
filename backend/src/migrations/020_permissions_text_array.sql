-- The application reads permissions with Array.includes and writes PostgreSQL
-- text arrays. Normalize legacy JSONB installations without discarding entries.
CREATE OR REPLACE FUNCTION _migration_020_permissions_jsonb_to_text_array(value JSONB)
RETURNS TEXT[] LANGUAGE SQL IMMUTABLE AS $fn$
  SELECT CASE
    WHEN $1 IS NULL OR jsonb_typeof($1)='null' THEN NULL
    WHEN jsonb_typeof($1)='array' THEN COALESCE(
      (SELECT array_agg(item) FROM jsonb_array_elements_text($1) AS j(item)),
      '{}'::text[]
    )
    ELSE ARRAY[$1::text]
  END
$fn$;

DO $$
DECLARE
  permissions_type TEXT;
BEGIN
  SELECT udt_name INTO permissions_type
  FROM information_schema.columns
  WHERE table_schema=current_schema() AND table_name='users' AND column_name='permissions';

  IF permissions_type='_jsonb' THEN
    ALTER TABLE users ALTER COLUMN permissions TYPE TEXT[] USING
      _migration_020_permissions_jsonb_to_text_array(permissions);
  ELSIF permissions_type IS DISTINCT FROM '_text' THEN
    RAISE EXCEPTION 'Unsupported users.permissions type: %', COALESCE(permissions_type, '<missing>');
  END IF;

  ALTER TABLE users ALTER COLUMN permissions SET DEFAULT '{}'::text[];
END $$;

DROP FUNCTION _migration_020_permissions_jsonb_to_text_array(JSONB);
