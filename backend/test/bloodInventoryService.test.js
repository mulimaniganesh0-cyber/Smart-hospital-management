const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeBloodGroup } = require('../src/services/bloodInventoryService');

test('normalizes supported blood-group aliases without confusing AB with A', () => {
  assert.equal(normalizeBloodGroup('A positive'), 'A+');
  assert.equal(normalizeBloodGroup('a+ve'), 'A+');
  assert.equal(normalizeBloodGroup('O negative'), 'O-');
  assert.equal(normalizeBloodGroup('AB+ve'), 'AB+');
  assert.equal(normalizeBloodGroup('AB negative'), 'AB-');
  assert.equal(normalizeBloodGroup('not-a-group'), null);
});
