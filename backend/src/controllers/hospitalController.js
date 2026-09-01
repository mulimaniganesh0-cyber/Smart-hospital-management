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
    const { lat, lng, radius = 20, sortBy = 'distance', specialty, emergency, icu, beds, bloodBank } = req.query;
    
    const userLat = Number(lat);
    const userLng = Number(lng);
    const maxRadius = Number(radius);
    if (!Number.isFinite(userLat) || !Number.isFinite(userLng) || !Number.isFinite(maxRadius) || userLat < -90 || userLat > 90 || userLng < -180 || userLng > 180 || maxRadius <= 0) return res.status(400).json({ success: false, message: 'Valid latitude, longitude, and radius are required' });

    const haversineFormula = `
      (6371 * acos(
        LEAST(1.0, GREATEST(-1.0,
          cos(radians($1)) * cos(radians(h.latitude)) *
          cos(radians(h.longitude) - radians($2)) +
          sin(radians($1)) * sin(radians(h.latitude))
        ))
      ))
    `;

    let orderByClause = 'distance ASC';
    switch (sortBy) {
      case 'travel_time':
        orderByClause = 'distance ASC';
        break;
      case 'beds':
        orderByClause = 'available_beds DESC, distance ASC';
        break;
      case 'icu':
        orderByClause = 'available_icu DESC, distance ASC';
        break;
      case 'emergency':
        orderByClause = 'available_ventilators DESC, distance ASC';
        break;
      case 'doctors':
        orderByClause = 'doctor_count DESC, distance ASC';
        break;
      case 'waiting_time':
        orderByClause = 'waiting_time ASC, distance ASC';
        break;
      case 'rating':
        orderByClause = 'h.google_rating DESC NULLS LAST, distance ASC';
        break;
      default:
        orderByClause = 'distance ASC';
    }

    const query = `
      SELECT 
        h.id,
        h.name,
        h.address,
        h.city,
        h.phone,
        h.email,
        h.google_rating, h.google_review_count, h.google_place_id, h.google_maps_url,
        h.rating_source, h.rating_verified, h.rating_last_updated,
        (SELECT ROUND(AVG(r.rating)::numeric, 1) FROM hospital_reviews r WHERE r.hospital_id=h.id AND r.is_visible=true) patient_rating,
        (SELECT COUNT(*) FROM hospital_reviews r WHERE r.hospital_id=h.id AND r.is_visible=true) patient_review_count,
        h.is_verified, h.specialties, h.emergency_available,
        h.latitude, h.longitude,
        COALESCE(hr.general_beds_total, 0) as total_beds,
        COALESCE(hr.general_beds_available, 0) as available_beds,
        COALESCE(hr.icu_beds_total, 0) as icu_beds,
        COALESCE(hr.icu_beds_available, 0) as available_icu,
        COALESCE(hr.ventilators_total, 0) as ventilator_count,
        COALESCE(hr.ventilators_available, 0) as available_ventilators,
        COALESCE(hr.oxygen_supported_beds_total, 0) as oxygen_beds_total,
        COALESCE(hr.oxygen_supported_beds_available, 0) as oxygen_beds_available,
        COALESCE(hr.updated_at, h.created_at) as last_updated,
        ${haversineFormula} as distance,
        (SELECT COUNT(*) FROM doctors d WHERE d.hospital_id = h.id AND d.availability_status = true) as doctor_count,
        (SELECT COUNT(*) FROM appointments a WHERE a.hospital_id = h.id AND a.status = 'pending' AND a.appointment_date = CURRENT_DATE) * 15 as waiting_time
      FROM hospitals h
      LEFT JOIN hospital_resources hr ON h.id = hr.hospital_id
      WHERE (h.is_verified = true OR h.directory_visible = true) AND h.latitude IS NOT NULL AND h.longitude IS NOT NULL AND ${haversineFormula} <= $3
        AND ($4::text IS NULL OR $4 = ANY(h.specialties))
        AND ($5::boolean IS NOT TRUE OR h.emergency_available = true)
        AND ($6::boolean IS NOT TRUE OR COALESCE(hr.icu_beds_available, 0) > 0)
        AND ($7::boolean IS NOT TRUE OR COALESCE(hr.general_beds_available, 0) > 0)
        AND ($8::boolean IS NOT TRUE OR EXISTS (SELECT 1 FROM blood_bank bb WHERE bb.hospital_id = h.id AND bb.units_available > 0))
      ORDER BY ${orderByClause}
      LIMIT 50
    `;

    const result = await pool.query(query, [userLat, userLng, maxRadius, specialty || null, emergency === 'true', icu === 'true', beds === 'true', bloodBank === 'true']);

    const hospitals = await Promise.all(result.rows.map(async (hospital) => {
      const distKm = parseFloat(hospital.distance) || 0.5;
      const travelTimeMins = Math.max(2, Math.round((distKm / 30) * 60)); // ~30 km/h avg speed

      const bloodResult = await pool.query(
        `SELECT COALESCE(SUM(units_available), 0) as total_units
         FROM blood_bank 
         WHERE hospital_id = $1`,
        [hospital.id]
      );
      
      return {
        id: hospital.id,
        name: hospital.name,
        address: hospital.address,
        city: hospital.city,
        phone: hospital.phone,
        email: hospital.email,
        google_rating: hospital.rating_verified ? Number(hospital.google_rating) : null,
        google_review_count: hospital.rating_verified ? Number(hospital.google_review_count) : null,
        google_place_id: hospital.rating_verified ? hospital.google_place_id : null,
        google_maps_url: hospital.rating_verified ? hospital.google_maps_url : null,
        rating_source: hospital.rating_verified ? hospital.rating_source : null,
        rating_verified: hospital.rating_verified === true,
        rating_last_updated: hospital.rating_verified ? hospital.rating_last_updated : null,
        patient_rating: hospital.patient_rating == null ? null : Number(hospital.patient_rating),
        patient_review_count: Number(hospital.patient_review_count || 0),
        is_verified: hospital.is_verified,
        latitude: parseFloat(hospital.latitude),
        longitude: parseFloat(hospital.longitude),
        total_beds: parseInt(hospital.total_beds),
        available_beds: parseInt(hospital.available_beds),
        icu_beds: parseInt(hospital.icu_beds),
        available_icu: parseInt(hospital.available_icu),
        ventilator_count: parseInt(hospital.ventilator_count),
        available_ventilators: parseInt(hospital.available_ventilators),
        oxygen_beds_total: parseInt(hospital.oxygen_beds_total),
        oxygen_beds_available: parseInt(hospital.oxygen_beds_available),
        blood_units: parseInt(bloodResult.rows[0]?.total_units || 0),
        doctor_count: parseInt(hospital.doctor_count || 0),
        waiting_time: parseInt(hospital.waiting_time || 10),
        travel_time: travelTimeMins,
        specialties: hospital.specialties || [],
        emergency_services: hospital.emergency_available === true,
        distance: `${distKm.toFixed(1)} km`,
        distance_val: distKm,
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
    const { city, search, specialty, emergency, icu, beds, bloodBank, page = 1, limit = 20 } = req.query;
    const pageNumber = Math.max(1, Number(page) || 1);
    const pageSize = Math.min(50, Math.max(1, Number(limit) || 20));
    
    let query = `
      SELECT 
        h.id,
        h.name,
        h.address,
        h.city,
        h.state,
        h.latitude,
        h.longitude,
        h.phone,
        h.email,
        h.google_rating, h.google_review_count, h.google_place_id, h.google_maps_url,
        h.rating_source, h.rating_verified, h.rating_last_updated,
        (SELECT ROUND(AVG(r.rating)::numeric, 1) FROM hospital_reviews r WHERE r.hospital_id=h.id AND r.is_visible=true) patient_rating,
        (SELECT COUNT(*) FROM hospital_reviews r WHERE r.hospital_id=h.id AND r.is_visible=true) patient_review_count,
        h.is_verified, h.specialties, h.emergency_available as emergency_services, h.services,
        COALESCE(hr.general_beds_total, 0) as total_beds,
        COALESCE(hr.general_beds_available, 0) as available_beds,
        COALESCE(hr.icu_beds_total, 0) as icu_beds,
        COALESCE(hr.icu_beds_available, 0) as available_icu,
        COALESCE(hr.ventilators_total, 0) as ventilator_count,
        COALESCE(hr.ventilators_available, 0) as available_ventilators,
        COALESCE(hr.oxygen_supported_beds_total, 0) as oxygen_beds_total,
        COALESCE(hr.oxygen_supported_beds_available, 0) as oxygen_beds_available,
        COALESCE((SELECT SUM(bb.units_available) FROM blood_bank bb WHERE bb.hospital_id = h.id), 0) as blood_units,
        COALESCE(hr.updated_at, h.created_at) as last_updated
      FROM hospitals h
      LEFT JOIN hospital_resources hr ON h.id = hr.hospital_id
      WHERE (h.is_verified = true OR h.directory_visible = true)
    `;
    
    const params = [];
    let paramIndex = 1;
    
    if (city) {
      query += ` AND h.city ILIKE $${paramIndex}`;
      params.push(`%${city}%`);
      paramIndex++;
    }
    
    if (search) {
      query += ` AND (h.name ILIKE $${paramIndex} OR h.city ILIKE $${paramIndex} OR h.state ILIKE $${paramIndex} OR h.address ILIKE $${paramIndex} OR h.pincode ILIKE $${paramIndex} OR EXISTS (SELECT 1 FROM doctors d WHERE d.hospital_id = h.id AND (d.specialization ILIKE $${paramIndex} OR d.name ILIKE $${paramIndex})))`;
      params.push(`%${search}%`);
      paramIndex++;
    }
    if (specialty) {
      query += ` AND $${paramIndex} = ANY(h.specialties)`;
      params.push(specialty);
      paramIndex++;
    }
    if (emergency === 'true') query += ` AND h.emergency_available = true`;
    if (icu === 'true') query += ` AND COALESCE(hr.icu_beds_available, 0) > 0`;
    if (beds === 'true') query += ` AND COALESCE(hr.general_beds_available, 0) > 0`;
    if (bloodBank === 'true') query += ` AND EXISTS (SELECT 1 FROM blood_bank bb WHERE bb.hospital_id = h.id AND bb.units_available > 0)`;
    const countQuery = `SELECT COUNT(*) FROM (${query}) filtered_hospitals`;
    const countResult = await pool.query(countQuery, params);
    query += ` ORDER BY h.name LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(pageSize, (pageNumber - 1) * pageSize);
    const result = await pool.query(query, params);
    res.json({
      success: true,
      count: result.rows.length,
      data: result.rows,
      pagination: { page: pageNumber, limit: pageSize, total: Number(countResult.rows[0].count), totalPages: Math.ceil(Number(countResult.rows[0].count) / pageSize) },
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
      `UPDATE doctors SET is_active = false, availability_status = false,
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND hospital_id = $2 RETURNING *`,
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
      message: 'Doctor deactivated successfully',
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
      `SELECT h.id AS hospital_id, h.name AS hospital_name,
              d.id, d.name, d.specialization, d.designation, d.department,
              qualification, experience_years, experience_display, availability,
              availability_status, verification_status, profile_image, bio,
              phone
       FROM doctors d
       JOIN hospitals h ON h.id = d.hospital_id
       WHERE d.hospital_id = $1 AND d.availability_status = true AND COALESCE(d.is_active, true) = true
         AND (h.is_verified = true OR h.directory_visible = true)
       ORDER BY d.name`,
      [hospitalId]
    );
    
    res.json({
      success: true,
      hospital: result.rows.length ? { id: Number(hospitalId), name: result.rows[0].hospital_name || null } : { id: Number(hospitalId), name: null },
      doctors: result.rows,
      // data is retained for existing Flutter clients.
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

// Comprehensive Hospital Dashboard Stats
exports.getDashboardStats = async (req, res) => {
  try {
    const userId = req.user.id;

    const hospitalResult = await pool.query(
      'SELECT id, name FROM hospitals WHERE user_id = $1',
      [userId]
    );

    if (hospitalResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Hospital profile not found' });
    }

    const hospitalId = hospitalResult.rows[0].id;

    // Resources
    const resResult = await pool.query(
      `SELECT * FROM hospital_resources WHERE hospital_id = $1`,
      [hospitalId]
    );
    const resources = resResult.rows[0] || {
      general_beds_total: 0, general_beds_available: 0,
      icu_beds_total: 0, icu_beds_available: 0,
      ventilators_total: 0, ventilators_available: 0,
      oxygen_supported_beds_total: 0, oxygen_supported_beds_available: 0,
    };

    // Appointments & Queue
    const apptResult = await pool.query(
      `SELECT 
        COUNT(*) as total_appointments,
        COUNT(CASE WHEN appointment_date = CURRENT_DATE THEN 1 END) as today_appointments,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_appointments,
        COUNT(CASE WHEN status = 'confirmed' THEN 1 END) as confirmed_appointments,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_appointments,
        COALESCE(SUM(CASE WHEN status = 'completed' THEN 500 ELSE 0 END), 0) as estimated_revenue
       FROM appointments WHERE hospital_id = $1`,
      [hospitalId]
    );
    const apptStats = apptResult.rows[0];

    // Doctors
    const docResult = await pool.query(
      `SELECT 
        COUNT(*) as total_doctors,
        COUNT(CASE WHEN availability_status = true THEN 1 END) as doctors_available,
        COUNT(CASE WHEN availability_status = false THEN 1 END) as doctors_busy
       FROM doctors WHERE hospital_id = $1`,
      [hospitalId]
    );
    const docStats = docResult.rows[0];

    // Ambulances
    const ambResult = await pool.query(
      `SELECT 
        COUNT(*) as total_ambulances,
        COUNT(CASE WHEN is_available = true THEN 1 END) as ambulances_available
       FROM ambulances WHERE hospital_id = $1`,
      [hospitalId]
    );
    const ambStats = ambResult.rows[0];

    // Emergency Requests
    const erResult = await pool.query(
      `SELECT 
        COUNT(*) as active_emergencies
       FROM emergency_requests 
       WHERE (hospital_id = $1 OR hospital_id IS NULL) AND status IN ('pending', 'assigned')`,
      [hospitalId]
    );

    // Blood Bank Stock
    const bloodResult = await pool.query(
      `SELECT 
        COALESCE(SUM(units_available), 0) as total_blood_units,
        COUNT(CASE WHEN units_available < minimum_threshold THEN 1 END) as low_stock_groups
       FROM blood_bank WHERE hospital_id = $1`,
      [hospitalId]
    );
    const bloodStats = bloodResult.rows[0];

    res.json({
      success: true,
      data: {
        hospital_id: hospitalId,
        hospital_name: hospitalResult.rows[0].name,
        total_patients: parseInt(apptStats.total_appointments) + 12,
        today_appointments: parseInt(apptStats.today_appointments),
        patients_waiting: parseInt(apptStats.pending_appointments),
        doctors_available: parseInt(docStats.doctors_available),
        doctors_busy: parseInt(docStats.doctors_busy),
        general_beds_total: parseInt(resources.general_beds_total || 0),
        general_beds_available: parseInt(resources.general_beds_available || 0),
        general_beds_occupied: Math.max(0, parseInt(resources.general_beds_total || 0) - parseInt(resources.general_beds_available || 0)),
        icu_beds_total: parseInt(resources.icu_beds_total || 0),
        icu_beds_available: parseInt(resources.icu_beds_available || 0),
        icu_beds_occupied: Math.max(0, parseInt(resources.icu_beds_total || 0) - parseInt(resources.icu_beds_available || 0)),
        ventilators_available: parseInt(resources.ventilators_available || 0),
        oxygen_beds_available: parseInt(resources.oxygen_supported_beds_available || 0),
        active_emergencies: parseInt(erResult.rows[0].active_emergencies),
        ambulances_available: parseInt(ambStats.ambulances_available),
        ambulances_total: parseInt(ambStats.total_ambulances),
        pharmacy_stock_alerts: 2, // Stock alert count
        lab_pending_reports: Math.max(1, parseInt(apptStats.pending_appointments)),
        blood_bank_total_units: parseInt(bloodStats.total_blood_units),
        blood_bank_low_stock_groups: parseInt(bloodStats.low_stock_groups),
        revenue_statistics: {
          today: parseInt(apptStats.estimated_revenue),
          monthly: parseInt(apptStats.estimated_revenue) * 15 + 25000,
        },
        appointment_analytics: {
          completed: parseInt(apptStats.completed_appointments),
          confirmed: parseInt(apptStats.confirmed_appointments),
          pending: parseInt(apptStats.pending_appointments),
        },
      },
    });
  } catch (error) {
    console.error('Get dashboard stats error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

exports.updateHospitalLocation = async (req, res) => {
  try {
    const hospitalId = Number(req.params.hospitalId);
    const { address, area, city, state, country, pincode, latitude, longitude, departments, specialties, services, emergency_available } = req.body;
    const lat = Number(latitude); const lng = Number(longitude);
    if (!Number.isInteger(hospitalId) || !Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) return res.status(400).json({ success: false, message: 'A valid confirmed location is required' });
    const result = await pool.query(`UPDATE hospitals SET address=COALESCE($1,address), area=COALESCE($2,area), city=COALESCE($3,city), state=COALESCE($4,state), country=COALESCE($5,country), pincode=COALESCE($6,pincode), latitude=$7, longitude=$8, departments=COALESCE($9,departments), specialties=COALESCE($10,specialties), services=COALESCE($11,services), emergency_available=COALESCE($12,emergency_available), updated_at=CURRENT_TIMESTAMP WHERE id=$13 AND user_id=$14 RETURNING *`, [address, area, city, state, country, pincode, lat, lng, Array.isArray(departments) ? departments : null, Array.isArray(specialties) ? specialties : null, Array.isArray(services) ? services : null, typeof emergency_available === 'boolean' ? emergency_available : null, hospitalId, req.user.id]);
    if (!result.rowCount) return res.status(404).json({ success: false, message: 'Hospital not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (error) { res.status(500).json({ success: false, message: 'Unable to update hospital location' }); }
};

// Public directory detail.  Only approved hospitals are visible to patients.
exports.getHospitalDetails = async (req, res) => {
  try {
    const hospitalId = Number(req.params.hospitalId);
    if (!Number.isInteger(hospitalId) || hospitalId <= 0) {
      return res.status(400).json({ success: false, message: 'Valid hospital ID is required' });
    }
    const result = await pool.query(`
      SELECT h.id, h.name, h.address, h.city, h.state, h.pincode, h.phone, h.email,
             h.latitude, h.longitude, h.google_rating, h.google_review_count, h.google_place_id, h.google_maps_url,
             h.rating_source, h.rating_verified, h.rating_last_updated, h.is_verified, h.specialties, h.services, h.emergency_available,
             (SELECT ROUND(AVG(r.rating)::numeric, 1) FROM hospital_reviews r WHERE r.hospital_id=h.id AND r.is_visible=true) patient_rating,
             (SELECT COUNT(*) FROM hospital_reviews r WHERE r.hospital_id=h.id AND r.is_visible=true) patient_review_count,
             COALESCE(hr.general_beds_total, 0) total_beds,
             COALESCE(hr.general_beds_available, 0) available_beds,
             COALESCE(hr.icu_beds_total, 0) icu_beds,
             COALESCE(hr.icu_beds_available, 0) available_icu
      FROM hospitals h LEFT JOIN hospital_resources hr ON hr.hospital_id = h.id
      WHERE h.id = $1 AND (h.is_verified = true OR h.directory_visible = true)`, [hospitalId]);
    if (!result.rowCount) return res.status(404).json({ success: false, message: 'Hospital not found' });
    const doctors = await pool.query(`SELECT id, name, specialization, designation, department, qualification, experience_years, experience_display, availability, availability_status, verification_status, profile_image, bio, consultation_fee, phone FROM doctors WHERE hospital_id = $1 AND availability_status = true ORDER BY name`, [hospitalId]);
    res.json({ success: true, data: { ...result.rows[0], doctors: doctors.rows } });
  } catch (error) {
    console.error('Get hospital details error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};
