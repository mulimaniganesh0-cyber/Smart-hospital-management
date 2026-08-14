const { pool } = require('../config/database');

const patientForUser = async (userId) => {
  const result = await pool.query('SELECT id FROM patients WHERE user_id = $1', [userId]);
  return result.rows[0]?.id;
};

const ownsPatient = async (userId, patientId) => {
  const result = await pool.query('SELECT 1 FROM patients WHERE id = $1 AND user_id = $2', [patientId, userId]);
  return result.rowCount > 0;
};

const doctorCanAccess = async (doctorUserId, patientId) => {
  const result = await pool.query(`
    SELECT 1 FROM appointments a JOIN doctors d ON d.id = a.doctor_id
      WHERE d.user_id = $1 AND a.patient_id = $2
    UNION ALL
    SELECT 1 FROM medical_access_grants WHERE doctor_user_id = $1 AND patient_id = $2
      AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
    LIMIT 1`, [doctorUserId, patientId]);
  return result.rowCount > 0;
};

const doctorForAppointment = async (doctorUserId, appointmentId) => {
  const result = await pool.query(`SELECT a.id, a.patient_id, a.doctor_id, d.specialization
    FROM appointments a JOIN doctors d ON d.id = a.doctor_id
    WHERE a.id = $1 AND d.user_id = $2`, [appointmentId, doctorUserId]);
  return result.rows[0];
};

const resolvePatient = async (req, res, next) => {
  const patientId = Number(req.params.id || req.body.patient_id);
  if (!Number.isInteger(patientId) || patientId <= 0) return res.status(400).json({ success: false, message: 'Valid patient ID is required' });
  if (req.user.user_type === 'patient' && !(await ownsPatient(req.user.id, patientId))) return res.status(403).json({ success: false, message: 'You can access only your own medical record' });
  if (req.user.user_type !== 'patient' && !(await doctorCanAccess(req.user.id, patientId))) return res.status(403).json({ success: false, message: 'No active appointment or access grant for this patient' });
  req.patientId = patientId;
  next();
};

const audit = (patientId, actorUserId, action, reason, appointmentId = null, emergency = false) =>
  pool.query('INSERT INTO medical_access_audit_logs (patient_id, actor_user_id, action, reason, appointment_id, emergency_access) VALUES ($1,$2,$3,$4,$5,$6)', [patientId, actorUserId, action, reason, appointmentId, emergency]);

exports.resolvePatient = resolvePatient;

exports.getProfile = async (req, res) => {
  const result = await pool.query(`SELECT p.id, u.name, p.date_of_birth, COALESCE(mp.blood_group,p.blood_group) blood_group, mp.height_cm, mp.weight_kg, mp.allergies, mp.chronic_conditions, mp.current_medications, mp.emergency_contacts, mp.onboarding_completed_at FROM patients p JOIN users u ON u.id=p.user_id LEFT JOIN medical_profiles mp ON mp.patient_id=p.id WHERE p.id=$1`, [req.patientId]);
  await audit(req.patientId, req.user.id, 'VIEW_PROFILE');
  res.json({ success: true, data: result.rows[0] });
};

exports.getTimeline = async (req, res) => {
  const result = await pool.query(`SELECT id, record_type, title, record_date, source, verification_status, details, created_by_user_id, created_at, updated_at FROM medical_records WHERE patient_id=$1 AND deleted_at IS NULL ORDER BY record_date DESC, id DESC LIMIT $2 OFFSET $3`, [req.patientId, Math.min(Number(req.query.limit) || 50, 100), Number(req.query.offset) || 0]);
  await audit(req.patientId, req.user.id, 'VIEW_TIMELINE');
  res.json({ success: true, data: result.rows });
};

exports.getOnboarding = async (req, res) => {
  const patientId = await patientForUser(req.user.id);
  const profile = await pool.query('SELECT onboarding_completed_at FROM medical_profiles WHERE patient_id=$1', [patientId]);
  const records = await pool.query('SELECT 1 FROM medical_records WHERE patient_id=$1 LIMIT 1', [patientId]);
  res.json({ success: true, data: { needs_onboarding: !profile.rows[0]?.onboarding_completed_at && records.rowCount === 0, patient_id: patientId } });
};

