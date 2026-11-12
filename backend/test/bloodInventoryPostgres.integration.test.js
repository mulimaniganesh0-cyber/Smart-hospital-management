const test = require('node:test');
const { after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { pool } = require('../src/config/database');
const bloodBankController = require('../src/controllers/bloodBankController');
const { getHospitalBloodStock } = require('../src/services/bloodInventoryService');

const enabled = process.env.RUN_POSTGRES_INTEGRATION === '1';
after(async () => pool.end());

function response() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

function controllerClient(client) {
  let savepointNumber = 0;
  let activeSavepoint;
  return {
    query(sql, values) {
      if (sql === 'BEGIN') {
        activeSavepoint = `blood_batch_${++savepointNumber}`;
        return client.query(`SAVEPOINT ${activeSavepoint}`);
      }
      if (sql === 'COMMIT') return client.query(`RELEASE SAVEPOINT ${activeSavepoint}`);
      if (sql === 'ROLLBACK') return client.query(`ROLLBACK TO SAVEPOINT ${activeSavepoint}`);
      return client.query(sql, values);
    },
    release() {},
  };
}

test('PostgreSQL blood stock edit replaces, add batches, A+ve canonicalizes, and ownership is enforced', { skip: !enabled }, async () => {
  const client = await pool.connect();
  const originalQuery = pool.query;
  const originalConnect = pool.connect;
  const suffix = randomUUID();
  let hospitalId;
  let userId;
  let otherUserId;

  async function invoke(action, actingUserId, body) {
    const res = response();
    await bloodBankController[action]({ user: { id: actingUserId }, body }, res);
    return res;
  }

  try {
    await client.query('BEGIN');
    pool.query = (sql, values) => client.query(sql, values);
    pool.connect = async () => controllerClient(client);

    userId = (await client.query(
      'INSERT INTO users(name,email,password_hash) VALUES($1,$2,$3) RETURNING id',
      ['Blood Batch Integration', `blood-batch-${suffix}@example.invalid`, 'integration-only'],
    )).rows[0].id;
    otherUserId = (await client.query(
      'INSERT INTO users(name,email,password_hash) VALUES($1,$2,$3) RETURNING id',
      ['Blood Batch Ownership', `blood-owner-${suffix}@example.invalid`, 'integration-only'],
    )).rows[0].id;
    hospitalId = (await client.query(
      'INSERT INTO hospitals(name,user_id) VALUES($1,$2) RETURNING id',
      [`Disposable Blood Batch ${suffix}`, userId],
    )).rows[0].id;

    await client.query(
      `INSERT INTO blood_bank(hospital_id,blood_group,units_available,expiry_date,batch_number)
       VALUES($1,'A+',10,'2026-12-05',$2)`,
      [hospitalId, `LEGACY-${suffix}`],
    );
    const firstBatch = (await client.query(
      'SELECT id FROM blood_inventory_batches WHERE hospital_id=$1 AND blood_group=$2',
      [hospitalId, 'A+'],
    )).rows[0].id;

    let res = await invoke('updateBloodStock', userId, {
      blood_group: 'A+ve', batch_id: firstBatch, units: 15, expiry_date: '2026-12-05',
    });
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    let aggregate = await client.query(
      'SELECT units_available FROM blood_bank WHERE hospital_id=$1 AND blood_group=$2',
      [hospitalId, 'A+'],
    );
    assert.equal(Number(aggregate.rows[0].units_available), 15);

    res = await invoke('updateBloodStock', userId, {
      blood_group: 'A+', batch_id: firstBatch, units: 5, expiry_date: '2026-12-05',
    });
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    aggregate = await client.query(
      'SELECT units_available FROM blood_bank WHERE hospital_id=$1 AND blood_group=$2',
      [hospitalId, 'A+'],
    );
    assert.equal(Number(aggregate.rows[0].units_available), 5);

    res = await invoke('addBloodWithExpiry', userId, {
      blood_group: 'A+ve', units: 10, expiry_date: '2027-01-10',
    });
    assert.equal(res.statusCode, 201, JSON.stringify(res.body));
    let batches = await client.query(
      'SELECT id,blood_group,units_available FROM blood_inventory_batches WHERE hospital_id=$1 ORDER BY id',
      [hospitalId],
    );
    assert.deepEqual(batches.rows.map((batch) => Number(batch.units_available)), [5, 10]);
    assert.ok(batches.rows.every((batch) => batch.blood_group === 'A+'));

    res = await invoke('updateBloodStock', userId, {
      blood_group: 'A+ve', batch_id: Number(batches.rows[0].id), units: 3, expiry_date: '2026-12-05',
    });
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    batches = await client.query(
      'SELECT id,units_available FROM blood_inventory_batches WHERE hospital_id=$1 ORDER BY id',
      [hospitalId],
    );
    assert.deepEqual(batches.rows.map((batch) => Number(batch.units_available)), [3, 10]);
    const inventory = await getHospitalBloodStock(hospitalId);
    const aPositive = inventory.bloodStock.find((stock) => stock.blood_group === 'A+');
    assert.equal(aPositive.units_available, 13);
    assert.equal(aPositive.batches.length, 2);

    res = await invoke('updateBloodStock', otherUserId, {
      blood_group: 'A+', batch_id: Number(batches.rows[0].id), units: 100, expiry_date: '2026-12-05',
    });
    assert.equal(res.statusCode, 404);

    await client.query(
      `INSERT INTO blood_bank(hospital_id,blood_group,units_available,expiry_date,batch_number)
       VALUES($1,'O+',8,'2026-10-01',$2)`,
      [hospitalId, `EXPIRED-${suffix}`],
    );
    res = await invoke('addBloodWithExpiry', userId, {
      blood_group: 'O positive', units: 6, expiry_date: '2026-12-05',
    });
    assert.equal(res.statusCode, 201, JSON.stringify(res.body));
    const oPositiveRows = await client.query(
      'SELECT units_available FROM blood_bank WHERE hospital_id=$1 AND blood_group=$2',
      [hospitalId, 'O+'],
    );
    assert.equal(Number(oPositiveRows.rows[0].units_available), 6);
    const refreshed = await getHospitalBloodStock(hospitalId);
    assert.equal(refreshed.bloodStock.find((stock) => stock.blood_group === 'O+').units_available, 6);
  } finally {
    pool.query = originalQuery;
    pool.connect = originalConnect;
    await client.query('ROLLBACK');
    client.release();
  }
});
