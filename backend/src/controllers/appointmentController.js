// src/controllers/appointmentController.js
const { pool } = require('../config/database');
const { timezone } = require('./dailyQrController');
const { createNotification, notifyHospital } = require('../services/notificationService');
const { getAvailability } = require('../services/appointmentAvailabilityService');

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const timePattern = /^\d{2}:\d{2}(:\d{2})?$/;

function validCalendarDate(value) {
  if (!datePattern.test(String(value || ''))) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function canonicalTime(value) {
  const time = String(value);
  return time.length === 5 ? `${time}:00` : time.slice(0, 8);
}

async function hospitalForUser(db, userId) {
  const result = await db.query(`SELECT h.id FROM hospitals h LEFT JOIN users u ON u.id=$1
    WHERE h.user_id=$1 OR h.id=u.hospital_id LIMIT 1`, [userId]);
  return result.rows[0]?.id;
}

function scheduleInputValid(schedule) {
  return Number.isInteger(Number(schedule.weekday)) && Number(schedule.weekday) >= 0 && Number(schedule.weekday) <= 6 &&
    timePattern.test(String(schedule.start_time || '')) && timePattern.test(String(schedule.end_time || '')) &&
    Number.isInteger(Number(schedule.slot_duration_minutes)) && Number(schedule.slot_duration_minutes) > 0 && Number(schedule.slot_duration_minutes) <= 480 &&
    (!schedule.break_start_time || timePattern.test(String(schedule.break_start_time))) &&
    (!schedule.break_end_time || timePattern.test(String(schedule.break_end_time)));
}

exports.getDoctorSchedule = async (req, res) => {
  try {
    const hospitalId = await hospitalForUser(pool, req.user.id);
    const doctorId = Number(req.params.doctorId);
    if (!hospitalId || !Number.isInteger(doctorId)) return res.status(400).json({ success: false, message: 'Valid doctor required' });
    const result = await pool.query(`SELECT id, weekday, start_time, end_time, slot_duration_minutes, break_start_time, break_end_time, is_active
      FROM doctor_schedules WHERE doctor_id=$1 AND hospital_id=$2 ORDER BY weekday, start_time`, [doctorId, hospitalId]);
    res.json({ success: true, doctor_id: doctorId, hospital_id: hospitalId, schedules: result.rows });
  } catch (error) { console.error('Get doctor schedule error:', error); res.status(500).json({ success: false, message: 'Unable to load doctor schedule' }); }
};

exports.replaceDoctorSchedule = async (req, res) => {
  const client = await pool.connect();
  try {
    const hospitalId = await hospitalForUser(client, req.user.id);
    const doctorId = Number(req.params.doctorId);
    const schedules = req.body?.schedules;
    if (!hospitalId || !Number.isInteger(doctorId) || !Array.isArray(schedules) || !schedules.every(scheduleInputValid)) return res.status(400).json({ success: false, message: 'Provide valid weekly schedule rows (weekday 0-6, start_time, end_time, slot_duration_minutes)' });
    await client.query('BEGIN');
    const doctor = await client.query('SELECT id FROM doctors WHERE id=$1 AND hospital_id=$2 FOR UPDATE', [doctorId, hospitalId]);
    if (!doctor.rowCount) { await client.query('ROLLBACK'); return res.status(404).json({ success: false, message: 'Doctor not found at this hospital' }); }
    await client.query('DELETE FROM doctor_schedules WHERE doctor_id=$1 AND hospital_id=$2', [doctorId, hospitalId]);
    for (const schedule of schedules) await client.query(`INSERT INTO doctor_schedules(doctor_id,hospital_id,weekday,start_time,end_time,slot_duration_minutes,break_start_time,break_end_time,is_active)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [doctorId, hospitalId, Number(schedule.weekday), schedule.start_time, schedule.end_time, Number(schedule.slot_duration_minutes), schedule.break_start_time || null, schedule.break_end_time || null, schedule.is_active !== false]);
    await client.query('COMMIT');
    res.json({ success: true, message: 'Doctor appointment schedule saved' });
  } catch (error) { await client.query('ROLLBACK').catch(() => {}); console.error('Save doctor schedule error:', error); res.status(400).json({ success: false, message: 'Unable to save doctor schedule' }); }
  finally { client.release(); }
};

async function patientAppointment(userId, appointmentId) {
  const result = await pool.query(`SELECT a.* FROM appointments a
    JOIN patients p ON p.id = a.patient_id
    WHERE a.id = $1 AND p.user_id = $2`, [appointmentId, userId]);
  return result.rows[0];
}

function reschedulable(appointment) {
  return appointment && ['pending', 'confirmed', 'rescheduled'].includes(appointment.status) &&
    new Date(`${String(appointment.appointment_date).slice(0, 10)}T${String(appointment.appointment_time).slice(0, 8)}`) > new Date();
}

exports.getMyAppointments = async (req, res) => {
  try {
    const userId = req.user.id;
    
    const result = await pool.query(
      `SELECT a.*, 
        h.id as hospital_id, 
        h.name as hospital_name, 
        h.address as hospital_address,
        d.id as doctor_id,
        d.name as doctor_name, 
        d.specialization
       FROM appointments a
       JOIN hospitals h ON a.hospital_id = h.id
       LEFT JOIN doctors d ON a.doctor_id = d.id
       JOIN patients p ON a.patient_id = p.id
       WHERE p.user_id = $1
       ORDER BY a.appointment_date DESC, a.appointment_time DESC`,
      [userId]
    );
    
    console.log(`Found ${result.rows.length} appointments for user ${userId}`);
    
    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error('Get my appointments error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// src/controllers/appointmentController.js - Update getHospitalAppointments

exports.getHospitalAppointments = async (req, res) => {
  try {
    const userId = req.user.id;
    
    const hospitalResult = await pool.query(
      'SELECT id FROM hospitals WHERE user_id = $1',
      [userId]
    );
    
    if (hospitalResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Hospital not found' });
    }
    
    const hospitalId = hospitalResult.rows[0].id;
    
    const result = await pool.query(
      `SELECT a.*, 
        u.name as patient_name, 
        u.phone as patient_phone,
        d.name as doctor_name,
        d.specialization
       FROM appointments a
       JOIN patients p ON a.patient_id = p.id
       JOIN users u ON p.user_id = u.id
       LEFT JOIN doctors d ON a.doctor_id = d.id
       WHERE a.hospital_id = $1
       ORDER BY a.created_at DESC`,
      [hospitalId]
    );
    
    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error('Get hospital appointments error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

exports.updateAppointmentStatus = async (req, res) => {
  try {
    const { appointmentId } = req.params;
    const { status } = req.body;
    
    const hospital = await pool.query('SELECT id FROM hospitals WHERE user_id=$1', [req.user.id]);
    if (!hospital.rowCount) return res.status(404).json({ success: false, message: 'Hospital not found' });
    const result = await pool.query(
      `UPDATE appointments 
       SET status = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND hospital_id = $3
       RETURNING *`,
      [status, appointmentId, hospital.rows[0].id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Appointment not found' });
    }
    
    res.json({
      success: true,
      message: 'Appointment status updated',
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Update appointment status error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

exports.cancelAppointment = async (req, res) => {
  try {
    const { appointmentId } = req.params;
    
    const result = await pool.query(
      `UPDATE appointments 
       SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND patient_id = (SELECT id FROM patients WHERE user_id = $2)
         AND status IN ('pending', 'confirmed', 'rescheduled')
       RETURNING *`,
      [appointmentId, req.user.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Appointment not found' });
    }
    
    res.json({
      success: true,
      message: 'Appointment cancelled successfully',
    });
  } catch (error) {
    console.error('Cancel appointment error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

exports.getAvailableSlots = async (req, res) => {
  try {
    const appointmentId = Number(req.params.appointmentId);
    const appointment = await patientAppointment(req.user.id, appointmentId);
    if (!appointment) return res.status(404).json({ success: false, message: 'Appointment not found' });
    if (!reschedulable(appointment)) return res.status(400).json({ success: false, message: 'This appointment can no longer be rescheduled' });
    const date = String(req.query.date || '').trim();
    if (!datePattern.test(date)) return res.status(400).json({ success: false, message: 'A valid date is required' });
    const availability = await getAvailability(pool, { hospitalId: appointment.hospital_id, doctorId: appointment.doctor_id, date });
    res.json({ success: true, reason: availability.reason, data: availability.slots.filter((slot) => slot.available).map((slot) => ({ date, time: slot.time.slice(0, 5) })) });
  } catch (error) {
    console.error('Get available slots error:', error);
    res.status(500).json({ success: false, message: 'Unable to load available slots' });
  }
};

// Booking availability is generated from the hospital's configured doctor
// schedule. There is no device-side or hard-coded source of appointment times.
exports.getDoctorAvailableSlots = async (req, res) => {
  try {
    const doctorId = Number(req.query.doctor_id); const hospitalId = Number(req.query.hospital_id); const date = String(req.query.date || '').trim();
    if (!Number.isInteger(doctorId) || !Number.isInteger(hospitalId) || !validCalendarDate(date)) return res.status(400).json({success:false,message:'Select a hospital, doctor, and valid date',code:'INVALID_SLOT_QUERY'});
    const availability = await getAvailability(pool, { hospitalId, doctorId, date });
    console.info('[APPOINTMENT AVAILABILITY]', { hospitalId, doctorId, date, weekday: availability.weekday, reason: availability.reason, generatedSlots: availability.slots.length, availableSlots: availability.slots.filter((slot) => slot.available).length });
    res.json({success:true,doctor_id:doctorId,hospital_id:hospitalId,date,available:availability.available,reason:availability.reason,slots:availability.slots});
  } catch (error) { console.error('Get doctor slots error:',error); res.status(500).json({success:false,message:'Unable to load available slots',code:'AVAILABILITY_ERROR'}); }
};

exports.rescheduleAppointment = async (req, res) => {
  const client = await pool.connect();
  try {
    const appointmentId = Number(req.params.appointmentId);
    const { date, time } = req.body;
    if (!Number.isInteger(appointmentId) || !validCalendarDate(String(date)) || !timePattern.test(String(time))) {
      return res.status(400).json({ success: false, message: 'A valid date and time are required' });
    }
    await client.query('BEGIN');
    const pastTime = await client.query(`SELECT $1::date = (CURRENT_TIMESTAMP AT TIME ZONE $3)::date
      AND $2::time <= (CURRENT_TIMESTAMP AT TIME ZONE $3)::time AS is_past`, [date, time, timezone]);
    if (pastTime.rows[0].is_past) { await client.query('ROLLBACK'); return res.status(400).json({success:false,message:'Select a future available appointment time',code:'INVALID_DATE'}); }
    const owned = await client.query(`SELECT a.* FROM appointments a JOIN patients p ON p.id=a.patient_id
      WHERE a.id=$1 AND p.user_id=$2 FOR UPDATE`, [appointmentId, req.user.id]);
    const appointment = owned.rows[0];
    if (!appointment) { await client.query('ROLLBACK'); return res.status(404).json({ success: false, message: 'Appointment not found' }); }
    if (!reschedulable(appointment)) { await client.query('ROLLBACK'); return res.status(400).json({ success: false, message: 'This appointment can no longer be rescheduled' }); }
    const availability = await getAvailability(client, { hospitalId: appointment.hospital_id, doctorId: appointment.doctor_id, date });
    if (!availability.slots.some((slot) => slot.available && slot.time === canonicalTime(time))) { await client.query('ROLLBACK'); return res.status(409).json({ success: false, message: 'That time is no longer available' }); }
    const conflict = await client.query(`SELECT 1 FROM appointments WHERE doctor_id=$1 AND appointment_date=$2 AND appointment_time=$3
      AND status NOT IN ('cancelled','rejected','completed') AND id <> $4 FOR UPDATE`, [appointment.doctor_id, date, time, appointmentId]);
    if (conflict.rowCount) { await client.query('ROLLBACK'); return res.status(409).json({ success: false, message: 'That time has just been booked' }); }
    const updated = await client.query(`UPDATE appointments SET appointment_date=$1, appointment_time=$2, status='rescheduled', updated_at=CURRENT_TIMESTAMP WHERE id=$3 RETURNING *`, [date, time, appointmentId]);
    await client.query(`INSERT INTO appointment_reschedule_history(appointment_id,previous_date,previous_time,new_date,new_time,changed_by_user_id) VALUES($1,$2,$3,$4,$5,$6)`, [appointmentId, appointment.appointment_date, appointment.appointment_time, date, time, req.user.id]);
    await client.query('COMMIT');
    res.json({ success: true, data: updated.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Reschedule appointment error:', error);
    if (error.code === '23505') return res.status(409).json({ success: false, message: 'That appointment time has just been booked' });
    res.status(500).json({ success: false, message: 'Unable to reschedule appointment' });
  } finally { client.release(); }
};

exports.getRescheduleHistory = async (req, res) => {
  try {
    const appointment = await patientAppointment(req.user.id, Number(req.params.appointmentId));
    if (!appointment) return res.status(404).json({ success: false, message: 'Appointment not found' });
    const result = await pool.query('SELECT previous_date, previous_time, new_date, new_time, created_at FROM appointment_reschedule_history WHERE appointment_id=$1 ORDER BY created_at DESC', [appointment.id]);
    res.json({ success: true, data: result.rows });
  } catch (error) { res.status(500).json({ success: false, message: 'Unable to load reschedule history' }); }
};

// Override the legacy non-transactional create path.  The selected configured
// slot is locked together with the appointment insertion, so two requests for
// the same doctor/date/time cannot both succeed.
exports.createAppointment = async (req, res) => {
  const client = await pool.connect();
  try {
    const { hospital_id, doctor_id, appointment_date, appointment_time, symptoms, qr_payload } = req.body;
    const hospitalId = Number(hospital_id); const doctorId = Number(doctor_id);
    if (!Number.isInteger(hospitalId) || !Number.isInteger(doctorId) || !validCalendarDate(String(appointment_date || '')) || !timePattern.test(String(appointment_time || ''))) return res.status(400).json({success:false,message:'Select a valid offered appointment slot',code:'INVALID_SLOT'});
    const dateCheck = await client.query(`SELECT $1::date < (CURRENT_TIMESTAMP AT TIME ZONE $2)::date AS is_past`, [appointment_date, timezone]);
    if (dateCheck.rows[0].is_past) return res.status(400).json({success:false,message:'Appointment date cannot be in the past',code:'INVALID_DATE'});
    await client.query('BEGIN');
    const pastTime = await client.query(`SELECT $1::date = (CURRENT_TIMESTAMP AT TIME ZONE $3)::date
      AND $2::time <= (CURRENT_TIMESTAMP AT TIME ZONE $3)::time AS is_past`, [appointment_date, appointment_time, timezone]);
    if (pastTime.rows[0].is_past) { await client.query('ROLLBACK'); return res.status(400).json({success:false,message:'Select a future available appointment time',code:'INVALID_DATE'}); }
    const patient = await client.query('SELECT id FROM patients WHERE user_id=$1', [req.user.id]);
    const doctor = await client.query(`SELECT d.id, d.department, d.specialization
      FROM doctors d JOIN hospitals h ON h.id=d.hospital_id
      WHERE d.id=$1 AND d.hospital_id=$2 AND COALESCE(d.is_active,true)
        AND COALESCE(d.availability_status,true) AND (h.is_verified=true OR h.directory_visible=true)`, [doctorId,hospitalId]);
    if (!patient.rowCount) { await client.query('ROLLBACK'); return res.status(404).json({success:false,message:'Patient not found'}); }
    if (!doctor.rowCount) { await client.query('ROLLBACK'); return res.status(400).json({success:false,message:'Doctor is not associated with this available hospital',code:'DOCTOR_NOT_ASSOCIATED_WITH_HOSPITAL'}); }
    if (qr_payload != null) {
      const match = /^careguide:\/\/hospital-queue\/([A-Za-z0-9_-]{20,})$/.exec(String(qr_payload).trim());
      if (!match) { await client.query('ROLLBACK'); return res.status(400).json({success:false,message:'Invalid hospital QR code.',code:'INVALID_QR'}); }
      const qr = await client.query(`SELECT id, qr_date FROM hospital_daily_qr
        WHERE qr_token=$1 AND hospital_id=$2 AND status='ACTIVE'
          AND qr_date=(CURRENT_TIMESTAMP AT TIME ZONE $3)::date
          AND valid_until>CURRENT_TIMESTAMP`, [match[1], hospitalId, timezone]);
      if (!qr.rowCount || String(appointment_date) !== String(qr.rows[0].qr_date).slice(0, 10)) {
        await client.query('ROLLBACK');
        return res.status(409).json({success:false,message:'This hospital QR is valid only for today\'s appointments. Please scan today\'s QR code.',code:'QR_EXPIRED'});
      }
    }
    const availability = await getAvailability(client, { hospitalId, doctorId, date: appointment_date });
    if (!availability.slots.some((slot) => slot.available && slot.time === canonicalTime(appointment_time))) { await client.query('ROLLBACK'); return res.status(409).json({success:false,message:'This slot is no longer available. Please select another available time.',code:'SLOT_UNAVAILABLE'}); }
    const conflict = await client.query(`SELECT id FROM appointments WHERE doctor_id=$1 AND appointment_date=$2 AND appointment_time=$3 AND status NOT IN ('cancelled','rejected','completed') FOR UPDATE`, [doctorId,appointment_date,appointment_time]);
    if (conflict.rowCount) { await client.query('ROLLBACK'); return res.status(409).json({success:false,message:'This slot was just booked by another patient.',code:'SLOT_UNAVAILABLE'}); }
    const result = await client.query(`INSERT INTO appointments(patient_id,hospital_id,doctor_id,appointment_date,appointment_time,symptoms,status) VALUES($1,$2,$3,$4,$5,$6,'pending') RETURNING *`, [patient.rows[0].id,hospitalId,doctorId,appointment_date,appointment_time,symptoms?.trim() || null]);
    let token = null;
    if (qr_payload != null) {
      const department = doctor.rows[0].department || doctor.rows[0].specialization || null;
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`${hospitalId}:${doctorId}:${department ?? 'all'}:${appointment_date}:OUTPATIENT`]);
      let queue = (await client.query(`SELECT * FROM hospital_queues
        WHERE hospital_id=$1 AND doctor_id=$2 AND department IS NOT DISTINCT FROM $3
          AND queue_date=$4 AND service_type='OUTPATIENT' FOR UPDATE`, [hospitalId, doctorId, department, appointment_date])).rows[0];
      if (!queue) {
        queue = (await client.query(`INSERT INTO hospital_queues(hospital_id,doctor_id,department,queue_date)
          VALUES($1,$2,$3,$4) RETURNING *`, [hospitalId, doctorId, department, appointment_date])).rows[0];
      }
      const tokenNumber = queue.next_token_number;
      token = (await client.query(`INSERT INTO queue_tokens(queue_id,patient_id,token_number,source,status,estimated_wait_minutes)
        VALUES($1,$2,$3,'QR','BOOKED',$4) RETURNING *`, [queue.id, patient.rows[0].id, tokenNumber, tokenNumber === 1 ? 0 : (tokenNumber - 1) * queue.default_consultation_minutes])).rows[0];
      await client.query('UPDATE hospital_queues SET next_token_number=next_token_number+1,updated_at=CURRENT_TIMESTAMP WHERE id=$1', [queue.id]);
    }
    await client.query('COMMIT');
    const io = req.app.get('io');
    await createNotification({
      io,
      recipientUserId: req.user.id,
      hospitalId,
      patientId: patient.rows[0].id,
      type: 'appointment_confirmed',
      relatedType: 'appointment',
      relatedId: result.rows[0].id,
      title: 'Appointment confirmed',
      message: `Your appointment on ${appointment_date} at ${appointment_time} is confirmed.`,
    }).catch(() => null);
    await notifyHospital({
      io,
      hospitalId,
      type: 'appointment_booked',
      relatedType: 'appointment',
      relatedId: result.rows[0].id,
      title: 'New appointment booked',
      message: `A patient booked an appointment on ${appointment_date} at ${appointment_time}.`,
    }).catch(() => null);
    io?.to(`hospital_${hospitalId}`).emit('appointment-changed', { appointmentId: result.rows[0].id, hospitalId });
    if (token) io?.to(`hospital_${hospitalId}`).emit('queue:changed', { queueId: token.queue_id, hospitalId, token });
    res.status(201).json({success:true,message:'Appointment booked successfully',appointment:result.rows[0],token,data:{...result.rows[0],token}});
  } catch (error) { await client.query('ROLLBACK').catch(() => {}); console.error('Create appointment error:',error); if (error.code === '23505') return res.status(409).json({success:false,message:'This slot was just booked by another patient.',code:'SLOT_UNAVAILABLE'}); res.status(500).json({success:false,message:'Unable to create appointment'}); } finally { client.release(); }
};
