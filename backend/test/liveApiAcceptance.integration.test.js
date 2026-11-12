const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const enabled = process.env.RUN_POSTGRES_INTEGRATION === '1';
const galleryRoot = path.join(os.tmpdir(), `caresync-gallery-${crypto.randomUUID()}`);
process.env.HOSPITAL_GALLERY_STORAGE_DIR = galleryRoot;

const { pool } = require('../src/config/database');
const app = require('../src/app');
const jwt = require('jsonwebtoken');
const sharp = require('sharp');
const { getJwtSecret } = require('../src/config/jwt');

function makeTransactionPool(client) {
  let savepointId = 0;
  let activeSavepoint;
  return {
    query(sql, values) { return client.query(sql, values); },
    async connect() {
      return {
        query(sql, values) {
          if (sql === 'BEGIN') {
            activeSavepoint = `live_acceptance_${++savepointId}`;
            return client.query(`SAVEPOINT ${activeSavepoint}`);
          }
          if (sql === 'COMMIT') return client.query(`RELEASE SAVEPOINT ${activeSavepoint}`);
          if (sql === 'ROLLBACK') return client.query(`ROLLBACK TO SAVEPOINT ${activeSavepoint}`);
          return client.query(sql, values);
        },
        release() {},
      };
    },
  };
}

async function fixture(client) {
  const suffix = crypto.randomUUID();
  const makeUser = async (name, userType, role = null, hospitalId = null, driverType = null) => {
    const result = await client.query(`INSERT INTO users(name,email,password_hash,user_type,role,hospital_role,hospital_id,is_verified,account_status,driver_type,driver_status)
      VALUES($1,$2,'integration-only-hash',$3,$4,$5,$6,TRUE,'ACTIVE',$7,$8) RETURNING id`,
    [name, `${suffix}-${name.replaceAll(' ', '-')}@integration.invalid`, userType, role, role === 'hospital_admin' ? role : null, hospitalId, driverType, driverType ? 'active' : null]);
    return result.rows[0].id;
  };
  const patientUser = await makeUser('patient', 'patient');
  const patient = (await client.query('INSERT INTO patients(user_id) VALUES($1) RETURNING id', [patientUser])).rows[0].id;
  const otherPatientUser = await makeUser('patient-b', 'patient');
  await client.query('INSERT INTO patients(user_id) VALUES($1)', [otherPatientUser]);
  const hospitalA = (await client.query(`INSERT INTO hospitals(name,registration_number,address,directory_visible)
    VALUES($1,$2,'Rollback-only API acceptance fixture',TRUE) RETURNING id`, [`API Acceptance A ${suffix}`, `API-A-${suffix}`])).rows[0].id;
  const hospitalB = (await client.query(`INSERT INTO hospitals(name,registration_number,address,directory_visible)
    VALUES($1,$2,'Rollback-only API acceptance fixture',TRUE) RETURNING id`, [`API Acceptance B ${suffix}`, `API-B-${suffix}`])).rows[0].id;
  const hospitalUserA = await makeUser('hospital-a', 'hospital', null, hospitalA);
  const hospitalUserB = await makeUser('hospital-b', 'hospital', null, hospitalB);
  await client.query('UPDATE hospitals SET user_id=$1 WHERE id=$2', [hospitalUserA, hospitalA]);
  await client.query('UPDATE hospitals SET user_id=$1 WHERE id=$2', [hospitalUserB, hospitalB]);
  const doctorUserA = await makeUser('doctor-a', 'doctor', 'doctor', hospitalA);
  const doctorUserB = await makeUser('doctor-b', 'doctor', 'doctor', hospitalB);
  const doctorA = (await client.query(`INSERT INTO doctors(hospital_id,name,user_id,account_activation_status,is_active)
    VALUES($1,$2,$3,'ACTIVE',TRUE) RETURNING id`, [hospitalA, `Doctor A ${suffix}`, doctorUserA])).rows[0].id;
  const doctorB = (await client.query(`INSERT INTO doctors(hospital_id,name,user_id,account_activation_status,is_active)
    VALUES($1,$2,$3,'ACTIVE',TRUE) RETURNING id`, [hospitalB, `Doctor B ${suffix}`, doctorUserB])).rows[0].id;
  const adminUser = await makeUser('admin', 'admin', 'admin');
  const driverUser = await makeUser('driver-a', 'staff', 'ambulance_driver', hospitalA, 'hospital_driver');
  const otherDriverUser = await makeUser('driver-b', 'staff', 'ambulance_driver', hospitalA, 'hospital_driver');
  const ambulances = [];
  for (const vehicle of ['API-AMB-A', 'API-AMB-B']) {
    ambulances.push((await client.query(`INSERT INTO ambulances(hospital_id,vehicle_number,type,is_available,status,is_active,driver_user_id)
      VALUES($1,$2,'BLS',TRUE,'AVAILABLE',TRUE,$3) RETURNING id`, [hospitalA, `${vehicle}-${suffix}`, driverUser])).rows[0].id);
  }
  const userIds = { patient: patientUser, otherPatient: otherPatientUser, hospitalA: hospitalUserA, hospitalB: hospitalUserB, doctorA: doctorUserA, doctorB: doctorUserB, admin: adminUser, driver: driverUser, otherDriver: otherDriverUser };
  return { suffix, patient, hospitalA, hospitalB, doctorA, doctorB, ambulances, userIds };
}

