// src/controllers/hospitalController.js
const { pool } = require('../config/database');
const { RESOURCE_FIELDS, validateResourceUpdate } = require('../services/hospitalResourceValidation');

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
  const client = await pool.connect();
  try {
    const hospitalResult = await client.query('SELECT id FROM hospitals WHERE user_id=$1', [req.user.id]);
    if (!hospitalResult.rowCount) return res.status(404).json({ success: false, message: 'Hospital not found' });
    const hospitalId = hospitalResult.rows[0].id;

    await client.query('BEGIN');
    await client.query('INSERT INTO hospital_resources(hospital_id) VALUES($1) ON CONFLICT(hospital_id) DO NOTHING', [hospitalId]);
    const existing = await client.query('SELECT * FROM hospital_resources WHERE hospital_id=$1 FOR UPDATE', [hospitalId]);
    const current = existing.rows[0];
    const checked = validateResourceUpdate(req.body, current);
    if (checked.error) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: checked.error });
    }

    const values = [];
    const updates = checked.entries.map(([key, value], index) => {
      values.push(value);
      return `${RESOURCE_FIELDS[key]}=$${index + 1}`;
    });
    values.push(hospitalId);
    const result = await client.query(`UPDATE hospital_resources SET ${updates.join(', ')}, updated_at=CURRENT_TIMESTAMP
      WHERE hospital_id=$${values.length} RETURNING *`, values);
    await client.query('COMMIT');

    const io = req.app.get('io');
    const payload = { hospitalId, resources: result.rows[0], updatedAt: result.rows[0].updated_at };
    io?.to(`hospital_${hospitalId}`).emit('resources-changed', payload);
    return res.json({ success: true, message: 'Resources updated successfully', data: result.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Update resources error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  } finally { client.release(); }
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
        (SELECT '/api/hospitals/' || p.hospital_id || '/photos/' || p.id || '/image?size=thumbnail'
         FROM hospital_photos p WHERE p.hospital_id = h.id AND p.is_cover = TRUE AND p.is_published = TRUE
         ORDER BY p.id LIMIT 1) AS cover_photo_url,
        h.address,
        h.city,
        h.phone,
        h.email,
        h.google_rating, h.google_review_count, h.google_place_id, h.google_maps_url,
        h.rating_source, h.rating_verified, h.rating_last_updated,
        (SELECT ROUND(AVG(r.rating)::numeric, 1) FROM hospital_reviews r WHERE r.hospital_id=h.id AND r.is_visible=true) patient_rating,
        (SELECT COUNT(*) FROM hospital_reviews r WHERE r.hospital_id=h.id AND r.is_visible=true) patient_review_count,
        h.is_verified, h.specialties, h.emergency_available,
        h.latitude, h.longitude, h.entrance_latitude, h.entrance_longitude, h.entrance_address, h.entrance_verified,
        COALESCE(hr.general_beds_total, 0) as total_beds,
        COALESCE(hr.general_beds_available, 0) as available_beds,
        COALESCE(hr.icu_beds_total, 0) as icu_beds,
        COALESCE(hr.icu_beds_available, 0) as available_icu,
        COALESCE(hr.ventilators_total, 0) as ventilator_count,
        COALESCE(hr.ventilators_available, 0) as available_ventilators,
        COALESCE(hr.oxygen_supported_beds_total, 0) as oxygen_beds_total,
        COALESCE(hr.oxygen_supported_beds_available, 0) as oxygen_beds_available,
        COALESCE(bb.total_units, 0) AS blood_units,
        COALESCE(hr.updated_at, h.created_at) as last_updated,
        ${haversineFormula} as distance,
        (SELECT COUNT(*) FROM doctors d WHERE d.hospital_id = h.id
          AND COALESCE(d.is_active,true) AND COALESCE(d.availability_status,true))::int AS doctor_count,
        (SELECT COUNT(*) FROM appointments a WHERE a.hospital_id = h.id AND a.status = 'pending' AND a.appointment_date = CURRENT_DATE) * 15 as waiting_time
      FROM hospitals h
      LEFT JOIN hospital_resources hr ON h.id = hr.hospital_id
      LEFT JOIN (SELECT hospital_id, SUM(units_available)::int AS total_units FROM blood_bank GROUP BY hospital_id) bb ON bb.hospital_id = h.id
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

    const hospitals = result.rows.map((hospital) => {
      const distKm = parseFloat(hospital.distance) || 0.5;
      const travelTimeMins = Math.max(2, Math.round((distKm / 30) * 60)); // ~30 km/h avg speed

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
        entrance_latitude: hospital.entrance_latitude == null ? null : parseFloat(hospital.entrance_latitude),
        entrance_longitude: hospital.entrance_longitude == null ? null : parseFloat(hospital.entrance_longitude),
        entrance_address: hospital.entrance_address,
        entrance_verified: Boolean(hospital.entrance_verified),
        total_beds: parseInt(hospital.total_beds),
        available_beds: parseInt(hospital.available_beds),
        icu_beds: parseInt(hospital.icu_beds),
        available_icu: parseInt(hospital.available_icu),
        ventilator_count: parseInt(hospital.ventilator_count),
        available_ventilators: parseInt(hospital.available_ventilators),
        oxygen_beds_total: parseInt(hospital.oxygen_beds_total),
        oxygen_beds_available: parseInt(hospital.oxygen_beds_available),
        blood_units: parseInt(hospital.blood_units || 0),
        doctor_count: parseInt(hospital.doctor_count || 0),
        waiting_time: parseInt(hospital.waiting_time || 10),
        travel_time: travelTimeMins,
        specialties: hospital.specialties || [],
        emergency_services: hospital.emergency_available === true,
        distance: `${distKm.toFixed(1)} km`,
        distance_val: distKm,
        last_updated: hospital.last_updated,
      };
    });
    
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
        (SELECT '/api/hospitals/' || p.hospital_id || '/photos/' || p.id || '/image?size=thumbnail'
         FROM hospital_photos p WHERE p.hospital_id = h.id AND p.is_cover = TRUE AND p.is_published = TRUE
         ORDER BY p.id LIMIT 1) AS cover_photo_url,
        h.address,
        h.city,
        h.state,
        h.latitude,
        h.longitude,
        h.entrance_latitude,
        h.entrance_longitude, h.entrance_address, h.entrance_verified,
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
        (SELECT COUNT(*) FROM doctors d WHERE d.hospital_id=h.id
          AND COALESCE(d.is_active,true) AND COALESCE(d.availability_status,true))::int AS doctor_count,
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
      `SELECT d.id, d.id AS doctor_id, 'doctor' AS role, d.user_id, d.name, d.specialization as designation, d.department,
              qualification, experience_years,
              COALESCE(NULLIF(d.email, ''), u.email) AS email,
              COALESCE(NULLIF(d.phone, ''), u.phone) AS phone,
              (COALESCE(d.is_active, true) AND COALESCE(d.availability_status, true)) AS is_available,
              COALESCE(d.is_active, true) AS is_active,
              COALESCE(d.availability_status, true) AS availability_status,
              d.account_activation_status,u.password_reset_required,u.account_status
       FROM doctors d
       LEFT JOIN users u ON u.id = d.user_id
       WHERE d.hospital_id = $1
       ORDER BY d.name`,
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
  const client = await pool.connect();
  try {
    const userId = req.user.id;
    const { staffId } = req.params;
    const {
      designation,
      department,
      qualification,
      experience_years,
      phone,
      email,
      is_available,
    } = req.body;
    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : null;
    const normalizedPhone=typeof phone==='string'?phone.trim().replace(/[ ()-]/g,''):null;
    const phoneDigits=normalizedPhone?.replace(/\D/g,'')||'';
    if (email != null &&
        (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail))) {
      return res.status(400).json({ success: false, message: 'Please provide a valid email address.' });
    }
    if(phone!=null&&(!/^\+?[0-9 ()-]{8,20}$/.test(phone)||phoneDigits.length<8||phoneDigits.length>15))return res.status(400).json({success:false,message:'Please provide a valid mobile number.'});
    
    const hospitalResult = await client.query(
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

    await client.query('BEGIN');
    const staffResult = await client.query(
      'SELECT user_id FROM doctors WHERE id = $1 AND hospital_id = $2 FOR UPDATE',
      [staffId, hospitalId]
    );
    if (staffResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Staff not found' });
    }

    const linkedUserId = staffResult.rows[0].user_id;
    if(linkedUserId!=null&&normalizedPhone!=null){
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[phoneDigits]);
      const duplicatePhone=await client.query("SELECT id FROM users WHERE id<>$1 AND regexp_replace(COALESCE(phone,''),'[^0-9]','','g')=$2 LIMIT 1",[linkedUserId,phoneDigits]);
      if(duplicatePhone.rowCount){await client.query('ROLLBACK');return res.status(409).json({success:false,message:'This mobile number is already registered.'});}
    }
    if (normalizedEmail != null) {
      const existingAccount = await client.query(
        'SELECT id FROM users WHERE lower(email) = lower($1) AND id <> $2',
        [normalizedEmail, linkedUserId ?? -1]
      );
      if (existingAccount.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          success: false,
          message: 'This email address is already registered.',
        });
      }
    }

    // Since the table has specialization but not designation,
    // we store designation in specialization column.
    const result = await client.query(
      `UPDATE doctors
       SET specialization = COALESCE($1, specialization),
           department = COALESCE($2, department),
           qualification = COALESCE($3, qualification),
           experience_years = COALESCE($4, experience_years),
           phone = COALESCE($5, phone),
           email = COALESCE($6, email),
           availability_status = COALESCE($7, availability_status),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $8 AND hospital_id = $9
       RETURNING id, name, specialization AS designation, department, qualification,
                 experience_years, email, phone,
                 (COALESCE(is_active, true) AND COALESCE(availability_status, true)) AS is_available,
                 COALESCE(is_active, true) AS is_active,
                 COALESCE(availability_status, true) AS availability_status`,
      [designation, department, qualification, experience_years, normalizedPhone,
        normalizedEmail, is_available, staffId, hospitalId]
    );

    if (linkedUserId != null && (normalizedEmail != null || normalizedPhone != null)) {
      await client.query(
        'UPDATE users SET email = COALESCE($1,email), phone = COALESCE($2,phone) WHERE id = $3',
        [normalizedEmail, normalizedPhone, linkedUserId]
      );
    }

    await client.query('COMMIT');
    res.json({
      success: true,
      message: 'Staff updated successfully',
      data: result.rows[0],
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Update staff error:', error);
    if (error.code === '23505') {
      return res.status(409).json({
        success: false,
        message: 'This email address is already registered.',
      });
    }
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  } finally {
    client.release();
  }
};

