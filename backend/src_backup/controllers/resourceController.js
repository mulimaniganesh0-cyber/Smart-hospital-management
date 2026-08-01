// src/controllers/resourceController.js
const { pool } = require('../config/database');

// ==================== RESOURCE REQUESTS ====================

exports.requestResource = async (req, res) => {
  try {
    const userId = req.user.id;
    const { 
      hospital_id, 
      resource_type, 
      quantity, 
      description,
      patient_name,
      patient_phone,
      hospital_address 
    } = req.body;

    console.log('Resource request received:', { userId, hospital_id, resource_type, quantity });

    // Map resource type to database field
    let resourceField = '';
    let normalizedResourceType = resource_type;
    
    if (resource_type === 'bed' || resource_type === 'general_bed') {
      resourceField = 'general_beds_available';
      normalizedResourceType = 'general_bed';
    } else if (resource_type === 'icu' || resource_type === 'icu_bed') {
      resourceField = 'icu_beds_available';
      normalizedResourceType = 'icu_bed';
    } else if (resource_type === 'ventilator') {
      resourceField = 'ventilators_available';
      normalizedResourceType = 'ventilator';
    } else if (resource_type === 'oxygen_bed' || resource_type === 'oxygen') {
      resourceField = 'oxygen_supported_beds_available';
      normalizedResourceType = 'oxygen_bed';
    }

    // Get patient id
    const patientResult = await pool.query(
      'SELECT id FROM patients WHERE user_id = $1',
      [userId]
    );

    let patientId = null;
    if (patientResult.rows.length > 0) {
      patientId = patientResult.rows[0].id;
    }

    // Check if resource is available (for non-blood resources)
    if (resourceField) {
      const resourceCheck = await pool.query(
        `SELECT ${resourceField} as available FROM hospital_resources WHERE hospital_id = $1`,
        [hospital_id]
      );
      
      if (resourceCheck.rows.length > 0) {
        const available = resourceCheck.rows[0].available || 0;
        const requestedQuantity = quantity || 1;
        if (available < requestedQuantity) {
          return res.status(400).json({
            success: false,
            message: `Not enough ${normalizedResourceType}s available. Available: ${available}, Requested: ${requestedQuantity}`
          });
        }
      }
    }

    const result = await pool.query(
      `INSERT INTO resource_requests (
        patient_id, user_id, hospital_id, resource_type, quantity, 
        description, patient_name, patient_phone, hospital_address, status, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending', CURRENT_TIMESTAMP)
      RETURNING *`,
      [
        patientId, userId, hospital_id, normalizedResourceType, quantity || 1,
        description || '', patient_name || 'Patient', patient_phone || '',
        hospital_address || ''
      ]
    );

    console.log('Resource request created:', result.rows[0]);

    res.status(201).json({
      success: true,
      message: 'Resource request submitted successfully',
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Request resource error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  }
};

exports.getMyResourceRequests = async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(
      `SELECT r.*, h.name as hospital_name
       FROM resource_requests r
       LEFT JOIN hospitals h ON r.hospital_id = h.id
       WHERE r.user_id = $1
       ORDER BY r.created_at DESC`,
      [userId]
    );

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error('Get my resource requests error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  }
};

exports.getHospitalResourceRequests = async (req, res) => {
  try {
    const userId = req.user.id;

    console.log('Getting hospital requests for user:', userId);

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
    console.log('Hospital ID:', hospitalId);

    const result = await pool.query(
      `SELECT r.*, u.name as patient_name, u.phone as patient_phone
       FROM resource_requests r
       LEFT JOIN users u ON r.user_id = u.id
       WHERE r.hospital_id = $1
       ORDER BY r.created_at DESC
       LIMIT 100`,
      [hospitalId]
    );

    console.log(`Found ${result.rows.length} resource requests for hospital ${hospitalId}`);

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error('Get hospital resource requests error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  }
};

// ========== FULFILL RESOURCE REQUEST - UPDATED ==========
exports.fulfillResourceRequest = async (req, res) => {
  const { requestId } = req.params;
  const userId = req.user.id;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    console.log(`Fulfilling resource request: ${requestId} for user: ${userId}`);

    // Get hospital id
    const hospitalResult = await client.query(
      'SELECT id FROM hospitals WHERE user_id = $1',
      [userId]
    );

    if (hospitalResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ 
        success: false, 
        message: 'Hospital not found' 
      });
    }

    const hospitalId = hospitalResult.rows[0].id;

    // Check if request exists and is pending
    const requestResult = await client.query(
      'SELECT * FROM resource_requests WHERE id = $1 AND hospital_id = $2 AND status = $3',
      [requestId, hospitalId, 'pending']
    );

    if (requestResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ 
        success: false, 
        message: 'Request not found or already processed' 
      });
    }

    const request = requestResult.rows[0];

    // Map resource type to database column
    let resourceField = '';
    if (request.resource_type === 'general_bed') {
      resourceField = 'general_beds_available';
    } else if (request.resource_type === 'icu_bed') {
      resourceField = 'icu_beds_available';
    } else if (request.resource_type === 'ventilator') {
      resourceField = 'ventilators_available';
    } else if (request.resource_type === 'oxygen_bed') {
      resourceField = 'oxygen_supported_beds_available';
    }

    // DECREASE the available resource count
    if (resourceField) {
      const checkResult = await client.query(
        `SELECT ${resourceField} as available FROM hospital_resources WHERE hospital_id = $1`,
        [hospitalId]
      );

      if (checkResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ 
          success: false, 
          message: 'Hospital resources not found' 
        });
      }

      const currentAvailable = checkResult.rows[0].available || 0;
      const requestedQuantity = request.quantity || 1;

      if (currentAvailable < requestedQuantity) {
        await client.query('ROLLBACK');
        return res.status(400).json({ 
          success: false, 
          message: `Insufficient resources. Available: ${currentAvailable}, Requested: ${requestedQuantity}` 
        });
      }

      // Decrease the resource count
      await client.query(
        `UPDATE hospital_resources 
         SET ${resourceField} = ${resourceField} - $1,
             updated_at = CURRENT_TIMESTAMP
         WHERE hospital_id = $2`,
        [requestedQuantity, hospitalId]
      );
      
      console.log(`Decreased ${resourceField} by ${requestedQuantity}`);
    }

    // Update request status to fulfilled
    const result = await client.query(
      `UPDATE resource_requests 
       SET status = 'fulfilled', fulfilled_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [requestId]
    );

    await client.query('COMMIT');

    console.log(`Resource request ${requestId} fulfilled successfully`);

    res.json({
      success: true,
      message: 'Resource request fulfilled successfully. Resource allocated to patient.',
      data: result.rows[0],
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Fulfill resource request error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  } finally {
    client.release();
  }
};

exports.rejectResourceRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    const userId = req.user.id;

    console.log(`Rejecting resource request: ${requestId}`);

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

    // Check if request exists and is pending
    const requestResult = await pool.query(
      'SELECT * FROM resource_requests WHERE id = $1 AND hospital_id = $2 AND status = $3',
      [requestId, hospitalId, 'pending']
    );

    if (requestResult.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Request not found or already processed' 
      });
    }

    // Update the request status
    const result = await pool.query(
      `UPDATE resource_requests 
       SET status = 'rejected', rejected_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [requestId]
    );

    console.log(`Resource request ${requestId} rejected`);

    res.json({
      success: true,
      message: 'Resource request rejected',
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Reject resource request error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  }
};

