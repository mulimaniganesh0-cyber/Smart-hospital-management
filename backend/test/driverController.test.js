const test = require('node:test');
const assert = require('node:assert/strict');
const driver = require('../src/controllers/driverController');
const { authorize } = require('../src/middleware/auth');
const { pool } = require('../src/config/database');

function response() {
  return {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

function mockClient(query) {
  return {
    calls: [],
    released: false,
    async query(sql, values) {
      this.calls.push({ sql: String(sql), values });
      return query(String(sql), values, this.calls.length);
    },
    release() { this.released = true; },
  };
}

function request({ userId = 41, body = {}, params = {}, query = {}, io } = {}) {
  return {
    user: { id: userId, user_type: 'ambulance_driver', role: 'ambulance_driver' },
    body, params, query,
    app: { get: () => io },
  };
}

test('driver role is accepted and other portal roles are rejected by the route guard', () => {
  const res = response();
  let called = false;
  authorize('ambulance_driver')(request(), res, () => { called = true; });
  assert.equal(called, true);

  const denied = response();
  authorize('ambulance_driver')({ user: { id: 7, user_type: 'doctor', role: 'doctor' } }, denied, () => {});
  assert.equal(denied.statusCode, 403);
});

test('history scopes both page data and count to the authenticated driver', async (t) => {
  const originalQuery = pool.query;
  const calls = [];
  pool.query = async (sql, values) => {
    calls.push({ sql: String(sql), values });
    return String(sql).includes('COUNT(*)')
      ? { rows: [{ total: 26 }] }
      : { rows: [{ id: 12, status: 'completed' }] };
  };
  t.after(() => { pool.query = originalQuery; });

  const res = response();
  await driver.history(request({ userId: 41, query: { page: '2', limit: '10' } }), res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.pagination, { page: 2, limit: 10, total: 26 });
  assert.deepEqual(calls[0].values, [41, 10, 10]);
  assert.deepEqual(calls[1].values, [41]);
  assert.match(calls[0].sql, /assigned_driver_user_id=\$1/);
  assert.match(calls[1].sql, /assigned_driver_user_id=\$1/);
});

test('history rejects malformed and out-of-range pagination', async (t) => {
  const originalQuery = pool.query;
  pool.query = async () => { throw new Error('History query must not run'); };
  t.after(() => { pool.query = originalQuery; });

  for (const query of [{ page: '1x' }, { page: '0' }, { limit: '51' }, { limit: '-1' }]) {
    const res = response();
    await driver.history(request({ query }), res);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.success, false);
  }
});

test('driver cannot change another driver’s emergency', async (t) => {
  const originalConnect = pool.connect;
  const client = mockClient((sql) => {
    if (sql === 'BEGIN' || sql === 'ROLLBACK') return { rowCount: 0, rows: [] };
    if (sql.includes('SELECT e.* FROM emergency_requests')) return { rowCount: 0, rows: [] };
    throw new Error(`Unexpected query: ${sql}`);
  });
  pool.connect = async () => client;
  t.after(() => { pool.connect = originalConnect; });

  const res = response();
  await driver.updateAssignmentStatus(request({ params: { emergencyId: '90' }, body: { status: 'driver_accepted' } }), res);
  assert.equal(res.statusCode, 404);
  assert.deepEqual(client.calls[1].values, [90, 41]);
  assert.equal(client.calls.some((call) => call.sql.includes('UPDATE emergency_requests')), false);
  assert.equal(client.released, true);
});

test('trip actions must advance one step and duplicate/out-of-order actions are rejected', async (t) => {
  const originalConnect = pool.connect;
  let currentStatus = 'assigned';
  const client = mockClient((sql) => {
    if (sql === 'BEGIN' || sql === 'ROLLBACK') return { rowCount: 0, rows: [] };
    if (sql.includes('SELECT e.* FROM emergency_requests')) return {
      rowCount: 1,
      rows: [{ id: 90, assigned_driver_user_id: 41, status: currentStatus, patient_id: 14 }],
    };
    throw new Error(`Unexpected query: ${sql}`);
  });
  pool.connect = async () => client;
  t.after(() => { pool.connect = originalConnect; });

  const res = response();
  await driver.updateAssignmentStatus(request({ params: { emergencyId: '90' }, body: { status: 'arrived_at_patient' } }), res);
  assert.equal(res.statusCode, 409);
  assert.equal(client.calls.some((call) => call.sql.includes('UPDATE emergency_requests')), false);

  currentStatus = 'driver_accepted';
  const duplicate = response();
  await driver.updateAssignmentStatus(request({ params: { emergencyId: '90' }, body: { status: 'driver_accepted' } }), duplicate);
  assert.equal(duplicate.statusCode, 409);
  assert.equal(client.calls.some((call) => call.sql.includes('UPDATE emergency_requests')), false);
});

test('a valid trip action is persisted and confirmed before success is returned', async (t) => {
  const originalConnect = pool.connect;
  const client = mockClient((sql, values) => {
    if (sql === 'BEGIN' || sql === 'COMMIT') return { rowCount: 0, rows: [] };
    if (sql.includes('SELECT e.* FROM emergency_requests')) {
      return { rowCount: 1, rows: [{ id: 90, status: 'assigned', patient_id: 14, ambulance_id: 6 }] };
    }
    if (sql.includes('UPDATE emergency_requests')) {
      return { rowCount: 1, rows: [{ id: 90, status: values[0], patient_id: 14, ambulance_id: 6 }] };
    }
    throw new Error(`Unexpected query: ${sql}`);
  });
  pool.connect = async () => client;
  t.after(() => { pool.connect = originalConnect; });

  const res = response();
  await driver.updateAssignmentStatus(request({ params: { emergencyId: '90' }, body: { status: 'driver_accepted' } }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.status, 'driver_accepted');
  assert.deepEqual(client.calls.find((call) => call.sql.includes('UPDATE emergency_requests')).values, ['driver_accepted', 90]);
  assert.ok(client.calls.findIndex((call) => call.sql === 'COMMIT') > client.calls.findIndex((call) => call.sql.includes('UPDATE emergency_requests')));
  assert.equal(client.released, true);
});

test('location requires coordinates and an active assignment tied to this driver and ambulance', async (t) => {
  const originalConnect = pool.connect;
  const originalQuery = pool.query;
  pool.query = async (sql) => {
    if (String(sql).includes('SELECT id FROM patients')) return { rows: [{ id: 14 }] };
    throw new Error(`Unexpected pool query: ${sql}`);
  };
  let activeRows = [];
  const client = mockClient((sql) => {
    if (sql === 'BEGIN' || sql === 'ROLLBACK') return { rowCount: 0, rows: [] };
    if (sql.includes('SELECT e.id emergency_id')) return { rowCount: activeRows.length, rows: activeRows };
    if (sql.includes('SELECT b.id emergency_id')) return { rowCount: 0, rows: [] };
    if (sql.includes('UPDATE ambulances')) return { rowCount:1, rows: [{ driver_location_timestamp: '2026-10-20T10:00:00.000Z' }] };
    if (sql === 'COMMIT') return { rowCount: 0, rows: [] };
    throw new Error(`Unexpected query: ${sql}`);
  });
  pool.connect = async () => client;
  t.after(() => { pool.connect = originalConnect; pool.query = originalQuery; });

  const invalid = response();
  await driver.updateLocation(request({ body: { latitude: 120, longitude: 10 } }), invalid);
  assert.equal(invalid.statusCode, 400);
  assert.equal(client.calls.length, 0);

  const noAssignment = response();
  await driver.updateLocation(request({ body: { latitude: 12.9, longitude: 77.6 } }), noAssignment);
  assert.equal(noAssignment.statusCode, 409);
  assert.equal(client.calls.some((call) => call.sql.includes('UPDATE ambulances')), false);

  activeRows = [{ emergency_id: 90, assignment_type: 'emergency', patient_id: 14, hospital_id: 4, ambulance_id: 6 }];
  const rooms = [];
  const io = { to(room) { rooms.push(room); return { emit() {} }; } };
  const allowed = response();
  await driver.updateLocation(request({ body: { latitude: 12.9, longitude: 77.6 }, io }), allowed);
  assert.equal(allowed.statusCode, 200);
  assert.equal(allowed.body.data.emergencyId, 90);
  assert.deepEqual(rooms, ['emergency_assignment_90', 'driver_41', 'hospital_4', 'patient_14']);
  assert.deepEqual(client.calls.find((call) => call.sql.includes('UPDATE ambulances')).values, [12.9, 77.6, null, 6]);
});

