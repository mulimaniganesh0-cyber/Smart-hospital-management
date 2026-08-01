// src/models/BloodBank.js
const { pool } = require('../config/database');

class BloodBank {
  static async updateBloodStock(hospitalId, bloodGroup, units) {
    const result = await pool.query(
      `INSERT INTO blood_bank (hospital_id, blood_group, units_available, last_updated)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
       ON CONFLICT (hospital_id, blood_group) 
       DO UPDATE SET units_available = EXCLUDED.units_available, last_updated = CURRENT_TIMESTAMP
       RETURNING *`,
      [hospitalId, bloodGroup, units]
    );
    return result.rows[0];
  }

  static async getBloodAvailability(hospitalId) {
    const result = await pool.query(
      `SELECT blood_group, units_available, minimum_threshold 
       FROM blood_bank 
       WHERE hospital_id = $1
       ORDER BY blood_group`,
      [hospitalId]
    );
    return result.rows;
  }

  static async getAllBloodBanks(city = null) {
    let query = `
      SELECT bb.*, h.name as hospital_name, h.address, h.city, h.phone, h.latitude, h.longitude
      FROM blood_bank bb
      JOIN hospitals h ON bb.hospital_id = h.id
      WHERE h.is_verified = true
    `;
    const params = [];
    
    if (city) {
      query += ` AND h.city ILIKE $1`;
      params.push(`%${city}%`);
    }
    
    query += ` ORDER BY h.name`;
    
    const result = await pool.query(query, params);
    return result.rows;
  }

  static async createBloodRequest(patientId, hospitalId, bloodGroup, unitsRequired) {
    const result = await pool.query(
      `INSERT INTO blood_requests (patient_id, hospital_id, blood_group, units_required, status)
       VALUES ($1, $2, $3, $4, 'pending')
       RETURNING *`,
      [patientId, hospitalId, bloodGroup, unitsRequired]
    );
    return result.rows[0];
  }

  static async fulfillBloodRequest(requestId, hospitalId, bloodGroup, units) {
    // Start transaction
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // Update blood bank stock
      await client.query(
        `UPDATE blood_bank 
         SET units_available = units_available - $1, last_updated = CURRENT_TIMESTAMP
         WHERE hospital_id = $2 AND blood_group = $3`,
        [units, hospitalId, bloodGroup]
      );
      
      // Update request status
      const result = await client.query(
        `UPDATE blood_requests 
         SET status = 'fulfilled', fulfilled_date = CURRENT_TIMESTAMP
         WHERE id = $1
         RETURNING *`,
        [requestId]
      );
      
      await client.query('COMMIT');
      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

module.exports = BloodBank;