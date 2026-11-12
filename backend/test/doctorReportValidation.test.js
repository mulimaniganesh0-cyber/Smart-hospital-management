const test = require('node:test');
const assert = require('node:assert/strict');
const doctor = require('../src/controllers/doctorPortalController');

function response() {
  return {
    code: 200,
    body: null,
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test('doctor report requires a non-empty diagnosis before database access', async () => {
  const res = response();
  await doctor.saveReport({ body: { diagnosis: '   ' } }, res);
  assert.equal(res.code, 400);
  assert.match(res.body.message, /diagnosis/i);
});

test('doctor report rejects malformed follow-up dates before database access', async () => {
  const res = response();
  await doctor.saveReport({ body: { diagnosis: 'Migraine', follow_up_date: 'next week' } }, res);
  assert.equal(res.code, 400);
  assert.match(res.body.message, /YYYY-MM-DD/);
});