// Contact fields are owned by the authenticated hospital, so callers can
// never choose a different hospital ID in the update request.
exports.updateHospitalProfile = async (req, res) => {
  try {
    const { name, address, phone, email } = req.body ?? {};
    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : null;
    const normalizedPhone = typeof phone === 'string' ? phone.trim() : null;
    if (email != null && (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail))) return res.status(400).json({ success: false, message: 'Please enter a valid email address.' });
    if (phone != null && normalizedPhone && !/^[+0-9][0-9\s-]{7,19}$/.test(normalizedPhone)) return res.status(400).json({ success: false, message: 'Please enter a valid mobile number.' });
    const result = await pool.query(`UPDATE hospitals SET name=COALESCE($1,name), address=COALESCE($2,address), phone=COALESCE($3,phone), email=COALESCE($4,email), updated_at=CURRENT_TIMESTAMP WHERE user_id=$5 RETURNING id,name,address,phone,email,city,state,pincode,is_verified`, [typeof name === 'string' ? name.trim() : null, typeof address === 'string' ? address.trim() : null, normalizedPhone, normalizedEmail, req.user.id]);
    if (!result.rowCount) return res.status(404).json({ success: false, message: 'Hospital not found' });
    res.json({ success: true, message: 'Hospital profile updated successfully', data: result.rows[0] });
  } catch (error) {
    console.error('Update hospital profile error:', error);
    res.status(500).json({ success: false, message: 'Unable to update hospital profile' });
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
       WHERE id = $1 AND hospital_id = $2 RETURNING user_id`,
      [staffId, hospitalId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Staff not found' 
      });
    }
    if(result.rows[0].user_id!=null){await pool.query("UPDATE users SET account_status='DEACTIVATED',token_version=COALESCE(token_version,0)+1,updated_at=CURRENT_TIMESTAMP WHERE id=$1",[result.rows[0].user_id]);req.app.get('io')?.in(`user_${result.rows[0].user_id}`).disconnectSockets(true);}
    
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

exports.updateHospitalDoctorStatus = async (req,res) => {
  const status=String(req.body?.status||'').toLowerCase();
  if(!['active','deactivated'].includes(status))return res.status(400).json({success:false,message:'Status must be active or deactivated'});
  try {
    const hospital=(await pool.query('SELECT id FROM hospitals WHERE user_id=$1',[req.user.id])).rows[0];
    if(!hospital)return res.status(404).json({success:false,message:'Hospital not found'});
    const result=await pool.query(`UPDATE doctors d SET is_active=$1,account_activation_status=$2,updated_at=CURRENT_TIMESTAMP FROM users u WHERE d.id=$3 AND d.hospital_id=$4 AND d.user_id=u.id RETURNING d.user_id`,[status==='active',status==='active'?'ACTIVE':'DEACTIVATED',Number(req.params.staffId),hospital.id]);
    if(!result.rowCount)return res.status(404).json({success:false,message:'Doctor account not found'});
    await pool.query(`UPDATE users SET account_status=$1,token_version=COALESCE(token_version,0)+1,updated_at=CURRENT_TIMESTAMP WHERE id=$2`,[status==='active'?'ACTIVE':'DEACTIVATED',result.rows[0].user_id]);
    req.app.get('io')?.in(`user_${result.rows[0].user_id}`).disconnectSockets(true);
    return res.json({success:true,message:`Doctor account ${status}`,data:{doctor_id:Number(req.params.staffId),account_status:status.toUpperCase()}});
  } catch(_){return res.status(500).json({success:false,message:'Unable to update doctor account status'});}
};
// src/controllers/hospitalController.js - Add this method

// Get hospital doctors
exports.getHospitalDoctors = async (req, res) => {
  try {
    const { hospitalId } = req.params;
    
    const result = await pool.query(
      `SELECT h.id AS hospital_id, h.name AS hospital_name,
              d.id, d.name, d.specialization, d.designation, d.department,
              d.qualification, d.experience_years, d.experience_display,
              d.availability, d.availability_status, d.verification_status,
              d.profile_image, d.bio, d.phone
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
    const { address, area, city, state, country, pincode, latitude, longitude, departments, specialties, services, emergency_available, entrance_latitude, entrance_longitude, entrance_address, entrance_verified } = req.body;
    const lat = Number(latitude); const lng = Number(longitude);
    if (!Number.isInteger(hospitalId) || !Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) return res.status(400).json({ success: false, message: 'A valid confirmed location is required' });
    const entranceLat = entrance_latitude == null ? null : Number(entrance_latitude); const entranceLng = entrance_longitude == null ? null : Number(entrance_longitude);
    if ((entranceLat == null) !== (entranceLng == null) || (entranceLat != null && (!Number.isFinite(entranceLat) || !Number.isFinite(entranceLng) || entranceLat < -90 || entranceLat > 90 || entranceLng < -180 || entranceLng > 180))) return res.status(400).json({ success:false,message:'Provide valid front-gate latitude and longitude together' });
    const result = await pool.query(`UPDATE hospitals SET address=COALESCE($1,address), area=COALESCE($2,area), city=COALESCE($3,city), state=COALESCE($4,state), country=COALESCE($5,country), pincode=COALESCE($6,pincode), latitude=$7, longitude=$8, departments=COALESCE($9,departments), specialties=COALESCE($10,specialties), services=COALESCE($11,services), emergency_available=COALESCE($12,emergency_available), entrance_latitude=COALESCE($13,entrance_latitude), entrance_longitude=COALESCE($14,entrance_longitude), entrance_address=COALESCE($15,entrance_address), entrance_verified=CASE WHEN $16::boolean=true AND $13 IS NOT NULL AND $14 IS NOT NULL THEN true WHEN $16::boolean=false THEN false ELSE entrance_verified END, entrance_verified_at=CASE WHEN $16::boolean=true AND $13 IS NOT NULL AND $14 IS NOT NULL THEN CURRENT_TIMESTAMP ELSE entrance_verified_at END, updated_at=CURRENT_TIMESTAMP WHERE id=$17 AND user_id=$18 RETURNING *`, [address, area, city, state, country, pincode, lat, lng, Array.isArray(departments) ? departments : null, Array.isArray(specialties) ? specialties : null, Array.isArray(services) ? services : null, typeof emergency_available === 'boolean' ? emergency_available : null, entranceLat, entranceLng, entrance_address || null, entrance_verified === true ? true : entrance_verified === false ? false : null, hospitalId, req.user.id]);
    if (!result.rowCount) return res.status(404).json({ success: false, message: 'Hospital not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (error) { res.status(500).json({ success: false, message: 'Unable to update hospital location' }); }
};

// Returns cached navigation metadata without making a Google request for each
// patient visit. Location verification is performed separately by admins/jobs.
exports.getHospitalNavigation = async (req, res) => {
  try {
    const hospitalId = Number(req.params.hospitalId);
    if (!Number.isInteger(hospitalId) || hospitalId <= 0) return res.status(400).json({ success: false, message: 'Valid hospital ID is required' });
    const result = await pool.query(`SELECT id, name, latitude, longitude, google_place_id, google_formatted_address,
      entrance_latitude, entrance_longitude, entrance_address, entrance_verified, navigation_point_token, navigation_point_name,
      navigation_point_type, navigation_verified, location_verified, location_source, location_updated_at
      FROM hospitals WHERE id=$1 AND (is_verified=true OR directory_visible=true)`, [hospitalId]);
    if (!result.rowCount) return res.status(404).json({ success: false, message: 'Hospital not found' });
    const hospital = result.rows[0];
    const entrance = (hospital.navigation_verified || hospital.entrance_verified) &&
      hospital.entrance_latitude != null && hospital.entrance_longitude != null;
    // A token without its corresponding cached coordinate can still be used by
    // the Routes endpoint, but cannot safely be handed to an external Maps URL.
    const navigationPoint = hospital.navigation_verified &&
      hospital.navigation_point_token && entrance;
    const verifiedPlace = hospital.location_verified && Boolean(hospital.google_place_id);
    const destination = navigationPoint
      ? { type: hospital.navigation_point_type || 'MAIN_ENTRANCE', name: hospital.navigation_point_name || hospital.entrance_address || 'Hospital entrance', latitude: Number(hospital.entrance_latitude), longitude: Number(hospital.entrance_longitude), token: hospital.navigation_point_token }
      : entrance
      ? { type: 'VERIFIED_MANUAL_ENTRANCE', name: hospital.entrance_address || 'Verified hospital entrance', latitude: Number(hospital.entrance_latitude), longitude: Number(hospital.entrance_longitude), token: null }
      : verifiedPlace
        ? { type: 'GOOGLE_PLACE', name: hospital.google_formatted_address || hospital.name, place_id: hospital.google_place_id }
        : { type: 'HOSPITAL_COORDINATES', name: hospital.name, latitude: Number(hospital.latitude), longitude: Number(hospital.longitude) };
    res.json({ success: true, hospital: { id: hospital.id, name: hospital.name, google_place_id: hospital.google_place_id, latitude: Number(hospital.latitude), longitude: Number(hospital.longitude), location_verified: Boolean(hospital.location_verified), location_source: hospital.location_source, location_updated_at: hospital.location_updated_at, navigation: destination } });
  } catch (error) {
    console.error('Get hospital navigation error:', error);
    res.status(500).json({ success: false, message: 'Unable to load hospital navigation' });
  }
};

// Routes API keys remain on the server. This endpoint is deliberately
// authenticated because it can incur Google Maps billing.
exports.getHospitalRoute = async (req, res) => {
  try {
    const hospitalId = Number(req.params.hospitalId);
    const latitude = Number(req.body?.origin?.latitude);
    const longitude = Number(req.body?.origin?.longitude);
    if (!Number.isInteger(hospitalId) || !Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return res.status(400).json({ success: false, message: 'A valid live origin is required' });
    const key = process.env.GOOGLE_MAPS_API_KEY;
    if (!key) return res.status(503).json({ success: false, message: 'Server-side Google Routes is not configured.' });
    const result = await pool.query(`SELECT id, name, latitude, longitude, google_place_id, entrance_latitude, entrance_longitude, entrance_address, entrance_verified, navigation_point_token, navigation_point_name, navigation_point_type, navigation_verified, location_verified FROM hospitals WHERE id=$1 AND (is_verified=true OR directory_visible=true)`, [hospitalId]);
    if (!result.rowCount) return res.status(404).json({ success: false, message: 'Hospital not found' });
    const hospital = result.rows[0];
    const navigationPoint = hospital.navigation_verified && hospital.navigation_point_token;
    const entrance = (hospital.navigation_verified || hospital.entrance_verified) && hospital.entrance_latitude != null && hospital.entrance_longitude != null;
    const destination = navigationPoint
      ? { navigationPointToken: hospital.navigation_point_token }
      : entrance
      ? { location: { latLng: { latitude: Number(hospital.entrance_latitude), longitude: Number(hospital.entrance_longitude) } } }
      : hospital.location_verified && hospital.google_place_id
        ? { placeId: hospital.google_place_id }
        : { location: { latLng: { latitude: Number(hospital.latitude), longitude: Number(hospital.longitude) } } };
    const googleResponse = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline' }, body: JSON.stringify({ origin: { location: { latLng: { latitude, longitude } } }, destination, travelMode: 'DRIVE', routingPreference: 'TRAFFIC_AWARE' }) });
    const data = await googleResponse.json();
    if (!googleResponse.ok || !data.routes?.length) return res.status(502).json({ success: false, message: data.error?.message || 'Unable to calculate route' });
    const route = data.routes[0];
    res.json({ success: true, distance_meters: route.distanceMeters, duration: route.duration, encoded_polyline: route.polyline?.encodedPolyline || null, destination: { name: entrance ? (hospital.navigation_point_name || hospital.entrance_address || 'Hospital entrance') : hospital.name, type: navigationPoint ? (hospital.navigation_point_type || 'MAIN_ENTRANCE') : entrance ? 'VERIFIED_MANUAL_ENTRANCE' : hospital.location_verified && hospital.google_place_id ? 'GOOGLE_PLACE' : 'HOSPITAL_COORDINATES' } });
  } catch (error) {
    console.error('Get hospital route error:', error);
    res.status(500).json({ success: false, message: 'Unable to calculate route' });
  }
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
             (SELECT '/api/hospitals/' || p.hospital_id || '/photos/' || p.id || '/image'
              FROM hospital_photos p WHERE p.hospital_id = h.id AND p.is_cover = TRUE AND p.is_published = TRUE
              ORDER BY p.id LIMIT 1) AS cover_photo_url,
             h.latitude, h.longitude, h.entrance_latitude, h.entrance_longitude, h.entrance_address, h.entrance_verified, h.google_rating, h.google_review_count, h.google_place_id, h.google_maps_url,
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
