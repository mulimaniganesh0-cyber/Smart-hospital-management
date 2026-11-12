-- Enforce inventory invariants for new writes without failing deployment on
-- legacy rows that may need separate review and correction.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='hospital_resources_counts_nonnegative') THEN
    ALTER TABLE hospital_resources ADD CONSTRAINT hospital_resources_counts_nonnegative
      CHECK (
        COALESCE(general_beds_total,0) >= 0 AND COALESCE(general_beds_available,0) >= 0 AND
        COALESCE(icu_beds_total,0) >= 0 AND COALESCE(icu_beds_available,0) >= 0 AND
        COALESCE(ventilators_total,0) >= 0 AND COALESCE(ventilators_available,0) >= 0 AND
        COALESCE(oxygen_supported_beds_total,0) >= 0 AND COALESCE(oxygen_supported_beds_available,0) >= 0
      ) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='hospital_resources_available_lte_total') THEN
    ALTER TABLE hospital_resources ADD CONSTRAINT hospital_resources_available_lte_total
      CHECK (
        COALESCE(general_beds_available,0) <= COALESCE(general_beds_total,0) AND
        COALESCE(icu_beds_available,0) <= COALESCE(icu_beds_total,0) AND
        COALESCE(ventilators_available,0) <= COALESCE(ventilators_total,0) AND
        COALESCE(oxygen_supported_beds_available,0) <= COALESCE(oxygen_supported_beds_total,0)
      ) NOT VALID;
  END IF;
END $$;
