// src/models/Appointment.js
const { pool } = require('../config/database');

class Appointment {
  static async create(appointmentData) {
    const { patient_id, hospital_id, doctor_id, appointment_date, appointment_time, symptoms } = appointmentData;
    
    const result = await pool.query(
      `INSERT INTO appointments (patient_id, hospital_id, doctor_id, appointment_date, appointment_time, symptoms, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending')
       RETURNING *`,
      [patient_id, hospital_id, doctor_id, appointment_date, appointment_time, symptoms]
    );
    return result.rows[0];
  }

  static async getByPatient(patientId) {
    const result = await pool.query(
      `SELECT a.*, h.name as hospital_name, d.name as doctor_name, d.specialization
       FROM appointments a
       JOIN hospitals h ON a.hospital_id = h.id
       LEFT JOIN doctors d ON a.doctor_id = d.id
       WHERE a.patient_id = $1
       ORDER BY a.appointment_date DESC, a.appointment_time DESC`,
      [patientId]
    );
    return result.rows;
  }

  static async getByHospital(hospitalId) {
    const result = await pool.query(
      `SELECT a.*, p.user_id, u.name as patient_name, d.name as doctor_name
       FROM appointments a
       JOIN patients p ON a.patient_id = p.id
       JOIN users u ON p.user_id = u.id
       LEFT JOIN doctors d ON a.doctor_id = d.id
       WHERE a.hospital_id = $1
       ORDER BY a.appointment_date DESC, a.appointment_time DESC`,
      [hospitalId]
    );
    return result.rows;
  }

  static async updateStatus(appointmentId, status) {
    const result = await pool.query(
      `UPDATE appointments 
       SET status = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING *`,
      [status, appointmentId]
    );
    return result.rows[0];
  }

  static async cancel(appointmentId) {
    await pool.query(
      `UPDATE appointments 
       SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [appointmentId]
    );
    return true;
  }
}

module.exports = Appointment;