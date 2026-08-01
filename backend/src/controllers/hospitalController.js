// src/controllers/hospitalController.js
const { pool } = require('../config/database');

// src/controllers/hospitalController.js - Update getHospitalProfile

exports.getHospitalProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    console.log('Getting hospital profile for user:', userId);
    
    const result = await pool.query(
      `SELECT h.*, 
        COALESCE(hr.general_beds_total, 0) as general_beds_total,
        COALESCE(hr.general_beds_available, 0) as general_beds_available,
        COALESCE(hr.icu_beds_total, 0) as icu_beds_total,
        COALESCE(hr.icu_beds_available, 0) as icu_beds_available,
        COALESCE(hr.ventilators_total, 0) as ventilators_total,
        COALESCE(hr.ventilators_available, 0) as ventilators_available,
        COALESCE(hr.oxygen_supported_beds_total, 0) as oxygen_beds_total,
        COALESCE(hr.oxygen_supported_beds_available, 0) as oxygen_beds_available,
        hr.updated_at as resources_updated_at
       FROM hospitals h
       LEFT JOIN hospital_resources hr ON h.id = hr.hospital_id
       WHERE h.user_id = $1`,
      [userId]
    );
    
    if (result.rows.length === 0) {
      console.log('No hospital found for user:', userId);
      return res.status(404).json({ 
        success: false, 
        message: 'Hospital not found. Please complete your hospital registration.' 
      });
    }
    
    const hospitalData = result.rows[0];
    const resources = {
      generalBeds: {
        total: hospitalData.general_beds_total || 0,
        available: hospitalData.general_beds_available || 0,
      },
      icuBeds: {
        total: hospitalData.icu_beds_total || 0,
        available: hospitalData.icu_beds_available || 0,
      },
      ventilators: {
        total: hospitalData.ventilators_total || 0,
        available: hospitalData.ventilators_available || 0,
      },
      oxygenBeds: {
        total: hospitalData.oxygen_beds_total || 0,
        available: hospitalData.oxygen_beds_available || 0,
      },
      updated_at: hospitalData.resources_updated_at,
    };
    
    res.json({
      success: true,
      data: {
        id: hospitalData.id,
        name: hospitalData.name,
        address: hospitalData.address,
        phone: hospitalData.phone,
        email: hospitalData.email,
        city: hospitalData.city,
        state: hospitalData.state,
        pincode: hospitalData.pincode,
        is_verified: hospitalData.is_verified,
        registration_number: hospitalData.registration_number,
        resources: resources,
        total_patients: hospitalData.total_patients || 0,
        today_appointments: hospitalData.today_appointments || 0,
      },
    });
  } catch (error) {
    console.error('Get hospital profile error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  }
};

exports.updateResources = async (req, res) => {
  try {
    const userId = req.user.id;
    const resources = req.body;
    
    console.log('Update resources request:', resources);
    
    const hospitalResult = await pool.query(
      'SELECT id FROM hospitals WHERE user_id = $1',
      [userId]
    );
    
    if (hospitalResult.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Hospital not found' 
      });
    }
    
    const hospitalId = hospitalResult.rows[0].id;
    
    const updates = [];
    const values = [];
    let paramIndex = 1;
    
    const fieldMap = {
      'generalBeds_total': 'general_beds_total',
      'generalBeds_available': 'general_beds_available',
      'icuBeds_total': 'icu_beds_total',
      'icuBeds_available': 'icu_beds_available',
      'ventilators_total': 'ventilators_total',
      'ventilators_available': 'ventilators_available',
      'oxygenBeds_total': 'oxygen_supported_beds_total',
      'oxygenBeds_available': 'oxygen_supported_beds_available',
    };
    
    for (const [key, value] of Object.entries(resources)) {
      const dbField = fieldMap[key];
      if (dbField) {
        updates.push(`${dbField} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
      }
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'No valid fields to update' 
      });
    }
    
    values.push(hospitalId);
    
    const query = `
      UPDATE hospital_resources 
      SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE hospital_id = $${paramIndex}
      RETURNING *
    `;
    
    const updateResult = await pool.query(query, values);
    
    if (updateResult.rows.length === 0) {
      const insertResult = await pool.query(
        `INSERT INTO hospital_resources (hospital_id, general_beds_total, general_beds_available, icu_beds_total, icu_beds_available, ventilators_total, ventilators_available, oxygen_supported_beds_total, oxygen_supported_beds_available)
         VALUES ($1, COALESCE($2, 0), COALESCE($3, 0), COALESCE($4, 0), COALESCE($5, 0), COALESCE($6, 0), COALESCE($7, 0), COALESCE($8, 0), COALESCE($9, 0))
         RETURNING *`,
        [hospitalId, 
         resources.generalBeds_total || 0, 
         resources.generalBeds_available || 0,
         resources.icuBeds_total || 0,
         resources.icuBeds_available || 0,
         resources.ventilators_total || 0,
         resources.ventilators_available || 0,
         resources.oxygenBeds_total || 0,
         resources.oxygenBeds_available || 0
        ]
      );
      
      return res.json({
        success: true,
        message: 'Resources created successfully',
        data: insertResult.rows[0],
      });
    }
    
    res.json({
      success: true,
      message: 'Resources updated successfully',
      data: updateResult.rows[0],
    });
  } catch (error) {
    console.error('Update resources error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  }
};

exports.getNearbyHospitals = async (req, res) => {
  try {
    let query = `
      SELECT 
        h.id,
        h.name,
        h.address,
        h.city,
        h.phone,
        h.email,
        h.rating,
        h.is_verified,
        COALESCE(hr.general_beds_total, 0) as total_beds,
        COALESCE(hr.general_beds_available, 0) as available_beds,
        COALESCE(hr.icu_beds_total, 0) as icu_beds,
        COALESCE(hr.icu_beds_available, 0) as available_icu,
        COALESCE(hr.ventilators_total, 0) as ventilator_count,
        COALESCE(hr.ventilators_available, 0) as available_ventilators,
        COALESCE(hr.oxygen_supported_beds_total, 0) as oxygen_beds_total,
        COALESCE(hr.oxygen_supported_beds_available, 0) as oxygen_beds_available,
        COALESCE(hr.updated_at, h.created_at) as last_updated
      FROM hospitals h
      LEFT JOIN hospital_resources hr ON h.id = hr.hospital_id
      WHERE h.is_verified = true
      ORDER BY h.name
      LIMIT 50
    `;
    
    const result = await pool.query(query);
    
    const hospitals = await Promise.all(result.rows.map(async (hospital) => {
      const bloodResult = await pool.query(
        `SELECT COALESCE(SUM(units_available), 0) as total_units
         FROM blood_bank 
         WHERE hospital_id = $1`,
        [hospital.id]
      );
      
      const specialtiesResult = await pool.query(
        `SELECT DISTINCT specialization 
         FROM doctors 
         WHERE hospital_id = $1 AND specialization IS NOT NULL
         LIMIT 3`,
        [hospital.id]
      );
      
      return {
        id: hospital.id,
        name: hospital.name,
        address: hospital.address,
        city: hospital.city,
        phone: hospital.phone,
        email: hospital.email,
        rating: hospital.rating || 4.5,
        is_verified: hospital.is_verified,
        total_beds: hospital.total_beds,
        available_beds: hospital.available_beds,
        icu_beds: hospital.icu_beds,
        available_icu: hospital.available_icu,
        ventilator_count: hospital.ventilator_count,
        available_ventilators: hospital.available_ventilators,
        oxygen_beds_total: hospital.oxygen_beds_total,
        oxygen_beds_available: hospital.oxygen_beds_available,
        blood_units: parseInt(bloodResult.rows[0]?.total_units || 0),
        specialties: specialtiesResult.rows.map(r => r.specialization),
        emergency_services: true,
        distance: '1.2 km',
        last_updated: hospital.last_updated,
      };
    }));
    
    res.json({
      success: true,
      count: hospitals.length,
      data: hospitals,
    });
  } catch (error) {
    console.error('Get nearby hospitals error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  }
};

exports.getAllHospitals = async (req, res) => {
  try {
    const { city, verified } = req.query;
    
    let query = `
      SELECT 
        h.id,
        h.name,
        h.address,
        h.city,
        h.phone,
        h.email,
        h.rating,
        h.is_verified,
        COALESCE(hr.general_beds_total, 0) as total_beds,
        COALESCE(hr.general_beds_available, 0) as available_beds,
        COALESCE(hr.icu_beds_total, 0) as icu_beds,
        COALESCE(hr.icu_beds_available, 0) as available_icu
      FROM hospitals h
      LEFT JOIN hospital_resources hr ON h.id = hr.hospital_id
      WHERE 1=1
    `;
    
    const params = [];
    let paramIndex = 1;
    
    if (city) {
      query += ` AND h.city ILIKE $${paramIndex}`;
      params.push(`%${city}%`);
      paramIndex++;
    }
    
    if (verified === 'true') {
      query += ` AND h.is_verified = true`;
    }
    
    query += ` ORDER BY h.name LIMIT 50`;
    
    const result = await pool.query(query, params);
    res.json({
      success: true,
      count: result.rows.length,
      data: result.rows,
    });
  } catch (error) {
    console.error('Get all hospitals error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  }
};

exports.getHospitalResources = async (req, res) => {
  try {
    const { hospitalId } = req.params;
    
    console.log('Getting resources for hospital:', hospitalId);
    
    const hospitalCheck = await pool.query(
      'SELECT id, name, is_verified FROM hospitals WHERE id = $1',
      [hospitalId]
    );
    
    if (hospitalCheck.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Hospital not found' 
      });
    }
    
    if (!hospitalCheck.rows[0].is_verified) {
      return res.status(403).json({ 
        success: false, 
        message: 'Hospital is not verified' 
      });
    }
    
    const result = await pool.query(
      `SELECT 
        h.id, h.name, h.address, h.phone, h.email,
        COALESCE(hr.general_beds_total, 0) as general_beds_total,
        COALESCE(hr.general_beds_available, 0) as general_beds_available,
        COALESCE(hr.icu_beds_total, 0) as icu_beds_total,
        COALESCE(hr.icu_beds_available, 0) as icu_beds_available,
        COALESCE(hr.ventilators_total, 0) as ventilators_total,
        COALESCE(hr.ventilators_available, 0) as ventilators_available,
        COALESCE(hr.oxygen_supported_beds_total, 0) as oxygen_supported_beds_total,
        COALESCE(hr.oxygen_supported_beds_available, 0) as oxygen_supported_beds_available,
        hr.updated_at as resources_updated_at
       FROM hospitals h
       LEFT JOIN hospital_resources hr ON h.id = hr.hospital_id
       WHERE h.id = $1`,
      [hospitalId]
    );
    
    if (result.rows.length === 0) {
      return res.json({
        success: true,
        data: {
          id: hospitalCheck.rows[0].id,
          name: hospitalCheck.rows[0].name,
          general_beds_total: 0,
          general_beds_available: 0,
          icu_beds_total: 0,
          icu_beds_available: 0,
          ventilators_total: 0,
          ventilators_available: 0,
          oxygen_supported_beds_total: 0,
          oxygen_supported_beds_available: 0,
        }
      });
    }
    
    const data = result.rows[0];
    res.json({
      success: true,
      data: {
        id: data.id,
        name: data.name,
        address: data.address,
        phone: data.phone,
        email: data.email,
        general_beds_total: data.general_beds_total || 0,
        general_beds_available: data.general_beds_available || 0,
        icu_beds_total: data.icu_beds_total || 0,
        icu_beds_available: data.icu_beds_available || 0,
        ventilators_total: data.ventilators_total || 0,
        ventilators_available: data.ventilators_available || 0,
        oxygen_supported_beds_total: data.oxygen_supported_beds_total || 0,
        oxygen_supported_beds_available: data.oxygen_supported_beds_available || 0,
        last_updated: data.resources_updated_at,
      },
    });
  } catch (error) {
    console.error('Get hospital resources error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  }
};

// src/controllers/hospitalController.js - Add these methods at the end

// Get all hospital staff
// src/controllers/hospitalController.js - Update getHospitalStaff

// src/controllers/hospitalController.js - Add this method if missing

exports.getHospitalStaff = async (req, res) => {
  try {
    const userId = req.user.id;
    
    const hospitalResult = await pool.query(
      'SELECT id FROM hospitals WHERE user_id = $1',
      [userId]
    );
    
    if (hospitalResult.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Hospital not found' 
      });
    }
    
    const hospitalId = hospitalResult.rows[0].id;
    
    const result = await pool.query(
      `SELECT id, name, specialization as designation, 
              qualification, experience_years, 
              email, phone, availability_status as is_available
       FROM doctors 
       WHERE hospital_id = $1 
       ORDER BY name`,
      [hospitalId]
    );
    
    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error('Get hospital staff error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  }
};

// Add hospital staff
exports.addHospitalStaff = async (req, res) => {
  try {
    const userId = req.user.id;
    const { 
      name, 
      designation, 
      department, 
      qualification, 
      experience_years, 
      email, 
      phone, 
      is_available 
    } = req.body;
    
    console.log('Adding staff:', { name, designation, department, qualification, experience_years, email, phone });
    
    const hospitalResult = await pool.query(
      'SELECT id FROM hospitals WHERE user_id = $1',
      [userId]
    );
    
    if (hospitalResult.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Hospital not found' 
      });
    }
    
    const hospitalId = hospitalResult.rows[0].id;
    
    // Use the actual column names from your doctors table
    // specialization = designation (stored in the database as specialization)
    const result = await pool.query(
  `INSERT INTO doctors (
    hospital_id, name, specialization, department, qualification, 
    experience_years, email, phone, availability_status
  ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
  RETURNING *`,
  [
    hospitalId, 
    name, 
    designation || 'Doctor',
    department || 'General',
    qualification || '', 
    parseInt(experience_years) || 0, 
    email || '', 
    phone || '',
    is_available !== false
  ]
);
    
    console.log('Staff added:', result.rows[0]);
    
    res.status(201).json({
      success: true,
      message: 'Staff added successfully',
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Add staff error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  }
};
// Update hospital staff
exports.updateHospitalStaff = async (req, res) => {
  try {
    const userId = req.user.id;
    const { staffId } = req.params;
    const { designation, department, qualification, experience_years, phone, is_available } = req.body;
    
    const hospitalResult = await pool.query(
      'SELECT id FROM hospitals WHERE user_id = $1',
      [userId]
    );
    
    if (hospitalResult.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Hospital not found' 
      });
    }
    
    const hospitalId = hospitalResult.rows[0].id;
    
    // Since the table has specialization but not designation,
    // we store designation in specialization column
    const result = await pool.query(
      `UPDATE doctors 
       SET specialization = COALESCE($1, specialization),
           qualification = COALESCE($2, qualification),
           experience_years = COALESCE($3, experience_years),
           phone = COALESCE($4, phone),
           availability_status = COALESCE($5, availability_status)
       WHERE id = $6 AND hospital_id = $7
       RETURNING *`,
      [designation, qualification, experience_years, phone, is_available, staffId, hospitalId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Staff not found' 
      });
    }
    
    res.json({
      success: true,
      message: 'Staff updated successfully',
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Update staff error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  }
};

// Delete hospital staff
exports.deleteHospitalStaff = async (req, res) => {
  try {
    const userId = req.user.id;
    const { staffId } = req.params;
    
    const hospitalResult = await pool.query(
      'SELECT id FROM hospitals WHERE user_id = $1',
      [userId]
    );
    
    if (hospitalResult.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Hospital not found' 
      });
    }
    
    const hospitalId = hospitalResult.rows[0].id;
    
    const result = await pool.query(
      'DELETE FROM doctors WHERE id = $1 AND hospital_id = $2 RETURNING *',
      [staffId, hospitalId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Staff not found' 
      });
    }
    
    res.json({
      success: true,
      message: 'Staff removed successfully',
    });
  } catch (error) {
    console.error('Delete staff error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  }
};
// src/controllers/hospitalController.js - Add this method

// Get hospital doctors
exports.getHospitalDoctors = async (req, res) => {
  try {
    const { hospitalId } = req.params;
    
    const result = await pool.query(
      `SELECT id, name, specialization as designation, 
              qualification, experience_years, 
              availability_status as is_available,
              phone, email
       FROM doctors 
       WHERE hospital_id = $1 AND availability_status = true
       ORDER BY name`,
      [hospitalId]
    );
    
    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error('Get hospital doctors error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  }
};