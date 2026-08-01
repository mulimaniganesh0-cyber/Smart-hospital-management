// src/models/Doctor.js - Create this file
const { pool } = require('../config/database');

class Doctor {
  static async create(doctorData) {
    const { 
      hospital_id, name, designation, department, 
      qualification, experience_years, email, phone, 
      is_available 
    } = doctorData;
    
    const result = await pool.query(
      `INSERT INTO doctors (
        hospital_id, name, designation, department, 
        qualification, experience_years, email, phone, 
        availability_status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`,
      [hospital_id, name, designation, department, qualification, experience_years, email, phone, is_available]
    );
    return result.rows[0];
  }

  static async findById(id) {
    const result = await pool.query(
      'SELECT * FROM doctors WHERE id = $1',
      [id]
    );
    return result.rows[0];
  }

  static async findByHospital(hospitalId) {
    const result = await pool.query(
      'SELECT * FROM doctors WHERE hospital_id = $1 ORDER BY name',
      [hospitalId]
    );
    return result.rows;
  }

  static async update(id, updates) {
    const fields = Object.keys(updates);
    const values = Object.values(updates);
    const setClause = fields.map((field, i) => `${field} = $${i + 2}`).join(', ');
    
    const result = await pool.query(
      `UPDATE doctors SET ${setClause}, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 RETURNING *`,
      [id, ...values]
    );
    return result.rows[0];
  }

  static async delete(id) {
    await pool.query('DELETE FROM doctors WHERE id = $1', [id]);
    return true;
  }
}

module.exports = Doctor;