// src/controllers/emergencyController.js
const { pool } = require('../config/database');

exports.createEmergencyRequest = async (req, res) => {
  try {
    const userId = req.user.id;
    const { emergency_type, severity, description, location_lat, location_lng } = req.body;
    
    const patientResult = await pool.query(
      'SELECT id FROM patients WHERE user_id = $1',
      [userId]
    );
    
    if (patientResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Patient not found' });
    }
    
    const patientId = patientResult.rows[0].id;
    
    const result = await pool.query(
      `INSERT INTO emergency_requests 
       (patient_id, emergency_type, severity, description, location_lat, location_lng, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending')
       RETURNING *`,
      [patientId, emergency_type, severity, description, location_lat, location_lng]
    );
    
    res.status(201).json({
      success: true,
      message: 'Emergency request created',
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Create emergency error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

exports.getNearbyEmergencies = async (req, res) => {
  try {
    const { lat, lng, radius = 5 } = req.query;
    
    const result = await pool.query(
      `SELECT er.*, u.name as patient_name
       FROM emergency_requests er
       JOIN patients p ON er.patient_id = p.id
       JOIN users u ON p.user_id = u.id
       WHERE er.status IN ('pending', 'assigned')
       ORDER BY er.created_at DESC
       LIMIT 20`,
      []
    );
    
    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error('Get nearby emergencies error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

exports.getHospitalEmergencies = async (req, res) => {
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
      `SELECT er.*, u.name as patient_name, u.phone as patient_phone
       FROM emergency_requests er
       JOIN patients p ON er.patient_id = p.id
       JOIN users u ON p.user_id = u.id
       WHERE er.hospital_id = $1 OR er.hospital_id IS NULL
       ORDER BY er.created_at DESC
       LIMIT 50`,
      [hospitalId]
    );
    
    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error('Get hospital emergencies error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

exports.updateEmergencyStatus = async (req, res) => {
  try {
    const { emergencyId } = req.params;
    const { status } = req.body;
    
    const result = await pool.query(
      `UPDATE emergency_requests 
       SET status = $1, 
           assigned_at = CASE WHEN $1 = 'assigned' THEN CURRENT_TIMESTAMP ELSE assigned_at END,
           completed_at = CASE WHEN $1 = 'completed' THEN CURRENT_TIMESTAMP ELSE completed_at END
       WHERE id = $2
       RETURNING *`,
      [status, emergencyId]
    );
    
    res.json({
      success: true,
      message: 'Emergency status updated',
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Update emergency status error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};