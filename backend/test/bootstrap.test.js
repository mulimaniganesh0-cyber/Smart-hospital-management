const test = require('node:test');
const assert = require('node:assert/strict');
const { after } = require('node:test');

const app = require('../src/app');
const { authorize } = require('../src/middleware/auth');
const { pool } = require('../src/config/database');

after(async () => {
  await pool.end();
});

test('app module loads successfully', () => {
  assert.equal(typeof app === 'function', true);
});

test('authorize accepts hospital and hospital_admin roles', () => {
  let called = false;
  const req = { user: { user_type: 'hospital', role: 'hospital_admin' } };
  const res = {
    status(code) {
      this.code = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return payload;
    },
  };

  authorize('hospital', 'hospital_admin')(req, res, () => {
    called = true;
  });

  assert.equal(called, true);
  assert.equal(res.code, undefined);
});

test('authorize rejects disallowed user roles', () => {
  let called = false;
  const req = { user: { user_type: 'patient', role: null } };
  const res = {
    status(code) {
      this.code = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return payload;
    },
  };

  authorize('hospital')(req, res, () => {
    called = true;
  });

  assert.equal(called, false);
  assert.equal(res.code, 403);
});