function token(userId) {
  return jwt.sign({ id: userId }, getJwtSecret(), { expiresIn: '10m' });
}

async function request(base, userId, route, options = {}) {
  const headers = { authorization: `Bearer ${token(userId)}`, ...(options.headers || {}) };
  const response = await fetch(`${base}${route}`, { ...options, headers });
  const contentType = response.headers.get('content-type') || '';
  const body = contentType.includes('application/json') ? await response.json() : Buffer.from(await response.arrayBuffer());
  return { response, body };
}

test('authenticated PostgreSQL ambulance dispatch API lifecycle (rollback fixture; coordinate input is simulated)', { skip: !enabled }, async (t) => {
  const client = await pool.connect();
  const originalQuery = pool.query;
  const originalConnect = pool.connect;
  let listener;
  await fs.mkdir(galleryRoot, { recursive: true });
  try {
    await client.query('BEGIN');
    const data = await fixture(client);
    Object.assign(pool, makeTransactionPool(client));
    listener = app.listen(0);
    await new Promise((resolve) => listener.once('listening', resolve));
    const base = `http://127.0.0.1:${listener.address().port}`;
    const booked = await request(base, data.userIds.patient, '/api/ambulance/book', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ambulance_id: data.ambulances[0], pickup_location: 'Rollback-only fixture pickup', pickup_lat: 12.9716, pickup_lng: 77.5946, pickup_accuracy: 8, share_live_location: true }) });
    assert.equal(booked.response.status, 201);
    const bookingId = booked.body.data.id;
    const persisted = await client.query('SELECT status,ambulance_id,driver_user_id,pickup_lat,pickup_lng FROM ambulance_bookings WHERE id=$1', [bookingId]);
    assert.equal(persisted.rows[0].status, 'assigned');
    assert.equal(Number(persisted.rows[0].pickup_lat), 12.9716);
    const patientList = await request(base, data.userIds.patient, '/api/ambulance/bookings');
    assert.equal(patientList.response.status, 200);
    assert.ok(patientList.body.data.some((row) => row.id === bookingId));
    const otherPatientView = await request(base, data.userIds.otherPatient, `/api/ambulance/booking/${bookingId}`);
    assert.equal(otherPatientView.response.status, 404);
    const patientDriverAccess = await request(base, data.userIds.patient, '/api/driver/assignments');
    assert.equal(patientDriverAccess.response.status, 403);
    const hospitalBookings = await request(base, data.userIds.hospitalA, '/api/ambulance/hospital/bookings');
    assert.equal(hospitalBookings.response.status, 200);
    assert.ok(hospitalBookings.body.data.some((row) => row.id === bookingId));
    const conflict = await request(base, data.userIds.patient, '/api/ambulance/book', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ambulance_id: data.ambulances[1], pickup_location: 'Conflicting trip' }) });
    assert.equal(conflict.response.status, 409, 'same driver cannot receive a concurrent active booking');
    const assignment = await request(base, data.userIds.driver, '/api/driver/assignments');
    assert.equal(assignment.response.status, 200);
    assert.ok(assignment.body.data.some((row) => row.assignment_id === bookingId));
    const otherDriverView = await request(base, data.userIds.otherDriver, `/api/ambulance/booking/${bookingId}`);
    assert.equal(otherDriverView.response.status, 404);
    const locationUpdate = await request(base, data.userIds.driver, '/api/driver/location', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ latitude: 12.972, longitude: 77.595, accuracy: 12, timestamp: new Date().toISOString() }) });
    assert.equal(locationUpdate.response.status, 200, 'active assigned driver can publish a current location');
    const storedLocation = await client.query('SELECT driver_location_lat,driver_location_lng,driver_location_accuracy FROM ambulances WHERE id=$1', [data.ambulances[0]]);
    assert.equal(Number(storedLocation.rows[0].driver_location_lat), 12.972);
    const transitions = ['driver_accepted','en_route_to_patient','arrived_at_patient','patient_picked_up','en_route_to_hospital','arrived_at_hospital','completed'];
    for (const status of transitions) {
      const changed = await request(base, data.userIds.driver, `/api/driver/bookings/${bookingId}/status`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status }) });
      assert.equal(changed.response.status, 200, `driver transition to ${status}`);
    }
    const finished = await client.query('SELECT status,completed_at FROM ambulance_bookings WHERE id=$1', [bookingId]);
    assert.equal(finished.rows[0].status, 'completed');
    assert.ok(finished.rows[0].completed_at);
    const closedLocation = await request(base, data.userIds.driver, '/api/driver/location', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ latitude: 12.97, longitude: 77.59, accuracy: 10, timestamp: new Date().toISOString() }) });
    assert.equal(closedLocation.response.status, 409, 'location sharing stops after completion');
  } finally {
    if (listener) await new Promise((resolve) => listener.close(resolve));
    pool.query = originalQuery;
    pool.connect = originalConnect;
    await client.query('ROLLBACK');
    client.release();
    await fs.rm(galleryRoot, { recursive: true, force: true });
  }
});

