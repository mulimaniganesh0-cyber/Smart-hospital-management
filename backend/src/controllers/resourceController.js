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

    console.log('Blood request:', { userId, hospital_id, blood_group, units_required });

    // Check if blood is available
    const bloodCheck = await pool.query(
      'SELECT units_available FROM blood_bank WHERE hospital_id = $1 AND blood_group = $2',
      [hospital_id, blood_group]
    );
    
    if (bloodCheck.rows.length > 0) {
      const available = bloodCheck.rows[0].units_available || 0;
      if (available < (units_required || 1)) {
        return res.status(400).json({
          success: false,
          message: `Not enough ${blood_group} blood available. Available: ${available}, Requested: ${units_required || 1}`
        });
      }
    }

    const patientResult = await pool.query(
      'SELECT id FROM patients WHERE user_id = $1',
      [userId]
    );

    let patientId = null;
    if (patientResult.rows.length > 0) {
      patientId = patientResult.rows[0].id;
    }

    const result = await pool.query(
      `INSERT INTO blood_requests (
        patient_id, user_id, hospital_id, blood_group, units_required,
        patient_name, hospital_address, status, request_date
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', CURRENT_TIMESTAMP)
      RETURNING *`,
      [
        patientId, userId, hospital_id, blood_group, units_required || 1,
        patient_name || 'Patient', hospital_address || ''
      ]
    );

    console.log('Blood request created:', result.rows[0]);

    res.status(201).json({
      success: true,
      message: 'Blood request submitted successfully',
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Request blood error:', error);
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

    console.log('Getting blood requests for user:', userId);

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
      `SELECT b.*, u.name as patient_name, u.phone as patient_phone
       FROM blood_requests b
       LEFT JOIN users u ON b.user_id = u.id
       WHERE b.hospital_id = $1
       ORDER BY b.request_date DESC
       LIMIT 100`,
      [hospitalId]
    );

    console.log(`Found ${result.rows.length} blood requests for hospital ${hospitalId}`);

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error('Get hospital blood requests error:', error);
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

    console.log(`Fulfilling blood request: ${requestId}`);

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

    // Check if enough blood is available
    const checkResult = await client.query(
      `SELECT units_available FROM blood_bank 
       WHERE hospital_id = $1 AND blood_group = $2`,
      [hospitalId, request.blood_group]
    );

    if (checkResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ 
        success: false, 
        message: `Blood group ${request.blood_group} not found in hospital inventory` 
      });
    }

    const currentAvailable = checkResult.rows[0].units_available || 0;
    if (currentAvailable < request.units_required) {
      await client.query('ROLLBACK');
      return res.status(400).json({ 
        success: false, 
        message: `Insufficient blood. Available: ${currentAvailable}, Requested: ${request.units_required}` 
      });
    }

    // Decrease blood stock
    await client.query(
      `UPDATE blood_bank 
       SET units_available = units_available - $1,
           last_updated = CURRENT_TIMESTAMP
       WHERE hospital_id = $2 AND blood_group = $3`,
      [request.units_required, hospitalId, request.blood_group]
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

    console.log(`Blood request ${requestId} fulfilled successfully`);

    res.json({
      success: true,
      message: 'Blood request fulfilled successfully',
      data: result.rows[0],
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Fulfill blood request error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  } finally {
    client.release();
  }
};

exports.rejectBloodRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    const userId = req.user.id;

    console.log(`Rejecting blood request: ${requestId}`);

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
      `UPDATE blood_requests 
       SET status = 'rejected', rejected_date = CURRENT_TIMESTAMP
       WHERE id = $1 AND hospital_id = $2 AND status = 'pending'
       RETURNING *`,
      [requestId, hospitalId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Blood request not found or already processed' 
      });
    }

    console.log(`Blood request ${requestId} rejected`);

    res.json({
      success: true,
      message: 'Blood request rejected',
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Reject blood request error:', error);
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