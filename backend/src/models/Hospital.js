// src/models/Hospital.js
const { pool } = require('../config/database');

class Hospital {
  static async create(hospitalData) {
    const { user_id, name, registration_number, address, city, state, pincode, phone, email, latitude, longitude } = hospitalData;
    
    // Generate a unique registration number
    let regNumber = registration_number;
    
    // If no registration number provided or it's a default value, generate one
    if (!regNumber || regNumber === '123' || regNumber === `REG${Date.now()}` || regNumber === 'REG' + Date.now()) {
      const timestamp = Date.now();
      const namePrefix = name.substring(0, 3).toUpperCase();
      regNumber = `HOSP${namePrefix}${timestamp.toString().slice(-6)}`;
    }
    
    // Check if registration number already exists and generate a new one if it does
    let isUnique = false;
    let attempts = 0;
    let finalRegNumber = regNumber;
    
    while (!isUnique && attempts < 5) {
      const checkResult = await pool.query(
        'SELECT id FROM hospitals WHERE registration_number = $1',
        [finalRegNumber]
      );
      
      if (checkResult.rows.length === 0) {
        isUnique = true;
      } else {
        // Generate a new one with a random suffix
        const randomSuffix = Math.floor(1000 + Math.random() * 9000);
        finalRegNumber = `${regNumber}${randomSuffix}`;
        attempts++;
      }
    }
    
    // If still not unique after 5 attempts, use timestamp with random
    if (!isUnique) {
      finalRegNumber = `HOSP${Date.now()}${Math.floor(1000 + Math.random() * 9000)}`;
    }
    
    console.log(`Creating hospital with registration number: ${finalRegNumber}`);
    
    const result = await pool.query(
      `INSERT INTO hospitals (user_id, name, registration_number, address, city, state, pincode, phone, email, latitude, longitude, verification_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [user_id, name, finalRegNumber, address, city, state, pincode, phone, email, latitude, longitude, 'pending']
    );
    
    // Initialize resources
    await pool.query(
      `INSERT INTO hospital_resources (hospital_id, general_beds_total, general_beds_available, icu_beds_total, icu_beds_available, ventilators_total, ventilators_available, oxygen_supported_beds_total, oxygen_supported_beds_available)
       VALUES ($1, 200, 200, 20, 20, 30, 30, 10, 10)`,
      [result.rows[0].id]
    );
    
    return result.rows[0];
  }

  static async findByUserId(userId) {
    const result = await pool.query(
      `SELECT h.*, 
        COALESCE(hr.general_beds_total, 0) as general_beds_total,
        COALESCE(hr.general_beds_available, 0) as general_beds_available,
        COALESCE(hr.icu_beds_total, 0) as icu_beds_total,
        COALESCE(hr.icu_beds_available, 0) as icu_beds_available,
        COALESCE(hr.ventilators_total, 0) as ventilators_total,
        COALESCE(hr.ventilators_available, 0) as ventilators_available,
        COALESCE(hr.oxygen_supported_beds_total, 0) as oxygen_supported_beds_total,
        COALESCE(hr.oxygen_supported_beds_available, 0) as oxygen_supported_beds_available,
        (SELECT json_agg(json_build_object('blood_group', blood_group, 'units_available', units_available))
         FROM blood_bank WHERE hospital_id = h.id) as blood_bank
       FROM hospitals h
       LEFT JOIN hospital_resources hr ON h.id = hr.hospital_id
       WHERE h.user_id = $1`,
      [userId]
    );
    return result.rows[0];
  }

  static async findById(id) {
    const result = await pool.query(
      `SELECT h.*, 
        COALESCE(hr.general_beds_total, 0) as general_beds_total,
        COALESCE(hr.general_beds_available, 0) as general_beds_available,
        COALESCE(hr.icu_beds_total, 0) as icu_beds_total,
        COALESCE(hr.icu_beds_available, 0) as icu_beds_available,
        COALESCE(hr.ventilators_total, 0) as ventilators_total,
        COALESCE(hr.ventilators_available, 0) as ventilators_available,
        COALESCE(hr.oxygen_supported_beds_total, 0) as oxygen_supported_beds_total,
        COALESCE(hr.oxygen_supported_beds_available, 0) as oxygen_supported_beds_available,
        (SELECT json_agg(json_build_object('blood_group', blood_group, 'units_available', units_available))
         FROM blood_bank WHERE hospital_id = h.id) as blood_bank
       FROM hospitals h
       LEFT JOIN hospital_resources hr ON h.id = hr.hospital_id
       WHERE h.id = $1`,
      [id]
    );
    return result.rows[0];
  }

  static async updateResources(hospitalId, resources) {
    const result = await pool.query(
      `UPDATE hospital_resources 
       SET general_beds_available = COALESCE($1, general_beds_available),
           icu_beds_available = COALESCE($2, icu_beds_available),
           ventilators_available = COALESCE($3, ventilators_available),
           oxygen_supported_beds_available = COALESCE($4, oxygen_supported_beds_available),
           updated_at = CURRENT_TIMESTAMP
       WHERE hospital_id = $5
       RETURNING *`,
      [
        resources.general_beds_available,
        resources.icu_beds_available,
        resources.ventilators_available,
        resources.oxygen_supported_beds_available,
        hospitalId
      ]
    );
    return result.rows[0];
  }

  static async verifyHospital(id, adminNotes = null) {
    const result = await pool.query(
      `UPDATE hospitals 
       SET is_verified = true, 
           verification_status = 'verified', 
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [id]
    );
    return result.rows[0];
  }

  static async getNearbyHospitals(lat, lng, radius = 10) {
    const query = `
      SELECT h.*, 
        COALESCE(hr.general_beds_available, 0) as available_beds,
        COALESCE(hr.icu_beds_available, 0) as available_icu,
        COALESCE(hr.ventilators_available, 0) as available_ventilators,
        (6371 * acos(cos(radians($1)) * cos(radians(h.latitude)) * 
        cos(radians(h.longitude) - radians($2)) + sin(radians($1)) * sin(radians(h.latitude)))) 
        AS distance
      FROM hospitals h
      LEFT JOIN hospital_resources hr ON h.id = hr.hospital_id
      WHERE h.is_verified = true
        AND h.latitude IS NOT NULL
        AND h.longitude IS NOT NULL
      HAVING distance < $3
      ORDER BY distance
      LIMIT 20
    `;
    
    const result = await pool.query(query, [lat, lng, radius]);
    return result.rows;
  }

  static async delete(id) {
    const result = await pool.query(
      'DELETE FROM hospitals WHERE id = $1 RETURNING *',
      [id]
    );
    return result.rows[0];
  }
}

module.exports = Hospital;