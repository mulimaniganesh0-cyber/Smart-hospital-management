// src/controllers/appointmentController.js
const { pool } = require('../config/database');

exports.createAppointment = async (req, res) => {
  try {
    const userId = req.user.id;
    const { hospital_id, doctor_id, appointment_date, appointment_time, symptoms } = req.body;
    
    // Get patient id
    const patientResult = await pool.query(
      'SELECT id FROM patients WHERE user_id = $1',
      [userId]
    );
    
    if (patientResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Patient not found' });
    }
    
    const patientId = patientResult.rows[0].id;
    
    const result = await pool.query(
      `INSERT INTO appointments (patient_id, hospital_id, doctor_id, appointment_date, appointment_time, symptoms, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending')
       RETURNING *`,
      [patientId, hospital_id, doctor_id, appointment_date, appointment_time, symptoms]
    );
    
    res.status(201).json({
      success: true,
      message: 'Appointment created successfully',
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Create appointment error:', error);
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
    
    const result = await pool.query(
      `UPDATE appointments 
       SET status = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING *`,
      [status, appointmentId]
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
       WHERE id = $1
       RETURNING *`,
      [appointmentId]
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