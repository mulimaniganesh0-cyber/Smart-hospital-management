-- Preserve each expiry batch while retaining blood_bank as the compatibility
-- aggregate used by existing request, transfer, and reporting endpoints.
CREATE TABLE IF NOT EXISTS blood_inventory_batches (
  id BIGSERIAL PRIMARY KEY,
  blood_bank_id INTEGER NOT NULL REFERENCES blood_bank(id) ON DELETE CASCADE,
  hospital_id INTEGER NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  blood_group VARCHAR(5) NOT NULL,
  batch_number VARCHAR(80) NOT NULL,
  units_available NUMERIC(8,2) NOT NULL DEFAULT 0 CHECK (units_available >= 0),
  expiry_date DATE,
  donation_date DATE,
  donor_name VARCHAR(255),
  donor_phone VARCHAR(30),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (blood_bank_id, batch_number)
);

CREATE INDEX IF NOT EXISTS idx_blood_batches_hospital_group_expiry
  ON blood_inventory_batches (hospital_id, blood_group, expiry_date);

-- Canonicalize legacy spellings only when they will not collide with another
-- row. The app's reads already sum aliases; ambiguous duplicate rows need an
-- explicit inventory reconciliation rather than an unsafe automatic merge.
DO $$
DECLARE collision_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO collision_count FROM (
    SELECT hospital_id,
      CASE
        WHEN upper(regexp_replace(trim(blood_group), '[ ._]', '', 'g')) ~ '^(AB|A|B|O)(\+|PLUS|POSITIVE|POS|\+VE)$'
          THEN regexp_replace(upper(regexp_replace(trim(blood_group), '[ ._]', '', 'g')), '^(AB|A|B|O)(.*)$', '\1+')
        WHEN upper(regexp_replace(trim(blood_group), '[ ._]', '', 'g')) ~ '^(AB|A|B|O)(-|MINUS|NEGATIVE|NEG|-VE)$'
          THEN regexp_replace(upper(regexp_replace(trim(blood_group), '[ ._]', '', 'g')), '^(AB|A|B|O)(.*)$', '\1-')
        ELSE upper(trim(blood_group))
      END AS canonical_group,
      COUNT(*)
    FROM blood_bank GROUP BY hospital_id, canonical_group HAVING COUNT(*) > 1
  ) collisions;
  IF collision_count > 0 THEN
    RAISE EXCEPTION 'Cannot canonicalize duplicate blood group aliases without inventory reconciliation';
  END IF;
END $$;

UPDATE blood_bank SET blood_group = CASE
  WHEN upper(regexp_replace(trim(blood_group), '[ ._]', '', 'g')) ~ '^(AB|A|B|O)(\+|PLUS|POSITIVE|POS|\+VE)$'
    THEN regexp_replace(upper(regexp_replace(trim(blood_group), '[ ._]', '', 'g')), '^(AB|A|B|O)(.*)$', '\1+')
  WHEN upper(regexp_replace(trim(blood_group), '[ ._]', '', 'g')) ~ '^(AB|A|B|O)(-|MINUS|NEGATIVE|NEG|-VE)$'
    THEN regexp_replace(upper(regexp_replace(trim(blood_group), '[ ._]', '', 'g')), '^(AB|A|B|O)(.*)$', '\1-')
  ELSE upper(trim(blood_group))
END;

-- Convert each existing aggregate row into its own initial batch.
INSERT INTO blood_inventory_batches
  (blood_bank_id, hospital_id, blood_group, batch_number, units_available,
   expiry_date, donation_date, donor_name, donor_phone, created_at, updated_at)
SELECT id, hospital_id, blood_group,
       COALESCE(NULLIF(batch_number, ''), 'LEGACY-' || id::text),
       GREATEST(units_available, 0), expiry_date, donation_date, donor_name,
       donor_phone, COALESCE(last_updated, CURRENT_TIMESTAMP), CURRENT_TIMESTAMP
FROM blood_bank
ON CONFLICT (blood_bank_id, batch_number) DO NOTHING;

CREATE OR REPLACE FUNCTION sync_blood_bank_batches_from_aggregate()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  batch_total NUMERIC(8,2);
  difference NUMERIC(8,2);
  remaining NUMERIC(8,2);
  item RECORD;
BEGIN
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  SELECT COALESCE(SUM(units_available) FILTER (WHERE units_available > 0 AND (expiry_date IS NULL OR expiry_date >= CURRENT_DATE)), 0)
    INTO batch_total FROM blood_inventory_batches WHERE blood_bank_id = NEW.id;
  difference := GREATEST(COALESCE(NEW.units_available, 0), 0) - batch_total;

  IF difference > 0 THEN
    INSERT INTO blood_inventory_batches
      (blood_bank_id, hospital_id, blood_group, batch_number, units_available, expiry_date, donor_name)
    VALUES (NEW.id, NEW.hospital_id, NEW.blood_group,
      'ADJUSTMENT-' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS') || '-' || txid_current()::text,
      difference, NEW.expiry_date, 'Inventory adjustment');
  ELSIF difference < 0 THEN
    remaining := -difference;
    FOR item IN
      SELECT id, units_available FROM blood_inventory_batches
      WHERE blood_bank_id = NEW.id AND units_available > 0
        AND (expiry_date IS NULL OR expiry_date >= CURRENT_DATE)
      ORDER BY expiry_date NULLS LAST, created_at, id
      FOR UPDATE
    LOOP
      EXIT WHEN remaining <= 0;
      IF item.units_available <= remaining THEN
        UPDATE blood_inventory_batches SET units_available = 0, updated_at = CURRENT_TIMESTAMP WHERE id = item.id;
        remaining := remaining - item.units_available;
      ELSE
        UPDATE blood_inventory_batches SET units_available = units_available - remaining, updated_at = CURRENT_TIMESTAMP WHERE id = item.id;
        remaining := 0;
      END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS blood_bank_batches_sync ON blood_bank;
CREATE TRIGGER blood_bank_batches_sync
AFTER INSERT OR UPDATE OF units_available ON blood_bank
FOR EACH ROW EXECUTE FUNCTION sync_blood_bank_batches_from_aggregate();

-- Expired batches are retained for audit/editing but do not contribute to
-- available stock totals.
UPDATE blood_bank bb SET units_available = COALESCE((
  SELECT SUM(b.units_available) FROM blood_inventory_batches b
  WHERE b.blood_bank_id = bb.id AND b.units_available > 0
    AND (b.expiry_date IS NULL OR b.expiry_date >= CURRENT_DATE)
), 0);
