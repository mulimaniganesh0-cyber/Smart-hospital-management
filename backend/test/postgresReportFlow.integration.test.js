const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { pool } = require('../src/config/database');
const doctor = require('../src/controllers/doctorPortalController');
const medical = require('../src/controllers/medicalController');

const enabled = process.env.RUN_POSTGRES_INTEGRATION === '1';

function response() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test('PostgreSQL report draft, publication, patient retrieval, notification, and access isolation', { skip: !enabled }, async () => {
  const client = await pool.connect();
  const originalQuery = pool.query;
  const originalConnect = pool.connect;
  let savepointNumber = 0;
  let activeSavepoint = null;
  const transactionClient = {
    query(sql, values) {
      if (sql === 'BEGIN') {
        activeSavepoint = `report_flow_${++savepointNumber}`;
        return client.query(`SAVEPOINT ${activeSavepoint}`);
      }
      if (sql === 'COMMIT') return client.query(`RELEASE SAVEPOINT ${activeSavepoint}`);
      if (sql === 'ROLLBACK') return client.query(`ROLLBACK TO SAVEPOINT ${activeSavepoint}`);
      return client.query(sql, values);
    },
    release() {},
  };

  try {
    await client.query('BEGIN');
    pool.query = (sql, values) => client.query(sql, values);
    pool.connect = async () => transactionClient;

    const suffix = crypto.randomUUID();
    const hospital = (await client.query(
      `INSERT INTO hospitals(name,registration_number,address) VALUES($1,$2,$3) RETURNING id`,
      [`Integration hospital ${suffix}`, `IT-${suffix}`, 'Rollback-only integration fixture'],
    )).rows[0];
    const insertUser = async (label, userType, role = null, hospitalId = null) => (await client.query(
      `INSERT INTO users(name,email,password_hash,user_type,role,hospital_id) VALUES($1,$2,'test-only-hash',$3,$4,$5) RETURNING id`,
      [label, `${suffix}-${label.replaceAll(' ', '-')}@integration.invalid`, userType, role, hospitalId],
    )).rows[0].id;
    const patientUserId = await insertUser('patient', 'patient');
    const otherPatientUserId = await insertUser('other patient', 'patient');
    const doctorUserId = await insertUser('doctor', 'doctor', 'doctor', hospital.id);
    const patientId = (await client.query('INSERT INTO patients(user_id) VALUES($1) RETURNING id', [patientUserId])).rows[0].id;
    const otherPatientId = (await client.query('INSERT INTO patients(user_id) VALUES($1) RETURNING id', [otherPatientUserId])).rows[0].id;
    const doctorId = (await client.query(
      `INSERT INTO doctors(hospital_id,name,user_id,account_activation_status,is_active) VALUES($1,$2,$3,'ACTIVE',TRUE) RETURNING id`,
      [hospital.id, `Dr Integration ${suffix}`, doctorUserId],
    )).rows[0].id;
    const appointmentId = (await client.query(
      `INSERT INTO appointments(hospital_id,patient_id,doctor_id,appointment_date,appointment_time,status,symptoms) VALUES($1,$2,$3,CURRENT_DATE,'12:00','in_consultation','Integration test symptoms') RETURNING id`,
      [hospital.id, patientId, doctorId],
    )).rows[0].id;

    const save = async (publish) => {
      const res = response();
      await doctor.saveReport({
        params: { appointmentId: String(appointmentId) },
        body: { diagnosis: 'Integration diagnosis', symptoms: 'Integration test symptoms', treatment: 'Integration treatment', publish },
        user: { id: doctorUserId },
        doctor: { id: doctorId, name: 'Dr Integration' },
        app: { get: () => null },
      }, res);
      assert.equal(res.statusCode, 200);
      return res.body.data;
    };

    const draft = await save(false);
    assert.equal(draft.publication_status, 'DRAFT');
    const draftRows = await client.query(`SELECT id FROM medical_records WHERE appointment_id=$1 AND publication_status='PUBLISHED'`, [appointmentId]);
    assert.equal(draftRows.rowCount, 0);

    const published = await save(true);
    assert.equal(published.publication_status, 'PUBLISHED');
    assert.ok(published.medical_record_id);

    const prescriptionRes = response();
    await doctor.savePrescription({
      params: { appointmentId: String(appointmentId) },
      body: { medications: [{ medicine: 'Integration medicine', dosage: '1 tablet' }], publish: true },
      user: { id: doctorUserId },
      doctor: { id: doctorId, name: 'Dr Integration' },
      app: { get: () => null },
    }, prescriptionRes);
    assert.equal(prescriptionRes.statusCode, 200);
    assert.equal(prescriptionRes.body.data.publication_status, 'PUBLISHED');

    const patientReq = { params: { id: String(patientId) }, query: {}, user: { id: patientUserId, user_type: 'patient' } };
    const patientRes = response();
    let nextCalled = false;
    await medical.resolvePatient(patientReq, patientRes, () => { nextCalled = true; });
    assert.equal(nextCalled, true);
    await medical.getTimeline(patientReq, patientRes);
    const found = patientRes.body.data.find((row) => row.id === published.medical_record_id);
    assert.ok(found, 'the patient timeline returns the published report');
    assert.equal(found.details.diagnosis, 'Integration diagnosis');
    assert.equal(found.doctor_name, `Dr Integration ${suffix}`);
    assert.equal(found.hospital_name, `Integration hospital ${suffix}`);
    const foundPrescription = patientRes.body.data.find((row) => row.record_type === 'PRESCRIPTION');
    assert.ok(foundPrescription, 'the patient timeline returns the published prescription');
    assert.equal(foundPrescription.details.medications[0].medicine, 'Integration medicine');

    const otherReq = { params: { id: String(patientId) }, query: {}, user: { id: otherPatientUserId, user_type: 'patient' } };
    const otherRes = response();
    await medical.resolvePatient(otherReq, otherRes, () => { nextCalled = true; });
    assert.equal(otherRes.statusCode, 403, 'another patient cannot use the report timeline');

    const notification = await client.query(
      `SELECT type FROM notifications WHERE user_id=$1 AND type IN ('medical_report','prescription') AND related_id=ANY($2::int[]) ORDER BY type`,
      [patientUserId, [published.medical_record_id, prescriptionRes.body.data.id]],
    );
    assert.deepEqual(notification.rows.map((row) => row.type), ['medical_report','prescription'], 'report and prescription publication persist patient notifications');
  } finally {
    pool.query = originalQuery;
    pool.connect = originalConnect;
    await client.query('ROLLBACK');
    client.release();
    await pool.end();
  }
});
