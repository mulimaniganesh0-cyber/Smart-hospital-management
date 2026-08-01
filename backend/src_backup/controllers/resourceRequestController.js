// src/controllers/resourceRequestController.js
const { pool } = require('../config/database');

// Create a resource request (patient side)
exports.createResourceRequest = async (req, res) => {
  try {
    const userId = req.user.id;
    const { resource_type, quantity, description, hospital_id } = req.body;
    
    // Get patient details
    const patientResult = await pool.query(
      'SELECT id FROM patients WHERE user_id = $1',
      [userId]
    );
    
    let patientId = null;
    if (patientResult.rows.length > 0) {
      patientId = patientResult.rows[0].id;
    }
    
    // Get user details
    const userResult = await pool.query(
      'SELECT name, phone FROM users WHERE id = $1',
      [userId]
    );
    
    const userName = userResult.rows[0]?.name || 'Patient';
    const userPhone = userResult.rows[0]?.phone || '';
    
    const result = await pool.query(
      `INSERT INTO resource_requests (
        patient_id, user_id, hospital_id, resource_type, 
        quantity, description, patient_name, patient_phone, status
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')
       RETURNING *`,
      [patientId, userId, hospital_id, resource_type, quantity, description, userName, userPhone]
    );
    
    res.status(201).json({
      success: true,
      message: 'Resource request created successfully',
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Create resource request error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  }
};

// Get my resource requests (patient side)
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

// Get hospital resource requests (hospital side)
exports.getHospitalResourceRequests = async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Get hospital id
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
      `SELECT r.*, u.name as patient_name, u.phone as patient_phone
       FROM resource_requests r
       LEFT JOIN users u ON r.user_id = u.id
       WHERE r.hospital_id = $1 AND r.status = 'pending'
       ORDER BY r.created_at DESC`,
      [hospitalId]
    );
    
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

// Fulfill resource request (hospital side)
exports.fulfillResourceRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    
    const result = await pool.query(
      `UPDATE resource_requests 
       SET status = 'fulfilled', fulfilled_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND status = 'pending'
       RETURNING *`,
      [requestId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Request not found or already fulfilled' 
      });
    }
    
    res.json({
      success: true,
      message: 'Resource request fulfilled successfully',
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Fulfill resource request error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  }
};

// Reject resource request (hospital side)
exports.rejectResourceRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    
    const result = await pool.query(
      `UPDATE resource_requests 
       SET status = 'rejected'
       WHERE id = $1 AND status = 'pending'
       RETURNING *`,
      [requestId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Request not found or already processed' 
      });
    }
    
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

