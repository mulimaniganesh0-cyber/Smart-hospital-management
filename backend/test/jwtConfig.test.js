const test = require('node:test');
const assert = require('node:assert/strict');
const { getJwtSecret, assertJwtSecretConfigured } = require('../src/config/jwt');

test('development keeps the local fallback secret', () => {
  assert.equal(getJwtSecret({ NODE_ENV: 'development', JWT_SECRET: '' }), 'smart-hospital-development-secret-change-me');
});

test('production rejects a missing or short JWT secret', () => {
  assert.throws(() => getJwtSecret({ NODE_ENV: 'production' }), /must be configured/);
  assert.throws(() => assertJwtSecretConfigured({ NODE_ENV: 'production', JWT_SECRET: 'short' }), /at least 32 characters/);
});

test('production accepts a sufficiently long configured JWT secret', () => {
  const secret = 'a-production-secret-with-at-least-32-characters';
  assert.equal(getJwtSecret({ NODE_ENV: 'production', JWT_SECRET: secret }), secret);
});
