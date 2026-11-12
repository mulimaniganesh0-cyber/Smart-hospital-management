const test = require('node:test');
const assert = require('node:assert/strict');
const { validateResourceUpdate } = require('../src/services/hospitalResourceValidation');

test('hospital resource updates require non-negative whole-number counts', () => {
  assert.match(validateResourceUpdate({ generalBeds_available: -1 }).error, /non-negative/);
  assert.match(validateResourceUpdate({ icuBeds_total: 2.5 }).error, /whole number/);
  assert.match(validateResourceUpdate({ ventilators_total: 2147483648 }).error, /non-negative/);
  assert.match(validateResourceUpdate(null).error, /object/);
});

test('available resource counts cannot exceed the corresponding total', () => {
  const current = { general_beds_total: 4, general_beds_available: 3 };
  assert.match(validateResourceUpdate({ generalBeds_available: 5 }, current).error, /cannot exceed/);
  assert.match(validateResourceUpdate({ generalBeds_total: 2 }, current).error, /cannot exceed/);
  assert.equal(validateResourceUpdate({ generalBeds_total: 6 }, current).error, undefined);
});

test('valid resource updates only include known database fields', () => {
  const result = validateResourceUpdate({ generalBeds_total: 10, ignored: 'value' }, {});
  assert.equal(result.error, undefined);
  assert.deepEqual(result.entries, [['generalBeds_total', 10]]);
});