// Create blood request (patient side)
exports.createBloodRequest = async (req, res) => {
  try {
    const userId = req.user.id;
    const { hospital_id, blood_group, units_required, hospital_address } = req.body;
    
    // Get patient details
    const patientResult = await pool.query(
      'SELECT id FROM patients WHERE user_id = $1',
      [userId]
    );
    
    let patientId = null;
    if (patientResult.rows.length > 0) {
      patientId = patientResult.rows[0].id;
    }
    
    // Get user details
    const userResult = await pool.query(
      'SELECT name, phone FROM users WHERE id = $1',
      [userId]
    );
    
    const userName = userResult.rows[0]?.name || 'Patient';
    const userPhone = userResult.rows[0]?.phone || '';
    
    const result = await pool.query(
      `INSERT INTO blood_requests (
        patient_id, user_id, hospital_id, blood_group, units_required,
        patient_name, patient_phone, hospital_address, status
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')
       RETURNING *`,
      [patientId, userId, hospital_id, blood_group, units_required, userName, userPhone, hospital_address]
    );
    
    res.status(201).json({
      success: true,
      message: 'Blood request created successfully',
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Create blood request error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  }
};

// Get my blood requests (patient side)
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



// Reject blood request (hospital side)
exports.rejectBloodRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    
    const result = await pool.query(
      `UPDATE blood_requests 
       SET status = 'rejected'
       WHERE id = $1 AND status = 'pending'
       RETURNING *`,
      [requestId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Request not found or already processed' 
      });
    }
    
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
// src/controllers/resourceController.js - Fixed blood request methods

exports.getHospitalBloodRequests = async (req, res) => {
  try {
    const userId = req.user.id;

    console.log('🩸 Getting blood requests for user:', userId);

    // Get hospital_id from user - use the correct relationship
    const hospitalResult = await pool.query(
      'SELECT id FROM hospitals WHERE user_id = $1 OR id = $1',
      [userId]
    );

    if (hospitalResult.rows.length === 0) {
      // If no hospital found, try using the user's ID directly
      console.log('⚠️ No hospital found with user_id, trying to use hospital_id directly');
      // Try to find if there's a hospital with ID = userId
      const directResult = await pool.query(
        'SELECT id FROM hospitals WHERE id = $1',
        [userId]
      );
      
      if (directResult.rows.length === 0) {
        return res.status(404).json({ 
          success: false, 
          message: 'Hospital not found for this user' 
        });
      }
      
      var hospitalId = directResult.rows[0].id;
      console.log('🏥 Using direct hospital ID:', hospitalId);
    } else {
      var hospitalId = hospitalResult.rows[0].id;
      console.log('🏥 Hospital ID from user mapping:', hospitalId);
    }

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

    // Get hospital id - check both user_id and direct id
    let hospitalResult = await client.query(
      'SELECT id FROM hospitals WHERE user_id = $1',
      [userId]
    );

    let hospitalId;
    if (hospitalResult.rows.length === 0) {
      // Try direct ID match
      const directResult = await client.query(
        'SELECT id FROM hospitals WHERE id = $1',
        [userId]
      );
      if (directResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ 
          success: false, 
          message: 'Hospital not found for this user' 
        });
      }
      hospitalId = directResult.rows[0].id;
      console.log('🏥 Using direct hospital ID:', hospitalId);
    } else {
      hospitalId = hospitalResult.rows[0].id;
      console.log('🏥 Hospital ID from user mapping:', hospitalId);
    }

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
// src/controllers/resourceController.js

// ==================== BLOOD BANK ENDPOINTS ====================

exports.getBloodBank = async (req, res) => {
  try {
    const hospitalId = req.params.hospitalId || req.user?.id;
    
    console.log('🩸 Getting blood bank for hospital:', hospitalId);
    
    const result = await pool.query(
      `SELECT 
        id, 
        blood_group, 
        units_available, 
        last_updated,
        'good' as status
       FROM blood_bank 
       WHERE hospital_id = $1
       ORDER BY blood_group`,
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
    console.error('❌ Get blood bank error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error',
      error: error.message 
    });
  }
};

exports.useBlood = async (req, res) => {
  try {
    const { hospital_id, blood_group, units } = req.body;
    
    console.log('🩸 Using blood:', { hospital_id, blood_group, units });
    
    // Check if blood is available
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
    
    const currentUnits = checkResult.rows[0].units_available || 0;
    
    if (currentUnits < units) {
      return res.status(400).json({
        success: false,
        message: `Insufficient blood. Available: ${currentUnits}, Requested: ${units}`
      });
    }
    
    // Update blood stock
    const result = await pool.query(
      `UPDATE blood_bank 
       SET units_available = units_available - $1,
           last_updated = CURRENT_TIMESTAMP
       WHERE hospital_id = $2 AND blood_group = $3
       RETURNING *`,
      [units, hospital_id, blood_group]
    );
    
    console.log('✅ Blood used successfully');
    
    res.json({
      success: true,
      message: 'Blood used successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('❌ Use blood error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error',
      error: error.message 
    });
  }
};
// src/controllers/resourceController.js - Add/Update these methods

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
      `SELECT id, blood_group, units_available, units_used, 
              expiry_date, last_updated, created_at
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
        summary: {
          total_units: totalUnits,
          near_expiry: nearExpiry,
          expired: expired,
          blood_groups: result.rows.length
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

// ==================== ADD BLOOD STOCK ====================
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
    console.error('Add blood stock error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  }
};

// ==================== UPDATE BLOOD STOCK ====================
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
           expiry_date = $2,
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

// ==================== DELETE BLOOD STOCK ====================
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