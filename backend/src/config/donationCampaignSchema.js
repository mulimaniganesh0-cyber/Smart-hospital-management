// Idempotent upgrades for the existing blood-donation campaign workflow.
// This deliberately extends the original campaign tables instead of creating
// a second campaign or blood-inventory system.
async function ensureDonationCampaignSchema(pool) {
  await pool.query(`
    ALTER TABLE blood_donation_campaigns
      ADD COLUMN IF NOT EXISTS registration_deadline TIMESTAMP,
      ADD COLUMN IF NOT EXISTS maximum_donors INTEGER,
      ADD COLUMN IF NOT EXISTS total_blood_collected NUMERIC(10,2) NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS registered_donors INTEGER NOT NULL DEFAULT 0;

    ALTER TABLE blood_donation_registrations
      ADD COLUMN IF NOT EXISTS hospital_id INTEGER REFERENCES hospitals(id),
      ADD COLUMN IF NOT EXISTS attendance_status VARCHAR(20) NOT NULL DEFAULT 'NOT_ATTENDED',
      ADD COLUMN IF NOT EXISTS donation_status VARCHAR(20) NOT NULL DEFAULT 'NOT_DONATED',
      ADD COLUMN IF NOT EXISTS eligibility_status VARCHAR(20),
      ADD COLUMN IF NOT EXISTS eligibility_notes TEXT,
      ADD COLUMN IF NOT EXISTS actual_donation_id INTEGER,
      ADD COLUMN IF NOT EXISTS units_donated NUMERIC(8,2) NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS check_in_time TIMESTAMP,
      ADD COLUMN IF NOT EXISTS donation_time TIMESTAMP;

    CREATE TABLE IF NOT EXISTS blood_inventory_transactions (
      id SERIAL PRIMARY KEY,
      hospital_id INTEGER NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
      blood_bank_id INTEGER REFERENCES blood_bank(id) ON DELETE SET NULL,
      blood_group VARCHAR(5) NOT NULL,
      transaction_type VARCHAR(20) NOT NULL CHECK (transaction_type IN ('DONATION','ISSUED','ADJUSTMENT','EXPIRY','RETURN')),
      units NUMERIC(8,2) NOT NULL CHECK (units > 0),
      reference_type VARCHAR(40) NOT NULL,
      reference_id INTEGER,
      donor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      campaign_id INTEGER REFERENCES blood_donation_campaigns(id) ON DELETE SET NULL,
      donation_id INTEGER UNIQUE REFERENCES blood_donation_records(id) ON DELETE SET NULL,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_campaign_registration_once
      ON blood_donation_registrations(campaign_id, user_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_donation_once_per_registration
      ON blood_donation_records(registration_id) WHERE registration_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_blood_transactions_hospital_created
      ON blood_inventory_transactions(hospital_id, created_at DESC);
  `);

  // The campaign form permits half-unit donations; keep live inventory and
  // campaign records at the same precision.
  await pool.query(`
    ALTER TABLE blood_bank ALTER COLUMN units_available TYPE NUMERIC(8,2) USING units_available::NUMERIC(8,2);
    ALTER TABLE blood_donation_records ALTER COLUMN units_donated TYPE NUMERIC(8,2) USING units_donated::NUMERIC(8,2);
    ALTER TABLE blood_donation_registrations ALTER COLUMN units_donated TYPE NUMERIC(8,2) USING units_donated::NUMERIC(8,2);
    ALTER TABLE blood_donation_history ALTER COLUMN units_donated TYPE NUMERIC(8,2) USING units_donated::NUMERIC(8,2);
    ALTER TABLE blood_donation_campaigns ALTER COLUMN total_blood_collected TYPE NUMERIC(10,2) USING total_blood_collected::NUMERIC(10,2);
  `);

  // Backfill the ownership key from the campaign for registrations created by
  // the older endpoint. This gives later authorization checks one consistent
  // source without trusting a hospital id from the client.
  await pool.query(`
    UPDATE blood_donation_registrations r
    SET hospital_id = c.hospital_id
    FROM blood_donation_campaigns c
    WHERE r.campaign_id = c.id AND r.hospital_id IS NULL
  `);
}

module.exports = { ensureDonationCampaignSchema };