exports.saveProfile = async (req, res) => {
  const patientId = await patientForUser(req.user.id);
  if (!patientId) return res.status(404).json({ success: false, message: 'Patient profile not found' });
  const { blood_group, height_cm, weight_kg, allergies = [], chronic_conditions = [], current_medications = [], emergency_contacts = [] } = req.body;
  if (blood_group && !['A+','A-','B+','B-','AB+','AB-','O+','O-'].includes(blood_group)) return res.status(400).json({ success: false, message: 'Invalid blood group' });
  const result = await pool.query(`INSERT INTO medical_profiles (patient_id,blood_group,height_cm,weight_kg,allergies,chronic_conditions,current_medications,emergency_contacts,onboarding_completed_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,CURRENT_TIMESTAMP) ON CONFLICT(patient_id) DO UPDATE SET blood_group=EXCLUDED.blood_group,height_cm=EXCLUDED.height_cm,weight_kg=EXCLUDED.weight_kg,allergies=EXCLUDED.allergies,chronic_conditions=EXCLUDED.chronic_conditions,current_medications=EXCLUDED.current_medications,emergency_contacts=EXCLUDED.emergency_contacts,onboarding_completed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP RETURNING *`, [patientId,blood_group||null,height_cm||null,weight_kg||null,JSON.stringify(allergies),JSON.stringify(chronic_conditions),JSON.stringify(current_medications),JSON.stringify(emergency_contacts)]);
  await pool.query('UPDATE patients SET blood_group = COALESCE($1,blood_group) WHERE id=$2', [blood_group || null, patientId]);
  res.json({ success: true, data: result.rows[0] });
};

exports.createRecord = async (req, res) => {
  const patientId = req.user.user_type === 'patient' ? await patientForUser(req.user.id) : Number(req.body.patient_id);
  const { record_type, title, record_date, details = {} } = req.body;
  const allowedTypes = ['BLOOD_PRESSURE','BLOOD_SUGAR','WEIGHT','CONDITION','ALLERGY','SURGERY','MEDICATION','HOSPITALIZATION','VACCINATION','LAB_RESULT','DOCUMENT','CONSULTATION','OTHER'];
  if (!patientId || !allowedTypes.includes(record_type) || !String(title || '').trim() || !/^\d{4}-\d{2}-\d{2}$/.test(String(record_date || ''))) return res.status(400).json({ success: false, message: 'A supported record type, title, and ISO record date are required' });
  const source = req.user.user_type === 'patient' ? 'PATIENT_PROVIDED' : 'SYSTEM_GENERATED';
  const result = await pool.query(`INSERT INTO medical_records(patient_id,record_type,title,record_date,source,details,created_by_user_id) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`, [patientId,record_type,title,record_date,source,JSON.stringify(details),req.user.id]);
  await pool.query('INSERT INTO medical_record_versions(medical_record_id,version,details,changed_by_user_id,change_reason) VALUES($1,1,$2,$3,$4)', [result.rows[0].id,JSON.stringify(details),req.user.id,'Created']);
  res.status(201).json({ success: true, data: result.rows[0] });
};

exports.getRecord = async (req, res) => {
  const result = await pool.query('SELECT * FROM medical_records WHERE id=$1 AND deleted_at IS NULL', [Number(req.params.recordId)]);
  const record = result.rows[0];
  if (!record) return res.status(404).json({ success: false, message: 'Health record not found' });
  if (req.user.user_type === 'patient' ? !(await ownsPatient(req.user.id, record.patient_id)) : !(await doctorCanAccess(req.user.id, record.patient_id))) return res.status(403).json({ success: false, message: 'Not authorized to view this health record' });
  await audit(record.patient_id, req.user.id, 'VIEW', 'Health record viewed');
  res.json({ success: true, data: record });
};

exports.updateRecord = async (req, res) => {
  const record = (await pool.query('SELECT * FROM medical_records WHERE id=$1 AND deleted_at IS NULL', [Number(req.params.recordId)])).rows[0];
  if (!record) return res.status(404).json({ success: false, message: 'Health record not found' });
  if (req.user.user_type !== 'patient' || record.created_by_user_id !== req.user.id || record.source !== 'PATIENT_PROVIDED') return res.status(403).json({ success: false, message: 'Only the patient who created a patient-provided record can edit it' });
  const { title, record_date, details } = req.body;
  if (record_date && !/^\d{4}-\d{2}-\d{2}$/.test(String(record_date))) return res.status(400).json({ success: false, message: 'Invalid record date' });
  const updated = await pool.query(`UPDATE medical_records SET title=COALESCE($1,title), record_date=COALESCE($2,record_date), details=COALESCE($3,details), version=version+1, updated_at=CURRENT_TIMESTAMP WHERE id=$4 RETURNING *`, [title?.trim() || null, record_date || null, details ? JSON.stringify(details) : null, record.id]);
  await pool.query('INSERT INTO medical_record_versions(medical_record_id,version,details,changed_by_user_id,change_reason) VALUES($1,$2,$3,$4,$5)', [record.id, updated.rows[0].version, JSON.stringify(updated.rows[0].details), req.user.id, 'Patient updated record']);
  await audit(record.patient_id, req.user.id, 'UPDATE', 'Patient updated health record');
  res.json({ success: true, data: updated.rows[0] });
};

