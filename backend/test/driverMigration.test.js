const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const migrations = path.join(__dirname, '..', 'src', 'migrations');
const migration016 = fs.readFileSync(path.join(migrations, '016_ambulance_driver_assignments.sql'), 'utf8');
const migration017 = fs.readFileSync(path.join(migrations, '017_driver_authorization_and_patient_tracking.sql'), 'utf8');

test('migration 016 defines the ambulance driver source relationship used by booking backfill', () => {
  assert.match(migration016, /ALTER TABLE ambulances ADD COLUMN IF NOT EXISTS driver_user_id INTEGER REFERENCES users\(id\) ON DELETE SET NULL/i);
  assert.match(migration017, /UPDATE ambulance_bookings b SET driver_user_id=a\.driver_user_id FROM ambulances a/i);
});

test('migration 017 safely ensures the source relationship before backfilling bookings', () => {
  const ensure = migration017.indexOf('ALTER TABLE ambulances ADD COLUMN IF NOT EXISTS driver_user_id');
  const backfill = migration017.indexOf('UPDATE ambulance_bookings b SET driver_user_id=a.driver_user_id FROM ambulances a');
  assert.notEqual(ensure, -1);
  assert.notEqual(backfill, -1);
  assert.ok(ensure < backfill);
});
