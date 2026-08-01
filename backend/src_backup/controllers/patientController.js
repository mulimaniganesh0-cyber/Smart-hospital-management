// src/controllers/patientController.js
const { pool } = require('../config/database');
const Patient = require('../models/Patient');

exports.getPatientProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    
    const result = await pool.query(
      `SELECT u.id, u.name, u.email, u.phone, 
              p.date_of_birth, p.blood_group, p.emergency_contact, p.emergency_contact_name,
              p.allergies, p.chronic_conditions
       FROM users u
       LEFT JOIN patients p ON u.id = p.user_id
       WHERE u.id = $1`,
      [userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Patient not found' });
    }
    
    res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Get patient profile error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

exports.updatePatientProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const { name, phone, blood_group, emergency_contact } = req.body;
    
    await pool.query(
      'UPDATE users SET name = COALESCE($1, name), phone = COALESCE($2, phone) WHERE id = $3',
      [name, phone, userId]
    );
    
    await pool.query(
      `UPDATE patients 
       SET blood_group = COALESCE($1, blood_group),
           emergency_contact = COALESCE($2, emergency_contact)
       WHERE user_id = $3`,
      [blood_group, emergency_contact, userId]
    );
    
    res.json({
      success: true,
      message: 'Profile updated successfully',
    });
  } catch (error) {
    console.error('Update patient profile error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

exports.getMedicalHistory = async (req, res) => {
  try {
    const userId = req.user.id;
    
    const result = await pool.query(
      `SELECT a.*, h.name as hospital_name, d.name as doctor_name
       FROM appointments a
       JOIN hospitals h ON a.hospital_id = h.id
       LEFT JOIN doctors d ON a.doctor_id = d.id
       JOIN patients p ON a.patient_id = p.id
       WHERE p.user_id = $1
       ORDER BY a.appointment_date DESC`,
      [userId]
    );
    
    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error('Get medical history error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};