exports.removeRecord = async (req, res) => {
  const record = (await pool.query('SELECT * FROM medical_records WHERE id=$1 AND deleted_at IS NULL', [Number(req.params.recordId)])).rows[0];
  if (!record) return res.status(404).json({ success: false, message: 'Health record not found' });
  if (req.user.user_type !== 'patient' || record.created_by_user_id !== req.user.id || record.source !== 'PATIENT_PROVIDED') return res.status(403).json({ success: false, message: 'Only the patient who created this record can remove it' });
  const deleted = await pool.query('UPDATE medical_records SET deleted_at=CURRENT_TIMESTAMP, deleted_by_user_id=$1, deletion_reason=$2, updated_at=CURRENT_TIMESTAMP WHERE id=$3 RETURNING *', [req.user.id, String(req.body.reason || 'Removed by patient').slice(0, 500), record.id]);
  await audit(record.patient_id, req.user.id, 'REVOKE', 'Patient soft-deleted health record');
  res.json({ success: true, data: deleted.rows[0] });
};

exports.verifyRecord = async (req, res) => {
  const result = await pool.query('UPDATE medical_records SET verification_status=$1, source=$2, verified_by_user_id=$3, updated_at=CURRENT_TIMESTAMP WHERE id=$4 RETURNING *', ['VERIFIED','DOCTOR_VERIFIED',req.user.id,req.params.recordId]);
  if (!result.rowCount) return res.status(404).json({ success:false,message:'Medical record not found' });
  res.json({ success:true,data:result.rows[0] });
};

exports.getAppointmentSummary = async (req, res) => {
  const appointment = await doctorForAppointment(req.user.id, Number(req.params.appointmentId));
  if (!appointment) return res.status(403).json({ success: false, message: 'You are not assigned to this appointment' });
  const profile = await pool.query(`SELECT u.name, p.date_of_birth, COALESCE(mp.blood_group, p.blood_group) blood_group,
    mp.allergies, mp.chronic_conditions, mp.current_medications
    FROM patients p JOIN users u ON u.id=p.user_id LEFT JOIN medical_profiles mp ON mp.patient_id=p.id WHERE p.id=$1`, [appointment.patient_id]);
  await audit(appointment.patient_id, req.user.id, 'VIEW', 'Appointment medical summary', appointment.id);
  res.json({ success: true, data: { appointment_id: appointment.id, patient: profile.rows[0], specialization: appointment.specialization } });
};

exports.getAppointmentHistory = async (req, res) => {
  const appointment = await doctorForAppointment(req.user.id, Number(req.params.appointmentId));
  if (!appointment) return res.status(403).json({ success: false, message: 'You are not assigned to this appointment' });
  const records = await pool.query(`SELECT id, record_type, title, record_date, source, verification_status, details
    FROM medical_records WHERE patient_id=$1 ORDER BY record_date DESC, id DESC`, [appointment.patient_id]);
  await audit(appointment.patient_id, req.user.id, 'VIEW', 'Appointment medical history', appointment.id);
  res.json({ success: true, data: records.rows });
};

exports.createConsultation = async (req, res) => {
  const { appointment_id, symptoms, observations, diagnosis, treatment, notes } = req.body;
  const appointment = await doctorForAppointment(req.user.id, Number(appointment_id));
  if (!appointment) return res.status(403).json({ success: false, message: 'You are not assigned to this appointment' });
  const result = await pool.query(`INSERT INTO medical_records(patient_id,record_type,title,record_date,source,verification_status,details,created_by_user_id)
    VALUES ($1,'CONSULTATION',$2,CURRENT_DATE,'DOCTOR_VERIFIED','VERIFIED',$3,$4) RETURNING *`, [appointment.patient_id, diagnosis || 'Clinical consultation', JSON.stringify({ symptoms, observations, diagnosis, treatment, notes, appointment_id }), req.user.id]);
  await audit(appointment.patient_id, req.user.id, 'CREATE', 'Consultation created', appointment.id);
  res.status(201).json({ success: true, data: result.rows[0] });
};

exports.createPrescription = async (req, res) => {
  const { appointment_id, medications, instructions } = req.body;
  const appointment = await doctorForAppointment(req.user.id, Number(appointment_id));
  if (!appointment || !Array.isArray(medications)) return res.status(400).json({ success: false, message: 'Assigned appointment and medications are required' });
  const result = await pool.query(`INSERT INTO medical_records(patient_id,record_type,title,record_date,source,verification_status,details,created_by_user_id)
    VALUES ($1,'PRESCRIPTION','Prescription',CURRENT_DATE,'DOCTOR_VERIFIED','VERIFIED',$2,$3) RETURNING *`, [appointment.patient_id, JSON.stringify({ medications, instructions, appointment_id }), req.user.id]);
  await audit(appointment.patient_id, req.user.id, 'CREATE', 'Prescription created', appointment.id);
  res.status(201).json({ success: true, data: result.rows[0] });
};
