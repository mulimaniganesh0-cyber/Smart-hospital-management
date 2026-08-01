// src/models/ResourceRequest.js
const { pool } = require('../config/database');

class ResourceRequest {
  static async create(requestData) {
    const { patient_id, hospital_id, resource_type, units_requested, urgency, notes } = requestData;
    
    const result = await pool.query(
      `INSERT INTO resource_requests 
       (patient_id, hospital_id, resource_type, units_requested, urgency, notes, status, request_date)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending', CURRENT_TIMESTAMP)
       RETURNING *`,
      [patient_id, hospital_id, resource_type, units_requested, urgency, notes]
    );
    return result.rows[0];
  }

  static async getByPatient(patientId) {
    const result = await pool.query(
      `SELECT rr.*, h.name as hospital_name, h.address as hospital_address, h.phone as hospital_phone
       FROM resource_requests rr
       JOIN hospitals h ON rr.hospital_id = h.id
       WHERE rr.patient_id = $1
       ORDER BY rr.request_date DESC`,
      [patientId]
    );
    return result.rows;
  }

  static async getByHospital(hospitalId) {
    const result = await pool.query(
      `SELECT rr.*, u.name as patient_name, u.phone as patient_phone
       FROM resource_requests rr
       JOIN patients p ON rr.patient_id = p.id
       JOIN users u ON p.user_id = u.id
       WHERE rr.hospital_id = $1
       ORDER BY rr.request_date DESC`,
      [hospitalId]
    );
    return result.rows;
  }

  static async updateStatus(requestId, status, responseNotes) {
    const result = await pool.query(
      `UPDATE resource_requests 
       SET status = $1, 
           response_notes = $2,
           responded_at = CURRENT_TIMESTAMP
       WHERE id = $3
       RETURNING *`,
      [status, responseNotes, requestId]
    );
    return result.rows[0];
  }
}

module.exports = ResourceRequest;