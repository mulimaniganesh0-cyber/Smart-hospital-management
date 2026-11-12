const { pool } = require('../config/database');
const { createNotification } = require('../services/notificationService');

async function doctorForUser(userId) {
  const result = await pool.query(`SELECT d.*, h.name hospital_name, u.email login_id, u.account_status, u.password_reset_required
    FROM doctors d JOIN hospitals h ON h.id=d.hospital_id JOIN users u ON u.id=d.user_id
    WHERE d.user_id=$1 AND COALESCE(d.is_active,TRUE)=TRUE
      AND d.account_activation_status IN ('ACTIVE','EMAIL_REQUIRED')
      AND u.account_status='ACTIVE' AND u.password_reset_required=FALSE
      AND d.hospital_id=u.hospital_id`, [userId]);
  return result.rows[0];
}
exports.requireDoctor = async (req, res, next) => {
  const doctor = await doctorForUser(req.user.id);
  if (!doctor) return res.status(403).json({ success:false, message:'Doctor account is not linked to a doctor profile' });
  req.doctor = doctor; next();
};
exports.profile = async (req,res) => res.json({ success:true, data:req.doctor });
exports.appointments = async (req,res) => {
  const limit=Math.min(Math.max(Number(req.query.limit)||25,1),100); const offset=Math.max(Number(req.query.offset)||0,0);
  const result=await pool.query(`SELECT a.*, u.name patient_name, u.phone patient_phone, h.name hospital_name
    FROM appointments a JOIN patients p ON p.id=a.patient_id JOIN users u ON u.id=p.user_id JOIN hospitals h ON h.id=a.hospital_id
    WHERE a.doctor_id=$1 ORDER BY a.appointment_date DESC,a.appointment_time DESC LIMIT $2 OFFSET $3`, [req.doctor.id,limit,offset]);
  res.json({success:true,data:result.rows,limit,offset});
};
exports.patients = async (req,res) => {
  const result = await pool.query(`SELECT DISTINCT p.id, u.name, u.phone, p.date_of_birth, p.blood_group,
      MAX(a.appointment_date) AS last_appointment_date
    FROM appointments a JOIN patients p ON p.id=a.patient_id JOIN users u ON u.id=p.user_id
    WHERE a.doctor_id=$1 GROUP BY p.id,u.name,u.phone,p.date_of_birth,p.blood_group
    ORDER BY MAX(a.appointment_date) DESC`, [req.doctor.id]);
  res.json({ success:true, data:result.rows });
};
exports.reports = async (req,res) => {
  const result = await pool.query(`SELECT r.*, u.name patient_name FROM doctor_consultation_reports r
    JOIN patients p ON p.id=r.patient_id JOIN users u ON u.id=p.user_id
    WHERE r.doctor_id=$1 ORDER BY r.updated_at DESC LIMIT 100`, [req.doctor.id]);
  res.json({ success:true, data:result.rows });
};
exports.setAvailability = async (req,res) => {
  if (typeof req.body.is_available !== 'boolean') return res.status(400).json({success:false,message:'is_available must be boolean'});
  // Availability controls booking only.  It must not deactivate the doctor's
  // profile or invalidate their account and existing appointments.
  const result=await pool.query('UPDATE doctors SET availability_status=$1,updated_at=CURRENT_TIMESTAMP WHERE id=$2 RETURNING availability_status,is_active', [req.body.is_available,req.doctor.id]);
  res.json({success:true,data:result.rows[0]});
};
exports.appointmentSchedule = async (req, res) => {
  const result = await pool.query(`SELECT weekday, start_time, end_time, slot_duration_minutes
    FROM doctor_schedules WHERE doctor_id=$1 AND hospital_id=$2 AND is_active=true
    ORDER BY weekday, start_time`, [req.doctor.id, req.doctor.hospital_id]);
  res.json({ success: true, schedules: result.rows });
};
exports.changeAppointment = async (req,res) => {
  const status=String(req.body.status||'').toLowerCase();
  const allowed=['accepted','rejected','completed'];
  if (!allowed.includes(status)) return res.status(400).json({success:false,message:'Invalid doctor appointment status'});
  const from = status === 'accepted' ? ['pending'] : status === 'completed' ? ['in_consultation'] : ['pending','accepted','confirmed'];
  const result=await pool.query(`UPDATE appointments SET status=$1::varchar, consultation_completed_at=CASE WHEN $1::text='completed' THEN CURRENT_TIMESTAMP ELSE consultation_completed_at END, updated_at=CURRENT_TIMESTAMP
    WHERE id=$2 AND doctor_id=$3 AND LOWER(status)=ANY($4::text[]) RETURNING *`,[status,Number(req.params.appointmentId),req.doctor.id,from]);
  if(!result.rowCount) return res.status(404).json({success:false,message:'Appointment not found'});
  const a=result.rows[0]; const patient=(await pool.query('SELECT user_id FROM patients WHERE id=$1',[a.patient_id])).rows[0];
  if(patient) await createNotification({io:req.app.get('io'),recipientUserId:patient.user_id,hospitalId:a.hospital_id,patientId:a.patient_id,type:'appointment',relatedType:'appointment',relatedId:a.id,title:'Appointment updated',message:`Your appointment is ${status}.`});
  res.json({success:true,data:a});
};
exports.startConsultation = async (req,res) => {
  const result=await pool.query(`UPDATE appointments SET consultation_started_at=COALESCE(consultation_started_at,CURRENT_TIMESTAMP),status='in_consultation',updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND doctor_id=$2 AND LOWER(status) IN ('accepted','confirmed','in_consultation') RETURNING *`,[Number(req.params.appointmentId),req.doctor.id]);
  if(!result.rowCount) return res.status(404).json({success:false,message:'Appointment not found'}); res.json({success:true,data:result.rows[0]});
};
// Patient identity is derived from the appointment owned by this doctor. The
// record list intentionally excludes drafts, which belong only to the doctor.
exports.consultationContext = async (req,res) => {
  const appointment = (await pool.query(`SELECT a.id,a.appointment_date,a.appointment_time,a.status,a.symptoms,
    p.id patient_id,u.name patient_name,p.date_of_birth,COALESCE(mp.blood_group,p.blood_group) blood_group,
    mp.allergies,mp.chronic_conditions,mp.current_medications
    FROM appointments a JOIN patients p ON p.id=a.patient_id JOIN users u ON u.id=p.user_id
    LEFT JOIN medical_profiles mp ON mp.patient_id=p.id WHERE a.id=$1 AND a.doctor_id=$2`,
  [Number(req.params.appointmentId),req.doctor.id])).rows[0];
  if(!appointment)return res.status(404).json({success:false,message:'Appointment not found'});
  const records=await pool.query(`SELECT id,record_type,title,record_date,details FROM medical_records
    WHERE patient_id=$1 AND deleted_at IS NULL AND publication_status='PUBLISHED'
    ORDER BY record_date DESC,id DESC LIMIT 12`,[appointment.patient_id]);
  await pool.query(`INSERT INTO medical_access_audit_logs(patient_id,actor_user_id,action,reason,appointment_id)
    VALUES($1,$2,'VIEW','Doctor consultation context',$3)`,[appointment.patient_id,req.user.id,appointment.id]);
  res.json({success:true,data:{appointment,records:records.rows}});
};
exports.saveReport = async (req,res) => {
  const b=req.body||{}; const publish=b.publish === true;
  const diagnosis=String(b.diagnosis||'').trim();
  if(!diagnosis) return res.status(400).json({success:false,message:'Diagnosis is required'});
  if(b.follow_up_date && !/^\d{4}-\d{2}-\d{2}$/.test(String(b.follow_up_date))) return res.status(400).json({success:false,message:'Follow-up date must use YYYY-MM-DD'});
  const client=await pool.connect(); let patientUserId; let result; let record;
  try {
    await client.query('BEGIN');
    const a=(await client.query('SELECT * FROM appointments WHERE id=$1 AND doctor_id=$2 FOR UPDATE',[Number(req.params.appointmentId),req.doctor.id])).rows[0];
    if(!a){ await client.query('ROLLBACK'); return res.status(404).json({success:false,message:'Appointment not found'}); }
    if(!['in_consultation','completed'].includes(String(a.status).toLowerCase())){ await client.query('ROLLBACK'); return res.status(409).json({success:false,message:'Start the consultation before creating its report'}); }
    const existingRecord=(await client.query(`SELECT id,publication_status FROM medical_records WHERE appointment_id=$1 AND record_type='CONSULTATION_REPORT' AND source='DOCTOR_VERIFIED' AND deleted_at IS NULL FOR UPDATE`,[a.id])).rows[0];
    if(existingRecord?.publication_status==='PUBLISHED'){ await client.query('ROLLBACK'); return res.status(409).json({success:false,message:'This report has already been given to the patient and cannot be overwritten'}); }
    result=await client.query(`INSERT INTO doctor_consultation_reports(appointment_id,patient_id,doctor_id,hospital_id,diagnosis,symptoms,clinical_observations,treatment,advice,follow_up_date,notes)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(appointment_id) DO UPDATE SET diagnosis=EXCLUDED.diagnosis,symptoms=EXCLUDED.symptoms,clinical_observations=EXCLUDED.clinical_observations,treatment=EXCLUDED.treatment,advice=EXCLUDED.advice,follow_up_date=EXCLUDED.follow_up_date,notes=EXCLUDED.notes,updated_at=CURRENT_TIMESTAMP RETURNING *`,[a.id,a.patient_id,req.doctor.id,a.hospital_id,diagnosis,b.symptoms||a.symptoms||null,b.clinical_observations||null,b.treatment||null,b.advice||null,b.follow_up_date||null,b.notes||null]);
    const details=JSON.stringify({appointment_id:a.id,report_id:result.rows[0].id,diagnosis,symptoms:b.symptoms||a.symptoms||null,clinical_observations:b.clinical_observations||null,treatment:b.treatment||null,advice:b.advice||null,follow_up_date:b.follow_up_date||null,notes:b.notes||null});
    record=await client.query(`INSERT INTO medical_records(patient_id,record_type,title,record_date,source,verification_status,details,created_by_user_id,appointment_id,doctor_id,hospital_id,publication_status,published_at) VALUES($1,'CONSULTATION_REPORT',$2,COALESCE($9::date,CURRENT_DATE),'DOCTOR_VERIFIED','VERIFIED',$3,$4,$5,$6,$7,$8::varchar,CASE WHEN $8::text='PUBLISHED' THEN CURRENT_TIMESTAMP END) ON CONFLICT(appointment_id,record_type) WHERE appointment_id IS NOT NULL AND source='DOCTOR_VERIFIED' AND deleted_at IS NULL DO UPDATE SET details=EXCLUDED.details,publication_status=CASE WHEN medical_records.publication_status='PUBLISHED' THEN 'PUBLISHED' ELSE EXCLUDED.publication_status END,published_at=COALESCE(medical_records.published_at,EXCLUDED.published_at),version=medical_records.version+1,updated_at=CURRENT_TIMESTAMP RETURNING *`,[a.patient_id,`Consultation report #${a.id}`,details,req.user.id,a.id,req.doctor.id,a.hospital_id,publish?'PUBLISHED':'DRAFT',a.appointment_date]);
    if(publish) patientUserId=(await client.query('SELECT user_id FROM patients WHERE id=$1',[a.patient_id])).rows[0]?.user_id;
    await client.query('COMMIT');
  } catch(error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
  if(publish && patientUserId) {
    try { await createNotification({io:req.app.get('io'),recipientUserId:patientUserId,hospitalId:result.rows[0].hospital_id,patientId:result.rows[0].patient_id,type:'medical_report',relatedType:'medical_record',relatedId:record.rows[0].id,title:'New medical report',message:`Dr. ${req.doctor.name.replace(/^Dr\\.?\\s*/i,'')} has added a medical report to your medical records.`}); }
    catch(error) { console.error('Medical report committed; patient notification failed:',error.message); }
  }
  res.json({success:true,data:{...result.rows[0],medical_record_id:record.rows[0].id,publication_status:record.rows[0].publication_status}});
};

exports.savePrescription=async(req,res)=>{const a=(await pool.query('SELECT * FROM appointments WHERE id=$1 AND doctor_id=$2',[Number(req.params.appointmentId),req.doctor.id])).rows[0];const b=req.body||{};if(!a)return res.status(404).json({success:false,message:'Appointment not found'});if(!Array.isArray(b.medications)||!b.medications.length)return res.status(400).json({success:false,message:'At least one medicine is required'});const publish=b.publish===true;const record=await pool.query(`INSERT INTO medical_records(patient_id,record_type,title,record_date,source,verification_status,details,created_by_user_id,appointment_id,doctor_id,hospital_id,publication_status,published_at) VALUES($1,'PRESCRIPTION','Prescription',CURRENT_DATE,'DOCTOR_VERIFIED','VERIFIED',$2,$3,$4,$5,$6,$7::varchar,CASE WHEN $7::varchar='PUBLISHED' THEN CURRENT_TIMESTAMP END) ON CONFLICT(appointment_id,record_type) WHERE appointment_id IS NOT NULL AND source='DOCTOR_VERIFIED' AND deleted_at IS NULL DO UPDATE SET details=EXCLUDED.details,publication_status=CASE WHEN medical_records.publication_status='PUBLISHED' THEN 'PUBLISHED' ELSE EXCLUDED.publication_status END,published_at=COALESCE(medical_records.published_at,EXCLUDED.published_at),version=medical_records.version+1,updated_at=CURRENT_TIMESTAMP RETURNING *`,[a.patient_id,JSON.stringify({appointment_id:a.id,medications:b.medications,instructions:b.instructions||null,notes:b.notes||null}),req.user.id,a.id,req.doctor.id,a.hospital_id,publish?'PUBLISHED':'DRAFT']);if(publish){const patient=(await pool.query('SELECT user_id FROM patients WHERE id=$1',[a.patient_id])).rows[0];if(patient)await createNotification({io:req.app.get('io'),recipientUserId:patient.user_id,hospitalId:a.hospital_id,patientId:a.patient_id,type:'prescription',relatedType:'medical_record',relatedId:record.rows[0].id,title:'New prescription',message:`Dr. ${req.doctor.name.replace(/^Dr\\.?\\s*/i,'')} has issued a prescription.`});}res.json({success:true,data:record.rows[0]});};
