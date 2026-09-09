// src/models/Patient.js
const { pool } = require('../config/database');

class Patient {
  static async create(patientData) {
    const { user_id, date_of_birth, blood_group, emergency_contact, emergency_contact_name, emergency_contact_relationship } = patientData;
    
    const result = await pool.query(
      `INSERT INTO patients (user_id, date_of_birth, blood_group, emergency_contact, emergency_contact_name, emergency_contact_relationship)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [user_id, date_of_birth, blood_group, emergency_contact, emergency_contact_name, emergency_contact_relationship]
    );
    return result.rows[0];
  }

  static async findByUserId(userId) {
    const result = await pool.query(
      `SELECT p.*, u.name, u.email, u.phone 
       FROM patients p
       JOIN users u ON p.user_id = u.id
       WHERE p.user_id = $1`,
      [userId]
    );
    return result.rows[0];
  }

  static async update(userId, updates) {
    const fields = Object.keys(updates);
    const values = Object.values(updates);
    const setClause = fields.map((field, i) => `${field} = $${i + 2}`).join(', ');
    
    const result = await pool.query(
      `UPDATE patients SET ${setClause}, updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $1 RETURNING *`,
      [userId, ...values]
    );
    return result.rows[0];
  }

  static async getMedicalHistory(userId) {
    const appointments = await pool.query(
      `SELECT a.*, h.name as hospital_name, d.name as doctor_name
       FROM appointments a
       JOIN hospitals h ON a.hospital_id = h.id
       LEFT JOIN doctors d ON a.doctor_id = d.id
       JOIN patients p ON a.patient_id = p.id
       WHERE p.user_id = $1
       ORDER BY a.appointment_date DESC`,
      [userId]
    );
    return appointments.rows;
  }
}

module.exports = Patient;
