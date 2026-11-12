const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeBloodGroup, getHospitalBloodStock } = require('../src/services/bloodInventoryService');
const { pool } = require('../src/config/database');

test('normalizes supported blood-group aliases without confusing AB with A', () => {
  assert.equal(normalizeBloodGroup('A positive'), 'A+');
  assert.equal(normalizeBloodGroup('a+ve'), 'A+');
  assert.equal(normalizeBloodGroup('O negative'), 'O-');
  assert.equal(normalizeBloodGroup('AB+ve'), 'AB+');
  assert.equal(normalizeBloodGroup('AB negative'), 'AB-');
  assert.equal(normalizeBloodGroup('not-a-group'), null);
});

test('public inventory reads exclude expired stock rows', async (t) => {
  const originalQuery = pool.query;
  const sqlSeen = [];
  pool.query = async (sql) => {
    sqlSeen.push(String(sql));
    if (sql.includes('SELECT id, name FROM hospitals')) return { rows: [{ id: 2, name: 'Hospital' }], rowCount: 1 };
    return { rows: [{ blood_group: 'A+', units_available: 4 }], rowCount: 1 };
  };
  t.after(() => { pool.query = originalQuery; });

  const result = await getHospitalBloodStock(2);
  assert.equal(result.bloodStock.find((row) => row.blood_group === 'A+').units_available, 4);
  assert.match(sqlSeen[1], /expiry_date IS NULL OR b\.expiry_date >= CURRENT_DATE/);
});

test('blood-group aggregation normalizes A+ve and counts only unexpired batches', async (t) => {
  const originalQuery = pool.query;
  pool.query = async (sql) => {
    if (sql.includes('SELECT id, name FROM hospitals')) return { rows: [{ id: 2, name: 'Hospital' }], rowCount: 1 };
    return {
      rows: [
        { batch_id: 11, blood_bank_id: 3, blood_group: 'A+ve', batch_number: 'FUTURE', units_available: '15', expiry_date: '2026-12-05' },
        { batch_id: 12, blood_bank_id: 3, blood_group: 'A positive', batch_number: 'EXPIRED', units_available: '7', expiry_date: '2026-10-01' },
      ], rowCount: 2,
    };
  };
  t.after(() => { pool.query = originalQuery; });

  const result = await getHospitalBloodStock(2);
  const aPositive = result.bloodStock.find((row) => row.blood_group === 'A+');
  assert.equal(aPositive.units_available, 15);
  assert.equal(aPositive.batches.length, 2);
  assert.equal(aPositive.batches[0].id, 11);
  assert.equal(result.bloodStock.filter((row) => row.blood_group === 'A+').length, 1);
});
