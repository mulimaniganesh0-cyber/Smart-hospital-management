const test = require('node:test');
const assert = require('node:assert/strict');
const { pool } = require('../src/config/database');
const resourceController = require('../src/controllers/resourceController');
const bloodBankController = require('../src/controllers/bloodBankController');

function response() {
  return {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test('blood request rejects invalid group, hospital, and quantity before database writes', async (t) => {
  const originalQuery = pool.query;
  pool.query = async () => { throw new Error('invalid request reached database'); };
  t.after(() => { pool.query = originalQuery; });

  for (const body of [
    { hospital_id: 1, blood_group: 'not blood', units_required: 1 },
    { hospital_id: 0, blood_group: 'O+', units_required: 1 },
    { hospital_id: 1, blood_group: 'AB-', units_required: -2 },
    { hospital_id: 1, blood_group: 'A+', units_required: 1001 },
  ]) {
    const res = response();
    await resourceController.requestBlood({ user: { id: 8 }, body }, res);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.success, false);
  }
});

test('blood request fulfillment locks the pending request and conditionally debits stock', async (t) => {
  const originalConnect = pool.connect;
  const calls = [];
  pool.connect = async () => ({
    async query(sql, params) {
      calls.push({ sql: String(sql), params });
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [], rowCount: 0 };
      if (sql.includes('SELECT id FROM hospitals')) return { rows: [{ id: 4 }], rowCount: 1 };
      if (sql.includes('SELECT * FROM blood_requests')) return {
        rows: [{ id: 17, user_id: null, patient_id: 3, hospital_id: 4, blood_group: 'O+', units_required: 2, status: 'pending' }],
        rowCount: 1,
      };
      if (sql.includes('UPDATE blood_bank')) return { rows: [{ units_available: 3 }], rowCount: 1 };
      if (sql.includes('INSERT INTO blood_inventory_transactions')) return { rows: [], rowCount: 1 };
      if (sql.includes('UPDATE blood_requests')) return {
        rows: [{ id: 17, user_id: null, hospital_id: 4, blood_group: 'O+', status: 'fulfilled' }],
        rowCount: 1,
      };
      throw new Error(`Unexpected SQL: ${sql}`);
    },
    release() {},
  });
  t.after(() => { pool.connect = originalConnect; });

  const res = response();
  await resourceController.fulfillBloodRequest({
    user: { id: 9 }, params: { requestId: '17' }, body: {},
  }, res);

  assert.equal(res.statusCode, 200);
  assert.match(calls.find((call) => call.sql.includes('SELECT * FROM blood_requests')).sql, /FOR UPDATE/);
  assert.match(calls.find((call) => call.sql.includes('UPDATE blood_bank')).sql, /units_available >= \$1/);
  assert.match(calls.find((call) => call.sql.includes('UPDATE blood_bank')).sql, /expiry_date IS NULL OR expiry_date >= CURRENT_DATE/);
  assert.ok(calls.some((call) => call.sql.includes('INSERT INTO blood_inventory_transactions')));
  assert.ok(calls.findIndex((call) => call.sql === 'BEGIN') < calls.findIndex((call) => call.sql.includes('UPDATE blood_bank')));
  assert.ok(calls.findIndex((call) => call.sql.includes('UPDATE blood_bank')) < calls.findIndex((call) => call.sql === 'COMMIT'));
});

test('hospital stock additions use an atomic aggregate upsert and write an inventory transaction', async (t) => {
  const originalConnect = pool.connect;
  const calls = [];
  pool.connect = async () => ({
    async query(sql, params) {
      calls.push({ sql: String(sql), params });
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [], rowCount: 0 };
      if (sql.includes('SELECT id FROM hospitals')) return { rows: [{ id: 4 }], rowCount: 1 };
      if (sql.includes('INSERT INTO blood_bank')) return { rows: [{ id: 31, hospital_id: 4, blood_group: 'O+', units_available: 0 }], rowCount: 1 };
      if (sql.includes('INSERT INTO blood_inventory_batches')) return { rows: [{ id: 51, blood_bank_id: 31, blood_group: params[2], batch_number: 'BATCH-X', units_available: 2 }], rowCount: 1 };
      if (sql.includes('SELECT COALESCE(SUM(units_available) FILTER')) return { rows: [{ units: 2, expiry_date: '2027-01-10' }], rowCount: 1 };
      if (sql.includes('UPDATE blood_bank SET units_available')) return { rows: [], rowCount: 1 };
      if (sql.includes('INSERT INTO blood_inventory_transactions')) return { rows: [], rowCount: 1 };
      throw new Error(`Unexpected SQL: ${sql}`);
    },
    release() {},
  });
  t.after(() => { pool.connect = originalConnect; });

  const res = response();
  await bloodBankController.addBloodWithExpiry({
    user: { id: 9 },
    body: { blood_group: 'O positive', units: '2', expiry_date: '2027-01-10', donation_date: '2026-10-20' },
  }, res);

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.data.blood_group, 'O+');
  assert.match(calls.find((call) => call.sql.includes('INSERT INTO blood_inventory_batches')).sql, /INSERT INTO blood_inventory_batches/);
  assert.equal(calls.find((call) => call.sql.includes('INSERT INTO blood_inventory_batches')).params[4], 2);
  assert.ok(!calls.find((call) => call.sql.includes('INSERT INTO blood_bank')).sql.includes('units_available = blood_bank.units_available +'));
  assert.ok(calls.some((call) => call.sql.includes("'DONATION'")));
  assert.ok(calls.findIndex((call) => call.sql === 'BEGIN') < calls.findIndex((call) => call.sql === 'COMMIT'));
});