// ========== FREE RESOURCE (DISCHARGE PATIENT) ==========
exports.freeResource = async (req, res) => {
  try {
    const userId = req.user.id;
    const { resource_type, quantity = 1 } = req.body;
    
    console.log(`Freeing ${quantity} ${resource_type} resource for user: ${userId}`);

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

    // Determine which resource to update
    let field = '';
    if (resource_type === 'bed' || resource_type === 'general_bed') {
      field = 'general_beds_available';
    } else if (resource_type === 'icu' || resource_type === 'icu_bed') {
      field = 'icu_beds_available';
    } else if (resource_type === 'ventilator') {
      field = 'ventilators_available';
    } else if (resource_type === 'oxygen') {
      field = 'oxygen_supported_beds_available';
    } else {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid resource type. Use: bed, icu, ventilator, or oxygen' 
      });
    }

    // Check current available count
    const checkResult = await pool.query(
      `SELECT ${field} as available FROM hospital_resources WHERE hospital_id = $1`,
      [hospitalId]
    );

    if (checkResult.rows.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Hospital resources not found' 
      });
    }

    // Add the freed resource back (increase availability)
    const result = await pool.query(
      `UPDATE hospital_resources 
       SET ${field} = ${field} + $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE hospital_id = $2
       RETURNING *`,
      [quantity, hospitalId]
    );

    console.log(`Freed ${quantity} ${resource_type}(s). New available count updated.`);

    res.json({
      success: true,
      message: `${quantity} ${resource_type}(s) freed successfully. Resource is now available.`,
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Free resource error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  }
};


