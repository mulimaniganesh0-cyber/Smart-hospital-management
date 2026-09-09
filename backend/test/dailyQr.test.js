const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { payloadFor } = require('../src/controllers/dailyQrController');

test('daily QR payload is opaque and does not expose hospital or patient data', () => {
  const payload = payloadFor('F2XwS01uFuCd2hVKi8uvTQfYI2x71dD2');
  assert.equal(payload, 'careguide://hospital-queue/F2XwS01uFuCd2hVKi8uvTQfYI2x71dD2');
  assert.doesNotMatch(payload, /hospitalId|patient|password/i);
});

test('daily QR migration enforces one QR per hospital and date', () => {
  const sql = fs.readFileSync(path.join(__dirname, '../src/migrations/009_hospital_daily_qr.sql'), 'utf8');
  assert.match(sql, /UNIQUE \(hospital_id, qr_date\)/);
  assert.match(sql, /status IN \('ACTIVE', 'EXPIRED', 'REVOKED'\)/);
});
