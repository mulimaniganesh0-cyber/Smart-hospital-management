const test = require('node:test');
const assert = require('node:assert/strict');
const ambulance = require('../src/controllers/ambulanceController');
const routes = require('../src/routes/ambulanceRoutes');
const { authorize } = require('../src/middleware/auth');
const { pool } = require('../src/config/database');

function response() {
  return { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
}
function request(user = { id: 8, user_type: 'hospital', role: 'hospital' }, ambulanceId = '36') {
  return { user, params: { ambulanceId }, body: {} };
}
function clientWith({ owned = true, active = false } = {}) {
  const calls = [];
  return {
    calls,
    released: false,
    async query(sql, values) {
      sql = String(sql); calls.push({ sql, values });
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rowCount: 0, rows: [] };
      if (sql.includes('SELECT id FROM ambulances')) return owned ? { rowCount: 1, rows: [{ id: 36 }] } : { rowCount: 0, rows: [] };
      if (sql.includes('SELECT 1 FROM ambulance_bookings')) return active ? { rowCount: 1, rows: [{ '?column?': 1 }] } : { rowCount: 0, rows: [] };
      if (sql.includes('UPDATE ambulances')) return { rowCount: 1, rows: [{ id: 36, is_active: false, is_available: false, status: 'OUT_OF_SERVICE' }] };
      throw new Error(`Unexpected query: ${sql}`);
    },
    release() { this.released = true; },
  };
}

test('hospital ambulance router exposes guarded PUT deactivation instead of DELETE', () => {
  const route = routes.stack.find((layer) => layer.route?.path === '/:ambulanceId/deactivate');
  assert.ok(route);
  assert.equal(route.route.methods.put, true);
  assert.equal(route.route.methods.delete, undefined);
});

test('authorized hospital can deactivate its ambulance and keep trip history', async (t) => {
  const originalQuery = pool.query, originalConnect = pool.connect;
  const client = clientWith();
  pool.query = async (sql, values) => String(sql).includes('FROM hospitals WHERE user_id')
    ? { rowCount: 1, rows: [{ id: 12 }] }
    : (() => { throw new Error(`Unexpected query: ${sql} ${values}`); })();
  pool.connect = async () => client;
  t.after(() => { pool.query = originalQuery; pool.connect = originalConnect; });

  const res = response();
  await ambulance.deactivateAmbulance(request(), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.is_active, false);
  assert.match(res.body.message, /Historical trip records were retained/);
  assert.ok(client.calls.some(({ sql }) => sql.includes('SET is_active=FALSE')));
  assert.ok(client.calls.some(({ sql }) => sql === 'COMMIT'));
  assert.equal(client.released, true);
});

test('hospital cannot deactivate an ambulance owned by another hospital', async (t) => {
  const originalQuery = pool.query, originalConnect = pool.connect;
  const client = clientWith({ owned: false });
  pool.query = async () => ({ rowCount: 1, rows: [{ id: 12 }] });
  pool.connect = async () => client;
  t.after(() => { pool.query = originalQuery; pool.connect = originalConnect; });

  const res = response();
  await ambulance.deactivateAmbulance(request(), res);
  assert.equal(res.statusCode, 404);
  assert.equal(client.calls.some(({ sql }) => sql.includes('UPDATE ambulances')), false);
  assert.equal(client.calls.at(-1).sql, 'ROLLBACK');
});

test('ambulance cannot be deactivated while a booking or emergency assignment is active', async (t) => {
  const originalQuery = pool.query, originalConnect = pool.connect;
  const client = clientWith({ active: true });
  pool.query = async () => ({ rowCount: 1, rows: [{ id: 12 }] });
  pool.connect = async () => client;
  t.after(() => { pool.query = originalQuery; pool.connect = originalConnect; });

  const res = response();
  await ambulance.deactivateAmbulance(request(), res);
  assert.equal(res.statusCode, 409);
  assert.match(res.body.message, /active trip or assignment/);
  assert.equal(client.calls.some(({ sql }) => sql.includes('UPDATE ambulances')), false);
  assert.equal(client.calls.at(-1).sql, 'ROLLBACK');
});

test('non-hospital roles are rejected from the deactivation route', () => {
  const res = response();
  let reachedController = false;
  authorize('hospital')(request({ id: 3, user_type: 'patient', role: 'patient' }), res, () => { reachedController = true; });
  assert.equal(reachedController, false);
  assert.equal(res.statusCode, 403);
});