// ==================== ADDITIONAL HELPER METHODS ====================

exports.getAvailableResources = async (req, res) => {
  try {
    const { hospital_id } = req.params;

    const result = await pool.query(
      `SELECT 
        COALESCE(general_beds_total, 0) as general_beds_total,
        COALESCE(general_beds_available, 0) as general_beds_available,
        COALESCE(icu_beds_total, 0) as icu_beds_total,
        COALESCE(icu_beds_available, 0) as icu_beds_available,
        COALESCE(ventilators_total, 0) as ventilators_total,
        COALESCE(ventilators_available, 0) as ventilators_available,
        COALESCE(oxygen_supported_beds_total, 0) as oxygen_beds_total,
        COALESCE(oxygen_supported_beds_available, 0) as oxygen_beds_available
       FROM hospital_resources 
       WHERE hospital_id = $1`,
      [hospital_id]
    );

    if (result.rows.length === 0) {
      return res.json({
        success: true,
        data: {
          general_beds_total: 0,
          general_beds_available: 0,
          icu_beds_total: 0,
          icu_beds_available: 0,
          ventilators_total: 0,
          ventilators_available: 0,
          oxygen_beds_total: 0,
          oxygen_beds_available: 0,
        }
      });
    }

    res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Get available resources error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  }
};
// Add this to resourceController.js

// ==================== GET NEARBY HOSPITALS WITH RESOURCES ====================
// src/controllers/resourceController.js

// Make sure this is at the end of the file or properly exported
exports.getNearbyHospitals = async (req, res) => {
  try {
    const { lat, lng } = req.query;
    
    console.log(`📍 Fetching nearby hospitals for lat: ${lat}, lng: ${lng}`);
    
    const result = await pool.query(`
      SELECT 
        h.id, 
        h.name, 
        h.address, 
        h.city, 
        h.phone, 
        h.email,
        h.is_verified, 
        h.verification_status,
        COALESCE(hr.general_beds_total, 0) as total_beds,
        COALESCE(hr.general_beds_available, 0) as available_beds,
        COALESCE(hr.icu_beds_total, 0) as icu_beds,
        COALESCE(hr.icu_beds_available, 0) as available_icu,
        COALESCE(hr.ventilators_total, 0) as ventilator_count,
        COALESCE(hr.ventilators_available, 0) as available_ventilators,
        COALESCE(hr.oxygen_supported_beds_total, 0) as oxygen_beds_total,
        COALESCE(hr.oxygen_supported_beds_available, 0) as oxygen_beds_available,
        COALESCE(hr.blood_units, 0) as blood_units,
        '1.2 km' as distance,
        true as emergency_services,
        ARRAY['Cardiology', 'General Medicine', 'Emergency'] as specialties,
        CASE 
          WHEN hr.general_beds_total > 0 AND hr.general_beds_available > 0 THEN 4.5
          WHEN hr.general_beds_total > 0 THEN 4.0
          ELSE 3.5
        END as rating,
        COALESCE(hr.updated_at, h.created_at) as last_updated
      FROM hospitals h
      LEFT JOIN hospital_resources hr ON h.id = hr.hospital_id
      WHERE h.is_verified = true
      ORDER BY h.id
    `);
    
    console.log(`✅ Found ${result.rows.length} verified hospitals`);
    
    // Log resource summary for debugging
    result.rows.forEach(h => {
      console.log(`   - ${h.name}: ${h.available_beds}/${h.total_beds} beds, ${h.available_icu}/${h.icu_beds} ICU, ${h.blood_units} blood units`);
    });
    
    res.json({
      success: true,
      data: result.rows,
      count: result.rows.length
    });
  } catch (error) {
    console.error('❌ Nearby hospitals error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error',
      error: error.message 
    });
  }
};
// src/controllers/resourceController.js - Complete fixed blood request methods

// ==================== BLOOD REQUESTS ====================

