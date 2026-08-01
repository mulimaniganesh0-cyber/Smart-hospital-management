// src/models/Ambulance.js
const { pool } = require('../config/database');

class Ambulance {
  static async create(ambulanceData) {
    const { hospital_id, vehicle_number, driver_name, driver_phone, type } = ambulanceData;
    
    const result = await pool.query(
      `INSERT INTO ambulances (hospital_id, vehicle_number, driver_name, driver_phone, type, is_available)
       VALUES ($1, $2, $3, $4, $5, true)
       RETURNING *`,
      [hospital_id, vehicle_number, driver_name, driver_phone, type]
    );
    return result.rows[0];
  }

  static async getNearby(lat, lng, radius) {


    const result = await pool.query(
      `SELECT a.*, h.name as hospital_name, h.phone as hospital_phone
       FROM ambulances a
       JOIN hospitals h ON a.hospital_id = h.id
       WHERE a.is_available = true
       AND (6371 * acos(cos(radians($1)) * cos(radians(a.current_location_lat)) * 
            cos(radians(a.current_location_lng) - radians($2)) + sin(radians($1)) * sin(radians(a.current_location_lat)))) < $3
       ORDER BY distance ASC`,
      [lat, lng, radius]
    );
    return result.rows;
  }

  static async findNearest(lat, lng) {
    const result = await pool.query(
      `SELECT a.*, 
        (6371 * acos(cos(radians($1)) * cos(radians(a.current_location_lat)) * 
        cos(radians(a.current_location_lng) - radians($2)) + sin(radians($1)) * sin(radians(a.current_location_lat)))) 
        as distance
       FROM ambulances a
       WHERE a.is_available = true
       ORDER BY distance ASC
       LIMIT 1`,
      [lat, lng]
    );
    return result.rows[0];
  }

  static async updateLocation(ambulanceId, lat, lng) {
    const result = await pool.query(
      `UPDATE ambulances 
       SET current_location_lat = $1, current_location_lng = $2
       WHERE id = $3
       RETURNING *`,
      [lat, lng, ambulanceId]
    );
    return result.rows[0];
  }

  static async updateAvailability(ambulanceId, isAvailable) {
    const result = await pool.query(
      `UPDATE ambulances 
       SET is_available = $1
       WHERE id = $2
       RETURNING *`,
      [isAvailable, ambulanceId]
    );
    return result.rows[0];
  }

  static async assignToEmergency(ambulanceId, emergencyId) {
    await pool.query(
      `UPDATE ambulances 
       SET is_available = false
       WHERE id = $1`,
      [ambulanceId]
    );
    
    await pool.query(
      `UPDATE emergency_requests 
       SET ambulance_id = $1, status = 'assigned', assigned_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [ambulanceId, emergencyId]
    );
  }
}

module.exports = Ambulance;