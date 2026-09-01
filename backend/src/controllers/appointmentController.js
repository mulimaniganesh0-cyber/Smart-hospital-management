// src/controllers/appointmentController.js
const { pool } = require('../config/database');

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const timePattern = /^\d{2}:\d{2}(:\d{2})?$/;

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

exports.createAppointment = async (req, res) => {
  try {
    const userId = req.user.id;
    const { hospital_id, doctor_id, appointment_date, appointment_time, symptoms } = req.body;
    const hospitalId = Number(hospital_id);
    const doctorId = Number(doctor_id);

    if (!Number.isInteger(hospitalId) || !Number.isInteger(doctorId) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(String(appointment_date || '')) ||
        !/^\d{2}:\d{2}(:\d{2})?$/.test(String(appointment_time || ''))) {
      return res.status(400).json({ success: false, message: 'Select a hospital, an available doctor, and a valid appointment date and time' });
    }
    if (new Date(`${appointment_date}T00:00:00`) < new Date(new Date().toDateString())) {
      return res.status(400).json({ success: false, message: 'Appointment date cannot be in the past' });
    }
    
    // Get patient id
    const patientResult = await pool.query(
      'SELECT id FROM patients WHERE user_id = $1',
      [userId]
    );
    
    if (patientResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Patient not found' });
    }
    
    const patientId = patientResult.rows[0].id;

    const doctorResult = await pool.query(`
      SELECT d.id FROM doctors d
      JOIN hospitals h ON h.id = d.hospital_id
      WHERE d.id = $1 AND d.hospital_id = $2 AND d.availability_status = true
        AND COALESCE(d.is_active, true) = true
        AND (h.is_verified = true OR h.directory_visible = true)`,
      [doctorId, hospitalId]
    );
    if (doctorResult.rows.length === 0) {
      return res.status(400).json({ success: false, message: 'The selected doctor is not available at this hospital' });
    }

    const slotResult = await pool.query(`SELECT id FROM doctor_available_slots
      WHERE doctor_id=$1 AND slot_date=$2 AND slot_time=$3 AND is_available=true`,
      [doctorId, appointment_date, appointment_time]);
    if (!slotResult.rowCount) {
      return res.status(400).json({ success: false, message: 'That appointment time is not currently offered by the doctor' });
    }

    const duplicate = await pool.query(`
      SELECT id FROM appointments WHERE patient_id=$1 AND doctor_id=$2 AND appointment_date=$3 AND appointment_time=$4
        AND status NOT IN ('cancelled','rejected') LIMIT 1`,
      [patientId, doctorId, appointment_date, appointment_time]
    );
    if (duplicate.rows.length) {
      return res.status(409).json({ success: false, message: 'You already have an appointment with this doctor at the selected time' });
    }
    
    const result = await pool.query(
      `INSERT INTO appointments (patient_id, hospital_id, doctor_id, appointment_date, appointment_time, symptoms, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending')
       RETURNING *`,
      [patientId, hospitalId, doctorId, appointment_date, appointment_time, symptoms?.trim() || null]
    );
    
    res.status(201).json({
      success: true,
      message: 'Appointment created successfully',
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Create appointment error:', error);
    if (error.code === '23505') return res.status(409).json({ success: false, message: 'That appointment time has just been booked' });
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

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
    const slots = await pool.query(`SELECT s.slot_date, s.slot_time
      FROM doctor_available_slots s
      WHERE s.doctor_id=$1 AND s.slot_date=$2 AND s.is_available=true
        AND NOT EXISTS (SELECT 1 FROM appointments a WHERE a.doctor_id=s.doctor_id
          AND a.appointment_date=s.slot_date AND a.appointment_time=s.slot_time
          AND a.status NOT IN ('cancelled', 'rejected', 'completed'))
      ORDER BY s.slot_time`, [appointment.doctor_id, date]);
    res.json({ success: true, data: slots.rows.map((slot) => ({ date: String(slot.slot_date).slice(0, 10), time: String(slot.slot_time).slice(0, 5) })) });
  } catch (error) {
    console.error('Get available slots error:', error);
    res.status(500).json({ success: false, message: 'Unable to load available slots' });
  }
};

exports.rescheduleAppointment = async (req, res) => {
  const client = await pool.connect();
  try {
    const appointmentId = Number(req.params.appointmentId);
    const { date, time } = req.body;
    if (!Number.isInteger(appointmentId) || !datePattern.test(String(date)) || !timePattern.test(String(time))) {
      return res.status(400).json({ success: false, message: 'A valid date and time are required' });
    }
    await client.query('BEGIN');
    const owned = await client.query(`SELECT a.* FROM appointments a JOIN patients p ON p.id=a.patient_id
      WHERE a.id=$1 AND p.user_id=$2 FOR UPDATE`, [appointmentId, req.user.id]);
    const appointment = owned.rows[0];
    if (!appointment) { await client.query('ROLLBACK'); return res.status(404).json({ success: false, message: 'Appointment not found' }); }
    if (!reschedulable(appointment)) { await client.query('ROLLBACK'); return res.status(400).json({ success: false, message: 'This appointment can no longer be rescheduled' }); }
    const slot = await client.query(`SELECT id FROM doctor_available_slots WHERE doctor_id=$1 AND slot_date=$2 AND slot_time=$3 AND is_available=true FOR UPDATE`, [appointment.doctor_id, date, time]);
    if (!slot.rowCount) { await client.query('ROLLBACK'); return res.status(409).json({ success: false, message: 'That time is no longer available' }); }
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
