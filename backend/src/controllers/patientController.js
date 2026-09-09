// src/controllers/patientController.js
const { pool } = require('../config/database');
const Patient = require('../models/Patient');

exports.getPatientProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    
    const result = await pool.query(
      `SELECT u.id, u.name, u.email, u.phone, 
              p.date_of_birth, p.blood_group, p.emergency_contact, p.emergency_contact_name, p.emergency_contact_relationship,
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
    const { name, phone, blood_group, emergency_contact, emergency_contact_name, emergency_contact_relationship } = req.body;
    
    await pool.query(
      'UPDATE users SET name = COALESCE($1, name), phone = COALESCE($2, phone) WHERE id = $3',
      [name, phone, userId]
    );
    
    await pool.query(
      `UPDATE patients 
       SET blood_group = COALESCE($1, blood_group),
           emergency_contact = COALESCE($2, emergency_contact),
           emergency_contact_name = COALESCE($3, emergency_contact_name),
           emergency_contact_relationship = COALESCE($4, emergency_contact_relationship)
       WHERE user_id = $5`,
      [blood_group, emergency_contact, emergency_contact_name, emergency_contact_relationship, userId]
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

const normalizePhone = (value) => String(value || '').replace(/[\s()-]/g, '');
const validPhone = (value) => /^\+?[1-9]\d{7,14}$/.test(value);

exports.getEmergencyContact = async (req, res) => {
  try {
    const result = await pool.query(`SELECT emergency_contact_name AS name, emergency_contact AS phone, emergency_contact_relationship AS relationship FROM patients WHERE user_id = $1`, [req.user.id]);
    if (!result.rows.length) return res.status(404).json({ success: false, message: 'Patient profile not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (_) { res.status(500).json({ success: false, message: 'Server error' }); }
};

exports.updateEmergencyContact = async (req, res) => {
  const name = String(req.body.name || '').trim();
  const phone = normalizePhone(req.body.phone);
  const relationship = String(req.body.relationship || '').trim() || null;
  if (!name) return res.status(400).json({ success: false, message: 'Emergency contact name is required' });
  if (!validPhone(phone)) return res.status(400).json({ success: false, message: 'Enter a valid emergency contact phone number' });
  try {
    const result = await pool.query(`UPDATE patients SET emergency_contact_name=$1, emergency_contact=$2, emergency_contact_relationship=$3, updated_at=CURRENT_TIMESTAMP WHERE user_id=$4 RETURNING emergency_contact_name AS name, emergency_contact AS phone, emergency_contact_relationship AS relationship`, [name, phone, relationship, req.user.id]);
    if (!result.rows.length) return res.status(404).json({ success: false, message: 'Patient profile not found' });
    res.json({ success: true, message: 'Emergency contact updated successfully', data: result.rows[0] });
  } catch (_) { res.status(500).json({ success: false, message: 'Server error' }); }
};