test('authenticated PostgreSQL hospital gallery upload, draft, publish, isolation, and storage API lifecycle (rollback fixture)', { skip: !enabled }, async () => {
  const client = await pool.connect();
  const originalQuery = pool.query;
  const originalConnect = pool.connect;
  let listener;
  await fs.mkdir(galleryRoot, { recursive: true });
  try {
    await client.query('BEGIN');
    const data = await fixture(client);
    Object.assign(pool, makeTransactionPool(client));
    listener = app.listen(0);
    await new Promise((resolve) => listener.once('listening', resolve));
    const base = `http://127.0.0.1:${listener.address().port}`;
    const image = await sharp({ create: { width: 12, height: 8, channels: 3, background: '#2580c0' } }).png().toBuffer();
    const uploadImage = async (asUser, bytes, filename = 'fixture.png') => {
      const form = new FormData();
      form.append('photo', new Blob([bytes], { type: 'image/png' }), filename);
      form.append('caption', 'Rollback-only gallery fixture');
      return request(base, asUser, '/api/hospitals/gallery/photos', { method: 'POST', body: form });
    };
    const uploaded = await uploadImage(data.userIds.hospitalA, image);
    assert.equal(uploaded.response.status, 201);
    const photoId = uploaded.body.data.id;
    const key = (await client.query('SELECT storage_key,is_published FROM hospital_photos WHERE id=$1', [photoId])).rows[0];
    assert.equal(key.is_published, false);
    await fs.access(path.join(galleryRoot, `${key.storage_key}.webp`));
    await fs.access(path.join(galleryRoot, `${key.storage_key}-thumb.webp`));
    const draftPreview = await request(base, data.userIds.hospitalA, `/api/hospitals/gallery/photos/${photoId}/image`);
    assert.equal(draftPreview.response.status, 200);
    assert.ok(Buffer.isBuffer(draftPreview.body) && draftPreview.body.length > 0);
    const hiddenDraft = await request(base, data.userIds.patient, `/api/hospitals/${data.hospitalA}/photos`);
    assert.equal(hiddenDraft.response.status, 200);
    assert.equal(hiddenDraft.body.data.length, 0);
    const crossHospital = await request(base, data.userIds.hospitalB, `/api/hospitals/gallery/photos/${photoId}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ is_published: true }) });
    assert.equal(crossHospital.response.status, 404);
    const published = await request(base, data.userIds.hospitalA, `/api/hospitals/gallery/photos/${photoId}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ is_published: true }) });
    assert.equal(published.response.status, 200);
    const visible = await request(base, data.userIds.patient, `/api/hospitals/${data.hospitalA}/photos`);
    assert.equal(visible.response.status, 200);
    assert.ok(visible.body.data.some((row) => row.id === photoId));
    const invalid = await uploadImage(data.userIds.hospitalA, Buffer.from('not an image'), 'invalid.png');
    assert.equal(invalid.response.status, 400);
    const oversized = await uploadImage(data.userIds.hospitalA, Buffer.alloc(8 * 1024 * 1024 + 1), 'oversized.png');
    assert.equal(oversized.response.status, 413);
    await fs.unlink(path.join(galleryRoot, `${key.storage_key}.webp`));
    const missingImage = await request(base, data.userIds.patient, `/api/hospitals/${data.hospitalA}/photos/${photoId}/image`);
    assert.equal(missingImage.response.status, 404);
  } finally {
    if (listener) await new Promise((resolve) => listener.close(resolve));
    pool.query = originalQuery;
    pool.connect = originalConnect;
    await client.query('ROLLBACK');
    client.release();
    await fs.rm(galleryRoot, { recursive: true, force: true });
  }
});