test('hospital stock updates replace units and expiry for every canonical blood group', async (t) => {
  const originalConnect = pool.connect;
  const calls = [];
  let currentUnits = 9;
  pool.connect = async () => ({
    async query(sql, params) {
      calls.push({ sql: String(sql), params });
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [], rowCount: 0 };
      if (sql.includes('SELECT id FROM hospitals')) return { rows: [{ id: 4 }], rowCount: 1 };
      if (sql.includes('SELECT $1::date >= CURRENT_DATE')) return { rows: [{ is_valid: true }], rowCount: 1 };
      if (sql.includes('SELECT id FROM blood_bank')) return { rows: [{ id: 31 }], rowCount: 1 };
      if (sql.includes('SELECT id, units_available FROM blood_inventory_batches')) return { rows: [{ id: 51, units_available: currentUnits }], rowCount: 1 };
      if (sql.includes('UPDATE blood_inventory_batches')) {
        currentUnits = params[0];
        return { rows: [{ id: 51, blood_bank_id: 31, blood_group: params[5], units_available: params[0], expiry_date: params[1] }], rowCount: 1 };
      }
      if (sql.includes('SELECT COALESCE(SUM(units_available) FILTER')) return { rows: [{ units: currentUnits, expiry_date: '2026-12-05' }], rowCount: 1 };
      if (sql.includes('UPDATE blood_bank SET units_available')) return { rows: [], rowCount: 1 };
      if (sql.includes('INSERT INTO blood_inventory_transactions')) return { rows: [], rowCount: 1 };
      throw new Error(`Unexpected SQL: ${sql}`);
    },
    release() {},
  });
  t.after(() => { pool.connect = originalConnect; });

  for (const group of ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']) {
    const res = response();
    await bloodBankController.updateBloodStock({
      user: { id: 9 }, body: { blood_group: group === 'A+' ? 'A+ve' : group, units: 15, expiry_date: '2026-12-05' },
    }, res);
    assert.equal(res.statusCode, 200, `${group} update succeeds`);
    assert.equal(res.body.data.units_available, 15);
    assert.equal(res.body.data.expiry_date, '2026-12-05');
  }

  const updates = calls.filter((call) => call.sql.includes('UPDATE blood_inventory_batches'));
  assert.equal(updates.length, 8);
  assert.ok(updates.every((call) => /SET units_available = \$1, expiry_date = \$2::date/.test(call.sql)));
  assert.ok(updates.every((call) => call.params[0] === 15));
  assert.equal(calls.filter((call) => call.sql.includes('INSERT INTO blood_inventory_transactions')).length, 1);
  assert.equal(updates[0].params[5], 'A+');
  assert.ok(calls.some((call) => call.sql.includes('WHERE blood_bank_id = $1 AND hospital_id = $2 AND blood_group = $3') && call.params[1] === 4));

  const repeat = response();
  await bloodBankController.updateBloodStock({
    user: { id: 9 }, body: { blood_group: 'A+ve', batch_id: 51, units: 5, expiry_date: '2026-12-05' },
  }, repeat);
  assert.equal(repeat.statusCode, 200);
  assert.equal(repeat.body.data.units_available, 5);
  assert.equal(repeat.body.data.group_units_available, 5);
  assert.equal(calls.filter((call) => call.sql.includes('INSERT INTO blood_inventory_transactions')).length, 2);
});

test('batch update requires an explicit id when a group has multiple batches', async (t) => {
  const originalConnect = pool.connect;
  const calls = [];
  pool.connect = async () => ({
    async query(sql, params) {
      calls.push({ sql: String(sql), params });
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [], rowCount: 0 };
      if (sql.includes('SELECT id FROM hospitals')) return { rows: [{ id: 4 }], rowCount: 1 };
      if (sql.includes('SELECT $1::date >= CURRENT_DATE')) return { rows: [{ is_valid: true }], rowCount: 1 };
      if (sql.includes('SELECT id FROM blood_bank')) return { rows: [{ id: 31 }], rowCount: 1 };
      if (sql.includes('SELECT id, units_available FROM blood_inventory_batches')) return {
        rows: [{ id: 51, units_available: 5 }, { id: 52, units_available: 10 }], rowCount: 2,
      };
      throw new Error(`Unexpected SQL: ${sql}`);
    },
    release() {},
  });
  t.after(() => { pool.connect = originalConnect; });

  const res = response();
  await bloodBankController.updateBloodStock({
    user: { id: 9 }, body: { blood_group: 'A+', units: 15, expiry_date: '2026-12-05' },
  }, res);
  assert.equal(res.statusCode, 400);
  assert.match(res.body.message, /specific stock batch/);
  assert.ok(!calls.some((call) => call.sql.includes('UPDATE blood_inventory_batches')));
});
