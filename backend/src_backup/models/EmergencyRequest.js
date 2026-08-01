// src/models/EmergencyRequest.js
const { pool } = require('../config/database');

class EmergencyRequest {
  static async create(emergencyData) {
    const { patient_id, hospital_id, ambulance_id, emergency_type, severity, description, location_lat, location_lng } = emergencyData;
    
    const result = await pool.query(
      `INSERT INTO emergency_requests 
       (patient_id, hospital_id, ambulance_id, emergency_type, severity, description, location_lat, location_lng, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')
       RETURNING *`,
      [patient_id, hospital_id, ambulance_id, emergency_type, severity, description, location_lat, location_lng]
    );
    return result.rows[0];
  }

  static async getNearby(lat, lng, radius) {
    const result = await pool.query(
      `SELECT er.*, u.name as patient_name
       FROM emergency_requests er
       JOIN patients p ON er.patient_id = p.id
       JOIN users u ON p.user_id = u.id
       WHERE er.status IN ('pending', 'assigned')
       AND (6371 * acos(cos(radians($1)) * cos(radians(er.location_lat)) * 
            cos(radians(er.location_lng) - radians($2)) + sin(radians($1)) * sin(radians(er.location_lat)))) < $3
       ORDER BY er.created_at DESC`,
      [lat, lng, radius]
    );
    return result.rows;
  }

  static async updateStatus(emergencyId, status) {
    const result = await pool.query(
      `UPDATE emergency_requests 
       SET status = $1, 
           assigned_at = CASE WHEN $1 = 'assigned' THEN CURRENT_TIMESTAMP ELSE assigned_at END,
           completed_at = CASE WHEN $1 = 'completed' THEN CURRENT_TIMESTAMP ELSE completed_at END
       WHERE id = $2
       RETURNING *`,
      [status, emergencyId]
    );
    return result.rows[0];
  }

  static async getByHospital(hospitalId) {
    const result = await pool.query(
      `SELECT er.*, u.name as patient_name, u.phone as patient_phone
       FROM emergency_requests er
       JOIN patients p ON er.patient_id = p.id
       JOIN users u ON p.user_id = u.id
       WHERE er.hospital_id = $1
       ORDER BY er.created_at DESC
       LIMIT 50`,
      [hospitalId]
    );
    return result.rows;
  }
}

module.exports = EmergencyRequest;