exports.requestBlood = async (req, res) => {
  try {
    const userId = req.user.id;
    const { 
      hospital_id, 
      blood_group, 
      units_required,
      patient_name,
      hospital_address 
    } = req.body;

    console.log('🩸 Blood request:', { userId, hospital_id, blood_group, units_required });

    // Check if hospital exists
    const hospitalCheck = await pool.query(
      'SELECT id FROM hospitals WHERE id = $1',
      [hospital_id]
    );
    
    if (hospitalCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Hospital not found'
      });
    }

    // Check if blood is available
    const bloodCheck = await pool.query(
      'SELECT units_available FROM blood_bank WHERE hospital_id = $1 AND blood_group = $2',
      [hospital_id, blood_group]
    );
    
    if (bloodCheck.rows.length > 0) {
      const available = bloodCheck.rows[0].units_available || 0;
      const required = units_required || 1;
      if (available < required) {
        return res.status(400).json({
          success: false,
          message: `Not enough ${blood_group} blood available. Available: ${available}, Requested: ${required}`
        });
      }
    } else {
      return res.status(400).json({
        success: false,
        message: `Blood group ${blood_group} not available in this hospital`
      });
    }

    const result = await pool.query(
      `INSERT INTO blood_requests (
        user_id, hospital_id, blood_group, units_required,
        patient_name, hospital_address, status, request_date
      ) VALUES ($1, $2, $3, $4, $5, $6, 'pending', CURRENT_TIMESTAMP)
      RETURNING *`,
      [
        userId, hospital_id, blood_group, units_required || 1,
        patient_name || 'Patient', hospital_address || ''
      ]
    );

    console.log('✅ Blood request created:', result.rows[0]);

    res.status(201).json({
      success: true,
      message: 'Blood request submitted successfully',
      data: result.rows[0],
    });
  } catch (error) {
    console.error('❌ Request blood error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  }
};

exports.getMyBloodRequests = async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(
      `SELECT b.*, h.name as hospital_name
       FROM blood_requests b
       LEFT JOIN hospitals h ON b.hospital_id = h.id
       WHERE b.user_id = $1
       ORDER BY b.request_date DESC`,
      [userId]
    );

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error('Get my blood requests error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  }
};

exports.getHospitalBloodRequests = async (req, res) => {
  try {
    const userId = req.user.id;

    console.log('🩸 Getting blood requests for user:', userId);

    // Get hospital_id from user
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
    console.log('🏥 Hospital ID:', hospitalId);

    const result = await pool.query(
      `SELECT 
        br.*,
        u.name as user_name,
        u.phone as user_phone
       FROM blood_requests br
       LEFT JOIN users u ON br.user_id = u.id
       WHERE br.hospital_id = $1
       ORDER BY br.request_date DESC
       LIMIT 100`,
      [hospitalId]
    );

    console.log(`✅ Found ${result.rows.length} blood requests for hospital ${hospitalId}`);

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error('❌ Get hospital blood requests error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  }
};

exports.fulfillBloodRequest = async (req, res) => {
  const { requestId } = req.params;
  const userId = req.user.id;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    console.log(`🩸 Fulfilling blood request: ${requestId} for user: ${userId}`);

    // Get hospital id
    const hospitalResult = await client.query(
      'SELECT id FROM hospitals WHERE user_id = $1',
      [userId]
    );

    if (hospitalResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ 
        success: false, 
        message: 'Hospital not found' 
      });
    }

    const hospitalId = hospitalResult.rows[0].id;

    // Check if request exists and is pending
    const requestResult = await client.query(
      'SELECT * FROM blood_requests WHERE id = $1 AND hospital_id = $2 AND status = $3',
      [requestId, hospitalId, 'pending']
    );

    if (requestResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ 
        success: false, 
        message: 'Blood request not found or already processed' 
      });
    }

    const request = requestResult.rows[0];
    console.log('📋 Blood request details:', request);

    // Check if blood is available
    const bloodCheck = await client.query(
      'SELECT units_available FROM blood_bank WHERE hospital_id = $1 AND blood_group = $2',
      [hospitalId, request.blood_group]
    );

    if (bloodCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ 
        success: false, 
        message: `Blood group ${request.blood_group} not found in inventory. Please add blood stock first.` 
      });
    }

    const currentAvailable = bloodCheck.rows[0].units_available || 0;
    const requestedUnits = request.units_required || 1;

    if (currentAvailable < requestedUnits) {
      await client.query('ROLLBACK');
      return res.status(400).json({ 
        success: false, 
        message: `Insufficient blood. Available: ${currentAvailable} units, Requested: ${requestedUnits} units` 
      });
    }

    // Decrease blood stock
    await client.query(
      `UPDATE blood_bank 
       SET units_available = units_available - $1,
           last_updated = CURRENT_TIMESTAMP
       WHERE hospital_id = $2 AND blood_group = $3`,
      [requestedUnits, hospitalId, request.blood_group]
    );

    // Update request status to fulfilled
    const result = await client.query(
      `UPDATE blood_requests 
       SET status = 'fulfilled', 
           fulfilled_date = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [requestId]
    );

    await client.query('COMMIT');

    console.log(`✅ Blood request ${requestId} fulfilled successfully`);

    res.json({
      success: true,
      message: 'Blood request fulfilled successfully',
      data: result.rows[0],
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Fulfill blood request error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message,
      stack: error.stack
    });
  } finally {
    client.release();
  }
};

exports.rejectBloodRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    const userId = req.user.id;

    console.log(`❌ Rejecting blood request: ${requestId} for user: ${userId}`);

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

    // Check if request exists and is pending
    const requestResult = await pool.query(
      'SELECT * FROM blood_requests WHERE id = $1 AND hospital_id = $2 AND status = $3',
      [requestId, hospitalId, 'pending']
    );

    if (requestResult.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Blood request not found or already processed' 
      });
    }

    // Update the request status
    const result = await pool.query(
      `UPDATE blood_requests 
       SET status = 'rejected', 
           rejected_date = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [requestId]
    );

    console.log(`✅ Blood request ${requestId} rejected`);

    res.json({
      success: true,
      message: 'Blood request rejected',
      data: result.rows[0],
    });
  } catch (error) {
    console.error('❌ Reject blood request error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  }
};

// ==================== BLOOD BANK MANAGEMENT ====================

exports.getBloodStock = async (req, res) => {
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
      'SELECT * FROM blood_bank WHERE hospital_id = $1 ORDER BY blood_group',
      [hospitalId]
    );

    const summary = {
      total_units: result.rows.reduce((sum, row) => sum + (row.units_available || 0), 0),
      groups: result.rows.length
    };

    res.json({
      success: true,
      data: {
        blood_stock: result.rows,
        summary: summary
      }
    });
  } catch (error) {
    console.error('❌ Get blood stock error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  }
};
// src/controllers/resourceController.js - Add/Update these methods
// ==================== BLOOD BANK MANAGEMENT ====================

exports.addBloodStock = async (req, res) => {
  const { blood_group, units, expiry_date } = req.body;
  const userId = req.user.id;

  try {
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

    // Check if blood group already exists
    const existing = await pool.query(
      'SELECT id, units_available FROM blood_bank WHERE hospital_id = $1 AND blood_group = $2',
      [hospitalId, blood_group]
    );

    let result;
    if (existing.rows.length > 0) {
      // Update existing
      result = await pool.query(
        `UPDATE blood_bank 
         SET units_available = units_available + $1,
             expiry_date = COALESCE($2, expiry_date),
             last_updated = CURRENT_TIMESTAMP
         WHERE hospital_id = $3 AND blood_group = $4
         RETURNING *`,
        [units, expiry_date, hospitalId, blood_group]
      );
    } else {
      // Insert new
      result = await pool.query(
        `INSERT INTO blood_bank 
         (hospital_id, blood_group, units_available, units_used, expiry_date, minimum_threshold, created_at, last_updated)
         VALUES ($1, $2, $3, 0, $4, 10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         RETURNING *`,
        [hospitalId, blood_group, units, expiry_date]
      );
    }

    // Update total blood units in hospital_resources
    await pool.query(
      `UPDATE hospital_resources 
       SET blood_units = blood_units + $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE hospital_id = $2`,
      [units, hospitalId]
    );

    res.json({
      success: true,
      message: 'Blood stock added successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Add blood stock error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  }
};

exports.updateBloodStock = async (req, res) => {
  const { blood_group, units, expiry_date } = req.body;
  const userId = req.user.id;

  try {
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

    // Get current units to calculate difference
    const current = await pool.query(
      'SELECT units_available FROM blood_bank WHERE hospital_id = $1 AND blood_group = $2',
      [hospitalId, blood_group]
    );

    if (current.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Blood group not found' 
      });
    }

    const oldUnits = current.rows[0].units_available || 0;
    const diff = units - oldUnits;

    const result = await pool.query(
      `UPDATE blood_bank 
       SET units_available = $1,
           expiry_date = COALESCE($2, expiry_date),
           last_updated = CURRENT_TIMESTAMP
       WHERE hospital_id = $3 AND blood_group = $4
       RETURNING *`,
      [units, expiry_date, hospitalId, blood_group]
    );

    // Update total blood units in hospital_resources
    await pool.query(
      `UPDATE hospital_resources 
       SET blood_units = blood_units + $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE hospital_id = $2`,
      [diff, hospitalId]
    );

    res.json({
      success: true,
      message: 'Blood stock updated successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Update blood stock error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  }
};

exports.deleteBloodStock = async (req, res) => {
  const { blood_group } = req.params;
  const userId = req.user.id;

  try {
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

    // Get current units before deletion
    const current = await pool.query(
      'SELECT units_available FROM blood_bank WHERE hospital_id = $1 AND blood_group = $2',
      [hospitalId, blood_group]
    );

    if (current.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Blood group not found' 
      });
    }

    const units = current.rows[0].units_available || 0;

    // Delete the blood group
    await pool.query(
      'DELETE FROM blood_bank WHERE hospital_id = $1 AND blood_group = $2',
      [hospitalId, blood_group]
    );

    // Update total blood units in hospital_resources
    await pool.query(
      `UPDATE hospital_resources 
       SET blood_units = blood_units - $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE hospital_id = $2`,
      [units, hospitalId]
    );

    res.json({
      success: true,
      message: 'Blood stock deleted successfully'
    });
  } catch (error) {
    console.error('Delete blood stock error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  }
};

exports.getBloodAvailability = async (req, res) => {
  try {
    const hospitalId = req.params.hospitalId;
    
    if (!hospitalId) {
      return res.status(400).json({
        success: false,
        message: 'Hospital ID is required'
      });
    }

    const result = await pool.query(
      `SELECT 
        bb.blood_group,
        bb.units_available,
        bb.expiry_date,
        h.id as hospital_id,
        h.name as hospital_name
      FROM blood_bank bb
      LEFT JOIN hospitals h ON bb.hospital_id = h.id
      WHERE bb.hospital_id = $1 AND bb.units_available > 0
      ORDER BY bb.blood_group ASC`,
      [hospitalId]
    );
    
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Get blood availability error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  }
};
// src/controllers/resourceController.js

// ==================== GET BLOOD STOCK WITH EXPIRY ====================
exports.getBloodStockWithExpiry = async (req, res) => {
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

    // Get blood stock with expiry dates
    const result = await pool.query(
      `SELECT id, blood_group, units_available, expiry_date, created_at, last_updated
       FROM blood_bank 
       WHERE hospital_id = $1
       ORDER BY blood_group ASC, expiry_date ASC`,
      [hospitalId]
    );

    // Calculate summary
    let totalUnits = 0;
    let nearExpiry = 0;
    let expired = 0;
    const today = new Date();

    result.rows.forEach(item => {
      totalUnits += item.units_available || 0;
      
      if (item.expiry_date) {
        const expiryDate = new Date(item.expiry_date);
        const daysUntilExpiry = Math.ceil((expiryDate - today) / (1000 * 60 * 60 * 24));
        
        if (daysUntilExpiry < 0) {
          expired += item.units_available || 0;
        } else if (daysUntilExpiry < 7) {
          nearExpiry += item.units_available || 0;
        }
      }
    });

    res.json({
      success: true,
      data: {
        blood_stock: result.rows,
        notifications: [],
        summary: {
          total_units: totalUnits,
          near_expiry: nearExpiry,
          expired: expired,
          good: totalUnits - nearExpiry - expired
        }
      }
    });
  } catch (error) {
    console.error('Get blood stock with expiry error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  }
};

// ==================== ADD BLOOD STOCK WITH EXPIRY ====================

// ==================== GET BLOOD BANK ====================
exports.getBloodBank = async (req, res) => {
  try {
    const hospitalId = parseInt(req.params.hospitalId);

    const result = await pool.query(
      `SELECT id, blood_group, units_available, units_used, expiry_date, created_at, last_updated
       FROM blood_bank 
       WHERE hospital_id = $1
       ORDER BY blood_group ASC`,
      [hospitalId]
    );

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Get blood bank error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  }
};

// ==================== USE BLOOD UNITS ====================
exports.useBloodUnits = async (req, res) => {
  const { hospital_id, blood_group, units } = req.body;
  const userId = req.user.id;

  try {
    // Verify hospital ownership
    const hospitalResult = await pool.query(
      'SELECT id FROM hospitals WHERE user_id = $1 AND id = $2',
      [userId, hospital_id]
    );

    if (hospitalResult.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Hospital not found' 
      });
    }

    // Check if enough units are available
    const checkResult = await pool.query(
      'SELECT units_available FROM blood_bank WHERE hospital_id = $1 AND blood_group = $2',
      [hospital_id, blood_group]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: `Blood group ${blood_group} not found`
      });
    }

    const available = checkResult.rows[0].units_available || 0;
    if (available < units) {
      return res.status(400).json({
        success: false,
        message: `Insufficient units. Available: ${available}, Requested: ${units}`
      });
    }

    // Use blood units
    const result = await pool.query(
      `UPDATE blood_bank 
       SET units_available = units_available - $1,
           units_used = units_used + $1,
           last_updated = CURRENT_TIMESTAMP
       WHERE hospital_id = $2 AND blood_group = $3
       RETURNING *`,
      [units, hospital_id, blood_group]
    );

    // Update total blood units in hospital_resources
    await pool.query(
      `UPDATE hospital_resources 
       SET blood_units = blood_units - $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE hospital_id = $2`,
      [units, hospital_id]
    );

    res.json({
      success: true,
      message: `${units} units of ${blood_group} blood used successfully`,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Use blood units error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  }
};
// src/controllers/resourceController.js

// ==================== GET HOSPITAL BLOOD BANK ====================
exports.getHospitalBloodBank = async (req, res) => {
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
      `SELECT id, blood_group, units_available, units_used, expiry_date, created_at, last_updated
       FROM blood_bank 
       WHERE hospital_id = $1
       ORDER BY blood_group ASC`,
      [hospitalId]
    );

    // Calculate summary
    let totalUnits = 0;
    let nearExpiry = 0;
    let expired = 0;
    let good = 0;
    const today = new Date();

    result.rows.forEach(item => {
      const units = item.units_available || 0;
      totalUnits += units;
      
      if (item.expiry_date) {
        const expiryDate = new Date(item.expiry_date);
        const daysUntilExpiry = Math.ceil((expiryDate - today) / (1000 * 60 * 60 * 24));
        
        if (daysUntilExpiry < 0) {
          expired += units;
        } else if (daysUntilExpiry < 7) {
          nearExpiry += units;
        } else {
          good += units;
        }
      } else {
        good += units;
      }
    });

    res.json({
      success: true,
      data: {
        blood_stock: result.rows,
        summary: {
          total_units: totalUnits,
          near_expiry: nearExpiry,
          expired: expired,
          good: good
        }
      }
    });
  } catch (error) {
    console.error('Get hospital blood bank error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  }
};

// ==================== ADD BLOOD STOCK WITH EXPIRY ====================
exports.addBloodStockWithExpiry = async (req, res) => {
  const { blood_group, units, expiry_date, donor_name } = req.body;
  const userId = req.user.id;

  try {
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

    // Check if blood group already exists
    const existing = await pool.query(
      'SELECT id, units_available FROM blood_bank WHERE hospital_id = $1 AND blood_group = $2',
      [hospitalId, blood_group]
    );

    let result;
    if (existing.rows.length > 0) {
      // Update existing
      result = await pool.query(
        `UPDATE blood_bank 
         SET units_available = units_available + $1,
             expiry_date = $2,
             last_updated = CURRENT_TIMESTAMP
         WHERE hospital_id = $3 AND blood_group = $4
         RETURNING *`,
        [units, expiry_date, hospitalId, blood_group]
      );
    } else {
      // Insert new
      result = await pool.query(
        `INSERT INTO blood_bank 
         (hospital_id, blood_group, units_available, units_used, expiry_date, created_at, last_updated)
         VALUES ($1, $2, $3, 0, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         RETURNING *`,
        [hospitalId, blood_group, units, expiry_date]
      );
    }

    // Update total blood units in hospital_resources
    await pool.query(
      `UPDATE hospital_resources 
       SET blood_units = blood_units + $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE hospital_id = $2`,
      [units, hospitalId]
    );

    res.json({
      success: true,
      message: 'Blood stock added successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Add blood stock with expiry error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  }
};