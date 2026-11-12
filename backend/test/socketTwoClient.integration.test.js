const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const enabled = process.env.RUN_POSTGRES_INTEGRATION === '1';
const { pool } = require('../src/config/database');
const { getJwtSecret } = require('../src/config/jwt');

function transactionPool(client) {
  let sequence = 0;
  let savepoint;
  return {
    query(sql, values) { return client.query(sql, values); },
    async connect() {
      return {
        query(sql, values) {
          if (sql === 'BEGIN') { savepoint = `socket_acceptance_${++sequence}`; return client.query(`SAVEPOINT ${savepoint}`); }
          if (sql === 'COMMIT') return client.query(`RELEASE SAVEPOINT ${savepoint}`);
          if (sql === 'ROLLBACK') return client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
          return client.query(sql, values);
        },
        release() {},
      };
    },
  };
}

function makeToken(id, options = {}) { return jwt.sign({ id }, getJwtSecret(), { expiresIn: options.expiresIn || '10m' }); }

class SocketClient {
  constructor(url, token) {
    this.ws = new WebSocket(`${url}/socket.io/?EIO=4&transport=websocket`);
    this.connected = false;
    this.pending = [];
    this.history = [];
    this.ws.on('message', (raw) => this.onMessage(String(raw)));
    this.ready = new Promise((resolve, reject) => {
      this.resolveReady = resolve;
      this.rejectReady = reject;
      this.timer = setTimeout(() => reject(new Error('Socket.IO connection timed out')), 5000);
      this.token = token;
    });
    this.ws.on('error', (error) => { if (!this.connected) this.rejectReady(error); });
  }
  onMessage(packet) {
    if (packet === '2') { this.ws.send('3'); return; }
    if (packet.startsWith('0')) { this.ws.send(`40${JSON.stringify({ token: this.token })}`); return; }
    if (packet.startsWith('40')) {
      this.connected = true; clearTimeout(this.timer); this.resolveReady(); return;
    }
    if (packet.startsWith('44')) {
      const error = new Error('Socket.IO namespace authentication rejected');
      clearTimeout(this.timer); this.rejectReady(error); return;
    }
    if (packet.startsWith('42')) {
      let event;
      try { event = JSON.parse(packet.slice(2)); } catch { return; }
      const item = { name: event[0], data: event[1] };
      const index = this.pending.findIndex((waiter) => waiter.name === item.name && (!waiter.predicate || waiter.predicate(item.data)));
      if (index >= 0) this.pending.splice(index, 1)[0].resolve(item.data);
      else this.history.push(item);
    }
  }
  async connect() { await this.ready; return this; }
  emit(name, data = {}) { this.ws.send(`42${JSON.stringify([name, data])}`); }
  waitFor(name, predicate = null, timeout = 4000) {
    const priorIndex = this.history.findIndex((item) => item.name === name && (!predicate || predicate(item.data)));
    if (priorIndex >= 0) return Promise.resolve(this.history.splice(priorIndex, 1)[0].data);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${name}`)), timeout);
      this.pending.push({ name, predicate, resolve: (data) => { clearTimeout(timer); resolve(data); } });
    });
  }
  async close() {
    if (this.ws.readyState === WebSocket.CLOSED) return;
    await new Promise((resolve) => { this.ws.once('close', resolve); this.ws.close(); setTimeout(resolve, 1000); });
  }
}

async function httpRequest(base, userId, route, options = {}) {
  const response = await fetch(`${base}${route}`, {
    ...options,
    headers: { authorization: `Bearer ${makeToken(userId)}`, ...(options.headers || {}) },
  });
  return { response, body: await response.json().catch(() => ({})) };
}

test('two authenticated Socket.IO clients enforce assignment access and location delivery through PostgreSQL', { skip: !enabled }, async () => {
  // server.js exports its actual Socket.IO instance without running schema initialization.
  const { server, io } = require('../server');
  const client = await pool.connect();
  const originalQuery = pool.query;
  const originalConnect = pool.connect;
  const sockets = [];
  try {
    await client.query('BEGIN');
    const suffix = crypto.randomUUID();
    const addUser = async (name, userType, role = null, hospitalId = null, driverType = null) => (await client.query(
      `INSERT INTO users(name,email,password_hash,user_type,role,hospital_role,hospital_id,is_verified,account_status,driver_type,driver_status)
       VALUES($1,$2,'integration-only-hash',$3,$4,$5,$6,TRUE,'ACTIVE',$7,$8) RETURNING id`,
      [name, `${suffix}-${name}@integration.invalid`, userType, role, role === 'hospital_admin' ? role : null, hospitalId, driverType, driverType ? 'active' : null],
    )).rows[0].id;
    const patientUser = await addUser('patient-a', 'patient');
    const patientId = (await client.query('INSERT INTO patients(user_id) VALUES($1) RETURNING id', [patientUser])).rows[0].id;
    const otherPatientUser = await addUser('patient-b', 'patient');
    await client.query('INSERT INTO patients(user_id) VALUES($1)', [otherPatientUser]);
    const hospitalId = (await client.query(`INSERT INTO hospitals(name,registration_number,address) VALUES($1,$2,'Socket rollback fixture') RETURNING id`, [`Socket Fixture ${suffix}`, `SOCKET-${suffix}`])).rows[0].id;
    const hospitalUser = await addUser('hospital', 'hospital', null, hospitalId);
    await client.query('UPDATE hospitals SET user_id=$1 WHERE id=$2', [hospitalUser, hospitalId]);
    const driverA = await addUser('driver-a', 'staff', 'ambulance_driver', hospitalId, 'hospital_driver');
    const driverB = await addUser('driver-b', 'staff', 'ambulance_driver', hospitalId, 'hospital_driver');
    const ambulanceA = (await client.query(`INSERT INTO ambulances(hospital_id,vehicle_number,type,is_available,status,is_active,driver_user_id)
      VALUES($1,$2,'BLS',TRUE,'AVAILABLE',TRUE,$3) RETURNING id`, [hospitalId, `SOCK-A-${suffix}`, driverA])).rows[0].id;
    const ambulanceB = (await client.query(`INSERT INTO ambulances(hospital_id,vehicle_number,type,is_available,status,is_active,driver_user_id)
      VALUES($1,$2,'BLS',TRUE,'AVAILABLE',TRUE,$3) RETURNING id`, [hospitalId, `SOCK-B-${suffix}`, driverB])).rows[0].id;
    const emergencyId = (await client.query(`INSERT INTO emergency_requests(patient_id,hospital_id,emergency_type,severity,description,status,location_lat,location_lng,patient_location_sharing)
      VALUES($1,$2,'integration fixture','moderate','Socket test fixture only','pending',12.9716,77.5946,TRUE) RETURNING id`, [patientId,hospitalId])).rows[0].id;

    Object.assign(pool, transactionPool(client));
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const base = `http://127.0.0.1:${server.address().port}`;
    const socketUrl = `ws://127.0.0.1:${server.address().port}`;
    const assigned = await httpRequest(base, hospitalUser, `/api/emergency/${emergencyId}/ambulance`, {
      method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ambulance_id: ambulanceA }),
    });
    assert.equal(assigned.response.status, 200);
    assert.equal(Number((await client.query('SELECT assigned_driver_user_id FROM emergency_requests WHERE id=$1', [emergencyId])).rows[0].assigned_driver_user_id), driverA);
    const driverAssignment = await httpRequest(base, driverA, '/api/driver/assignments');
    assert.equal(driverAssignment.response.status, 200);
    assert.ok(driverAssignment.body.data.some((row) => row.id === emergencyId && row.location_lat != null && row.location_lng != null), 'assigned driver receives the authorized pickup location');

    const patient = await new SocketClient(socketUrl, makeToken(patientUser)).connect(); sockets.push(patient);
    const driver = await new SocketClient(socketUrl, makeToken(driverA)).connect(); sockets.push(driver);
    patient.emit('join-patient');
    patient.emit('assignment:subscribe', { type: 'emergency', id: emergencyId });
    driver.emit('assignment:subscribe', { type: 'emergency', id: emergencyId });
    assert.deepEqual(await patient.waitFor('assignment:subscribed'), { type: 'emergency', id: emergencyId });
    assert.deepEqual(await driver.waitFor('assignment:subscribed'), { type: 'emergency', id: emergencyId });

    const otherPatient = await new SocketClient(socketUrl, makeToken(otherPatientUser)).connect(); sockets.push(otherPatient);
    const deniedPatient = otherPatient.waitFor('socket-error');
    otherPatient.emit('assignment:subscribe', { type: 'emergency', id: emergencyId, userId: driverA, role: 'ambulance_driver' });
    assert.match((await deniedPatient).message, /authorized|not found/i);
    const otherDriver = await new SocketClient(socketUrl, makeToken(driverB)).connect(); sockets.push(otherDriver);
    const deniedDriver = otherDriver.waitFor('socket-error');
    otherDriver.emit('assignment:subscribe', { type: 'emergency', id: emergencyId, userId: driverA });
    assert.match((await deniedDriver).message, /authorized|not found/i);

    const noPatientRoom = otherDriver.waitFor('socket-error');
    otherDriver.emit('join-patient', { patientId });
    assert.match((await noPatientRoom).message, /patient access required/i);
    const fakeAssignment = patient.waitFor('socket-error');
    patient.emit('assignment:subscribe', { type: 'emergency', id: 2147483000, userId: driverA });
    assert.match((await fakeAssignment).message, /not found/i);
    const forgedLocation = patient.waitFor('socket-error');
    patient.emit('ambulance-location-update', { emergencyId, driverId: driverA, latitude: 12.97, longitude: 77.59 });
    assert.match((await forgedLocation).message, /authenticated driver API/i);

    const driverLocationEvent = patient.waitFor('ambulance:location_updated');
    const driverOwnEvent = driver.waitFor('ambulance:location_updated');
    const locationResponse = await httpRequest(base, driverA, '/api/driver/location', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ latitude: 12.97, longitude: 77.59, accuracy: 14, timestamp: new Date().toISOString() }),
    });
    assert.equal(locationResponse.response.status, 200);
    assert.equal((await driverLocationEvent).emergencyId, emergencyId);
    assert.equal((await driverOwnEvent).emergencyId, emergencyId);
    const oldDriverLocationEventsBeforeReassign = driver.history.filter((event) => event.name === 'ambulance:location_updated').length;
    const stored = await client.query('SELECT driver_location_accuracy,driver_location_timestamp FROM ambulances WHERE id=$1', [ambulanceA]);
    assert.equal(Number(stored.rows[0].driver_location_accuracy), 14);
    assert.ok(stored.rows[0].driver_location_timestamp);

    const revoked = driver.waitFor('emergency:assignment_revoked');
    const reassigned = await httpRequest(base, hospitalUser, `/api/emergency/${emergencyId}/ambulance`, {
      method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ambulance_id: ambulanceB }),
    });
    assert.equal(reassigned.response.status, 200);
    assert.equal((await revoked).reason, 'reassigned');
    const oldSubscribe = driver.waitFor('socket-error');
    driver.emit('assignment:subscribe', { type: 'emergency', id: emergencyId });
    assert.match((await oldSubscribe).message, /not found|authorized/i);
    const oldLocation = await httpRequest(base, driverA, '/api/driver/location', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ latitude: 12.97, longitude: 77.59, accuracy: 14, timestamp: new Date().toISOString() }),
    });
    assert.equal(oldLocation.response.status, 409);

    const newDriver = await new SocketClient(socketUrl, makeToken(driverB)).connect(); sockets.push(newDriver);
    newDriver.emit('assignment:subscribe', { type: 'emergency', id: emergencyId });
    assert.deepEqual(await newDriver.waitFor('assignment:subscribed'), { type: 'emergency', id: emergencyId });
    const patientAfterReassign = patient.waitFor('ambulance:location_updated');
    const driverAfterReassign = newDriver.waitFor('ambulance:location_updated');
    const newLocation = await httpRequest(base, driverB, '/api/driver/location', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ latitude: 12.98, longitude: 77.60, accuracy: 15, timestamp: new Date().toISOString() }),
    });
    assert.equal(newLocation.response.status, 200);
    assert.equal((await patientAfterReassign).emergencyId, emergencyId);
    assert.equal((await driverAfterReassign).emergencyId, emergencyId);
    assert.equal(driver.history.filter((event) => event.name === 'ambulance:location_updated').length, oldDriverLocationEventsBeforeReassign, 'old driver receives no post-reassignment location event');

    await newDriver.close();
    const reconnectedDriver = await new SocketClient(socketUrl, makeToken(driverB)).connect(); sockets.push(reconnectedDriver);
    reconnectedDriver.emit('assignment:subscribe', { type: 'emergency', id: emergencyId });
    assert.deepEqual(await reconnectedDriver.waitFor('assignment:subscribed'), { type: 'emergency', id: emergencyId });

    for (const status of ['driver_accepted','en_route_to_patient','arrived_at_patient','patient_picked_up','en_route_to_hospital','arrived_at_hospital','completed']) {
      const changed = await httpRequest(base, driverB, `/api/driver/assignments/${emergencyId}/status`, {
        method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status }),
      });
      assert.equal(changed.response.status, 200, `transition ${status}`);
    }
    const closedSubscribe = reconnectedDriver.waitFor('socket-error');
    reconnectedDriver.emit('assignment:subscribe', { type: 'emergency', id: emergencyId });
    assert.match((await closedSubscribe).message, /not found/i);

    await patient.close();
    const reconnectedPatient = await new SocketClient(socketUrl, makeToken(patientUser)).connect(); sockets.push(reconnectedPatient);
    const closedAfterReconnect = reconnectedPatient.waitFor('socket-error');
    reconnectedPatient.emit('assignment:subscribe', { type: 'emergency', id: emergencyId });
    assert.match((await closedAfterReconnect).message, /not found/i);

    const invalid = new SocketClient(socketUrl, 'invalid.jwt.value'); sockets.push(invalid);
    await assert.rejects(invalid.ready, /authentication rejected|authentication failed/i);
    const expiredJwt = jwt.sign({ id: patientUser }, getJwtSecret(), { expiresIn: -10 });
    const expired = new SocketClient(socketUrl, expiredJwt); sockets.push(expired);
    await assert.rejects(expired.ready, /authentication rejected|authentication failed/i);
  } finally {
    await Promise.all(sockets.map((socket) => socket.close().catch(() => {})));
    if (server.listening) await new Promise((resolve) => io.close(resolve));
    pool.query = originalQuery;
    pool.connect = originalConnect;
    await client.query('ROLLBACK');
    client.release();
  }
});