test('authenticated PostgreSQL doctor/admin role matrix enforces patient, hospital, doctor, and admin boundaries', { skip: !enabled }, async () => {
  const client = await pool.connect();
  const originalQuery = pool.query;
  const originalConnect = pool.connect;
  let listener;
  try {
    await client.query('BEGIN');
    const data = await fixture(client);
    const appointmentId = (await client.query(`INSERT INTO appointments(hospital_id,patient_id,doctor_id,appointment_date,appointment_time,status,symptoms)
      VALUES($1,$2,$3,CURRENT_DATE,'13:00','pending','Rollback-only authorization fixture') RETURNING id`,
    [data.hospitalB, data.patient, data.doctorB])).rows[0].id;
    Object.assign(pool, makeTransactionPool(client));
    listener = app.listen(0);
    await new Promise((resolve) => listener.once('listening', resolve));
    const base = `http://127.0.0.1:${listener.address().port}`;

    const patientOwn = await request(base, data.userIds.patient, '/api/patients/profile');
    assert.equal(patientOwn.response.status, 200);
    const patientOtherTimeline = await request(base, data.userIds.otherPatient, `/api/medical/patients/${data.patient}/timeline`);
    assert.equal(patientOtherTimeline.response.status, 403);
    assert.equal(JSON.stringify(patientOtherTimeline.body).includes('Rollback-only authorization fixture'), false);
    const patientDoctorWrite = await request(base, data.userIds.patient, `/api/doctor/appointments/${appointmentId}/report`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ diagnosis: 'unauthorized' }) });
    assert.equal(patientDoctorWrite.response.status, 403);
    const patientHospitalAdmin = await request(base, data.userIds.patient, '/api/hospitals/profile');
    assert.equal(patientHospitalAdmin.response.status, 403);
    const patientAdmin = await request(base, data.userIds.patient, '/api/admin/users');
    assert.equal(patientAdmin.response.status, 403);

    const hospitalOwn = await request(base, data.userIds.hospitalA, '/api/hospitals/profile');
    assert.equal(hospitalOwn.response.status, 200);
    const hospitalStateBefore = await client.query('SELECT * FROM hospital_resources WHERE hospital_id=$1', [data.hospitalB]);
    const hospitalAdminWrite = await request(base, data.userIds.hospitalA, `/api/admin/hospitals/${data.hospitalB}/resources`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ general_beds_total: 999 }) });
    assert.equal(hospitalAdminWrite.response.status, 403);
    const hospitalState = await client.query('SELECT general_beds_total FROM hospital_resources WHERE hospital_id=$1', [data.hospitalB]);
    assert.deepEqual(hospitalState.rows.map((row) => row.general_beds_total), hospitalStateBefore.rows.map((row) => row.general_beds_total), 'denied cross-hospital request leaves resources unchanged');

    const doctorOwn = await request(base, data.userIds.doctorB, '/api/doctor/appointments');
    assert.equal(doctorOwn.response.status, 200);
    assert.ok(doctorOwn.body.data.some((row) => row.id === appointmentId));
    const doctorOther = await request(base, data.userIds.doctorA, `/api/doctor/appointments/${appointmentId}/status`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status: 'accepted' }) });
    assert.equal(doctorOther.response.status, 404);
    const unchanged = await client.query('SELECT status FROM appointments WHERE id=$1', [appointmentId]);
    assert.equal(unchanged.rows[0].status, 'pending');
    const doctorNoPatientGrant = await request(base, data.userIds.doctorA, `/api/medical/patients/${data.patient}/timeline`);
    assert.equal(doctorNoPatientGrant.response.status, 403);
    const doctorAdmin = await request(base, data.userIds.doctorA, '/api/admin/users');
    assert.equal(doctorAdmin.response.status, 403);
    const doctorHospitalAdmin = await request(base, data.userIds.doctorA, '/api/hospitals/profile');
    assert.equal(doctorHospitalAdmin.response.status, 403);

    const doctorPositive = await request(base, data.userIds.doctorB, `/api/doctor/appointments/${appointmentId}/status`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status: 'accepted' }) });
    assert.equal(doctorPositive.response.status, 200);
    assert.equal((await client.query('SELECT status FROM appointments WHERE id=$1', [appointmentId])).rows[0].status, 'accepted');

    const driverAdmin = await request(base, data.userIds.driver, '/api/admin/users');
    assert.equal(driverAdmin.response.status, 403);
    const adminPositive = await request(base, data.userIds.admin, '/api/admin/users');
    assert.equal(adminPositive.response.status, 200);
    const registrationEscalation = await fetch(`${base}/api/auth/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'No role escalation', email: `${data.suffix}-escalation@integration.invalid`, password: 'test-only-password', user_type: 'admin', role: 'admin' }) });
    assert.equal(registrationEscalation.status, 400);
    assert.equal((await client.query('SELECT COUNT(*)::int AS count FROM users WHERE email=$1', [`${data.suffix}-escalation@integration.invalid`])).rows[0].count, 0);
  } finally {
    if (listener) await new Promise((resolve) => listener.close(resolve));
    pool.query = originalQuery;
    pool.connect = originalConnect;
    await client.query('ROLLBACK');
    client.release();
    await fs.rm(galleryRoot, { recursive: true, force: true });
  }
});
