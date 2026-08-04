// src/controllers/emergencyController.js
const { pool } = require('../config/database');

// Haversine distance formula SQL helper
const HAVERSINE_DIST_SQL = `
  (6371 * acos(
    cos(radians($1)) * cos(radians(latitude)) *
    cos(radians(longitude) - radians($2)) +
    sin(radians($1)) * sin(radians(latitude))
  ))
`;

exports.createEmergencyRequest = async (req, res) => {
  try {
    const userId = req.user.id;
    const { emergency_type, severity, description, location_lat, location_lng, hospital_id } = req.body;
    
    const patientResult = await pool.query(
      `SELECT p.id, p.emergency_contact, p.emergency_contact_name, u.name as patient_name, u.phone as patient_phone
       FROM patients p
       JOIN users u ON p.user_id = u.id
       WHERE p.user_id = $1`,
      [userId]
    );
    
    if (patientResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Patient not found' });
    }
    
    const patient = patientResult.rows[0];
    const patientId = patient.id;

    // Determine target hospital (either explicitly requested or nearest)
    let assignedHospitalId = hospital_id || null;
    let nearestHospital = null;

    if (!assignedHospitalId && location_lat && location_lng) {
      const nearestRes = await pool.query(
        `SELECT id, name, phone, address, latitude, longitude, ${HAVERSINE_DIST_SQL} as distance
         FROM hospitals
         WHERE is_verified = true AND latitude IS NOT NULL AND longitude IS NOT NULL
         ORDER BY distance ASC
         LIMIT 1`,
        [parseFloat(location_lat), parseFloat(location_lng)]
      );
      if (nearestRes.rows.length > 0) {
        nearestHospital = nearestRes.rows[0];
        assignedHospitalId = nearestHospital.id;
      }
    }

    // Check for available ambulance from assigned hospital
    let assignedAmbulance = null;
    if (assignedHospitalId) {
      const ambRes = await pool.query(
        `SELECT * FROM ambulances 
         WHERE hospital_id = $1 AND is_available = true 
         LIMIT 1`,
        [assignedHospitalId]
      );
      if (ambRes.rows.length > 0) {
        assignedAmbulance = ambRes.rows[0];
        // Mark ambulance busy
        await pool.query(`UPDATE ambulances SET is_available = false WHERE id = $1`, [assignedAmbulance.id]);
      }
    }
    
    const result = await pool.query(
      `INSERT INTO emergency_requests 
       (patient_id, hospital_id, ambulance_id, emergency_type, severity, description, location_lat, location_lng, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending')
       RETURNING *`,
      [
        patientId, 
        assignedHospitalId, 
        assignedAmbulance ? assignedAmbulance.id : null,
        emergency_type || 'General Emergency', 
        severity || 'critical', 
        description || 'Emergency SOS triggered', 
        location_lat, 
        location_lng
      ]
    );

    const emergencyData = result.rows[0];

    // Create caregiver notification record
    if (patient.emergency_contact) {
      await pool.query(
        `INSERT INTO notifications (user_id, title, message, type)
         VALUES ($1, $2, $3, $4)`,
        [
          userId,
          '🚨 EMERGENCY SOS ALERT',
          `Emergency SOS triggered by ${patient.patient_name}. Emergency contact ${patient.emergency_contact_name || ''} (${patient.emergency_contact}) notified.`,
          'emergency'
        ]
      );
    }

    res.status(201).json({
      success: true,
      message: 'Emergency request created successfully',
      data: {
        ...emergencyData,
        patient_name: patient.patient_name,
        patient_phone: patient.patient_phone,
        emergency_contact: patient.emergency_contact,
        emergency_contact_name: patient.emergency_contact_name,
        hospital: nearestHospital,
        ambulance: assignedAmbulance,
      },
    });
  } catch (error) {
    console.error('Create emergency error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

exports.updateLiveLocation = async (req, res) => {
  try {
    const { emergencyId, location_lat, location_lng } = req.body;

    if (!emergencyId || location_lat === undefined || location_lng === undefined) {
      return res.status(400).json({ success: false, message: 'Emergency ID and coordinates required' });
    }

    const result = await pool.query(
      `UPDATE emergency_requests
       SET location_lat = $1, location_lng = $2
       WHERE id = $3
       RETURNING *`,
      [location_lat, location_lng, emergencyId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Emergency request not found' });
    }

    // Also fetch ambulance status if assigned
    let ambulanceData = null;
    if (result.rows[0].ambulance_id) {
      const ambRes = await pool.query(`SELECT * FROM ambulances WHERE id = $1`, [result.rows[0].ambulance_id]);
      if (ambRes.rows.length > 0) ambulanceData = ambRes.rows[0];
    }

    res.json({
      success: true,
      message: 'Live location updated',
      data: {
        ...result.rows[0],
        ambulance: ambulanceData,
      },
    });
  } catch (error) {
    console.error('Update live location error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

exports.getPatientSosHistory = async (req, res) => {
  try {
    const userId = req.user.id;

    const patientResult = await pool.query(
      'SELECT id FROM patients WHERE user_id = $1',
      [userId]
    );

    if (patientResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Patient profile not found' });
    }

    const patientId = patientResult.rows[0].id;

    const result = await pool.query(
      `SELECT er.*, h.name as hospital_name, h.phone as hospital_phone, a.vehicle_number, a.driver_name, a.driver_phone
       FROM emergency_requests er
       LEFT JOIN hospitals h ON er.hospital_id = h.id
       LEFT JOIN ambulances a ON er.ambulance_id = a.id
       WHERE er.patient_id = $1
       ORDER BY er.created_at DESC`,
      [patientId]
    );

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error('Get patient SOS history error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

exports.endEmergency = async (req, res) => {
  try {
    const { emergencyId } = req.params;
    const { status = 'completed' } = req.body;

    const result = await pool.query(
      `UPDATE emergency_requests
       SET status = $1, completed_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING *`,
      [status, emergencyId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Emergency request not found' });
    }

    const emergency = result.rows[0];

    // Free up assigned ambulance
    if (emergency.ambulance_id) {
      await pool.query(`UPDATE ambulances SET is_available = true WHERE id = $1`, [emergency.ambulance_id]);
    }

    res.json({
      success: true,
      message: `Emergency marked as ${status}`,
      data: emergency,
    });
  } catch (error) {
    console.error('End emergency error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

exports.getNearbyEmergencies = async (req, res) => {
  try {
    const { lat, lng, radius = 5 } = req.query;
    
    const result = await pool.query(
      `SELECT er.*, u.name as patient_name, u.phone as patient_phone
       FROM emergency_requests er
       JOIN patients p ON er.patient_id = p.id
       JOIN users u ON p.user_id = u.id
       WHERE er.status IN ('pending', 'assigned')
       ORDER BY er.created_at DESC
       LIMIT 20`,
      []
    );
    
    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error('Get nearby emergencies error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

exports.getHospitalEmergencies = async (req, res) => {
  try {
    const userId = req.user.id;
    
    const hospitalResult = await pool.query(
      'SELECT id FROM hospitals WHERE user_id = $1',
      [userId]
    );
    
    if (hospitalResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Hospital not found' });
    }
    
    const hospitalId = hospitalResult.rows[0].id;
    
    const result = await pool.query(
      `SELECT er.*, u.name as patient_name, u.phone as patient_phone,
              a.vehicle_number as ambulance_vehicle, a.driver_name as ambulance_driver
       FROM emergency_requests er
       JOIN patients p ON er.patient_id = p.id
       JOIN users u ON p.user_id = u.id
       LEFT JOIN ambulances a ON er.ambulance_id = a.id
       WHERE er.hospital_id = $1 OR er.hospital_id IS NULL
       ORDER BY er.created_at DESC
       LIMIT 50`,
      [hospitalId]
    );
    
    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error('Get hospital emergencies error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

exports.updateEmergencyStatus = async (req, res) => {
  try {
    const { emergencyId } = req.params;
    const { status } = req.body;
    
    const result = await pool.query(
      `UPDATE emergency_requests 
       SET status = $1, 
           assigned_at = CASE WHEN $1 = 'assigned' THEN CURRENT_TIMESTAMP ELSE assigned_at END,
           completed_at = CASE WHEN $1 IN ('completed', 'resolved', 'cancelled') THEN CURRENT_TIMESTAMP ELSE completed_at END
       WHERE id = $2
       RETURNING *`,
      [status, emergencyId]
    );

    if (result.rows.length > 0 && result.rows[0].ambulance_id && ['completed', 'resolved', 'cancelled'].includes(status)) {
      await pool.query(`UPDATE ambulances SET is_available = true WHERE id = $1`, [result.rows[0].ambulance_id]);
    }
    
    res.json({
      success: true,
      message: 'Emergency status updated',
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Update emergency status error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};