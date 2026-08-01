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

// Get hospital blood requests (hospital side)
exports.getHospitalBloodRequests = async (req, res) => {
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
      `SELECT b.*, u.name as patient_name, u.phone as patient_phone
       FROM blood_requests b
       LEFT JOIN users u ON b.user_id = u.id
       WHERE b.hospital_id = $1 AND b.status = 'pending'
       ORDER BY b.request_date DESC`,
      [hospitalId]
    );
    
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

// Fulfill blood request (hospital side)
exports.fulfillBloodRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    
    // Start transaction
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // Update blood request
      const result = await client.query(
        `UPDATE blood_requests 
         SET status = 'fulfilled', fulfilled_date = CURRENT_TIMESTAMP
         WHERE id = $1 AND status = 'pending'
         RETURNING *`,
        [requestId]
      );
      
      if (result.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ 
          success: false, 
          message: 'Request not found or already fulfilled' 
        });
      }
      
      // Update blood bank stock
      const bloodRequest = result.rows[0];
      await client.query(
        `UPDATE blood_bank 
         SET units_available = units_available - $1,
             last_updated = CURRENT_TIMESTAMP
         WHERE hospital_id = $2 AND blood_group = $3`,
        [bloodRequest.units_required, bloodRequest.hospital_id, bloodRequest.blood_group]
      );
      
      await client.query('COMMIT');
      
      res.json({
        success: true,
        message: 'Blood request fulfilled successfully',
        data: result.rows[0],
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Fulfill blood request error:', error);
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