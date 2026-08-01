// src/controllers/bloodBankController.js
const { pool } = require('../config/database');

// ==================== PUBLIC ROUTES ====================

exports.getAllBloodBanks = async (req, res) => {
  try {
    const { city } = req.query;
    
    let query = `
      SELECT 
        bb.*, 
        h.name as hospital_name, 
        h.address, 
        h.city, 
        h.phone
      FROM blood_bank bb
      JOIN hospitals h ON bb.hospital_id = h.id
      WHERE h.is_verified = true
    `;
    
    const params = [];
    if (city) {
      query += ` AND h.city ILIKE $1`;
      params.push(`%${city}%`);
    }
    
    query += ` ORDER BY h.name, bb.blood_group`;
    
    const result = await pool.query(query, params);
    
    const grouped = {};
    const allBanks = [];
    
    result.rows.forEach(row => {
      allBanks.push(row);
      if (!grouped[row.blood_group]) {
        grouped[row.blood_group] = [];
      }
      grouped[row.blood_group].push(row);
    });
    
    res.json({
      success: true,
      data: grouped,
      all_banks: allBanks,
    });
  } catch (error) {
    console.error('Get all blood banks error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  }
};

exports.getBloodAvailability = async (req, res) => {
  try {
    const { hospitalId } = req.params;
    
    const hospitalIdNum = parseInt(hospitalId);
    if (isNaN(hospitalIdNum)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid hospital ID' 
      });
    }
    
    const result = await pool.query(
      `SELECT blood_group, units_available, minimum_threshold 
       FROM blood_bank 
       WHERE hospital_id = $1
       ORDER BY blood_group`,
      [hospitalIdNum]
    );
    
    res.json({
      success: true,
      data: result.rows,
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

// ==================== BLOOD REQUEST (PATIENT) ====================

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

// ==================== UPDATE BLOOD STOCK ====================

exports.updateBloodStock = async (req, res) => {
  try {
    const userId = req.user.id;
    const { bloodGroup, units } = req.body;
    
    console.log('Updating blood stock:', { userId, bloodGroup, units });
    
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
    
    const checkResult = await pool.query(
      'SELECT units_available FROM blood_bank WHERE hospital_id = $1 AND blood_group = $2',
      [hospitalId, bloodGroup]
    );
    
    let result;
    if (checkResult.rows.length > 0) {
      result = await pool.query(
        `UPDATE blood_bank 
         SET units_available = $1, last_updated = CURRENT_TIMESTAMP
         WHERE hospital_id = $2 AND blood_group = $3
         RETURNING *`,
        [units, hospitalId, bloodGroup]
      );
    } else {
      result = await pool.query(
        `INSERT INTO blood_bank (hospital_id, blood_group, units_available, last_updated, minimum_threshold)
         VALUES ($1, $2, $3, CURRENT_TIMESTAMP, 10)
         RETURNING *`,
        [hospitalId, bloodGroup, units]
      );
    }
    
    // Update hospital_resources
    await pool.query(
      `UPDATE hospital_resources 
       SET blood_units = COALESCE(blood_units, 0) + $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE hospital_id = $2`,
      [units, hospitalId]
    );
    
    res.json({
      success: true,
      message: 'Blood stock updated successfully',
      data: result.rows[0],
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

// ==================== ADD BLOOD WITH EXPIRY ====================

exports.addBloodWithExpiry = async (req, res) => {
  try {
    const userId = req.user.id;
    const { blood_group, units, expiry_date, donor_name } = req.body;

    console.log('🩸 Adding blood:', { blood_group, units, expiry_date, donor_name });

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

    // Check if exists
    const existing = await pool.query(
      'SELECT id, units_available FROM blood_bank WHERE hospital_id = $1 AND blood_group = $2',
      [hospitalId, blood_group]
    );

    let result;
    if (existing.rows.length > 0) {
      // Update - REMOVED batch_number, donor_name columns if they don't exist
      result = await pool.query(
        `UPDATE blood_bank 
         SET units_available = units_available + $1,
             expiry_date = $2,
             last_updated = CURRENT_TIMESTAMP
         WHERE hospital_id = $3 AND blood_group = $4
         RETURNING *`,
        [units, expiry_date || null, hospitalId, blood_group]
      );
    } else {
      // Insert - REMOVED batch_number, donor_name columns
      result = await pool.query(
        `INSERT INTO blood_bank 
         (hospital_id, blood_group, units_available, expiry_date, minimum_threshold)
         VALUES ($1, $2, $3, $4, 10)
         RETURNING *`,
        [hospitalId, blood_group, units, expiry_date || null]
      );
    }

    // Update hospital_resources
    await pool.query(
      `UPDATE hospital_resources 
       SET blood_units = COALESCE(blood_units, 0) + $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE hospital_id = $2`,
      [units, hospitalId]
    );

    console.log('✅ Blood added successfully');

    res.json({
      success: true,
      message: 'Blood stock added successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('❌ Add blood with expiry error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// ==================== EXPIRY NOTIFICATIONS ====================

exports.getBloodExpiryNotifications = async (req, res) => {
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
      `SELECT * FROM blood_expiry_notifications 
       WHERE hospital_id = $1 
       ORDER BY created_at DESC 
       LIMIT 50`,
      [hospitalId]
    );

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error('Get blood expiry notifications error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  }
};

exports.markNotificationRead = async (req, res) => {
  try {
    const { notificationId } = req.params;
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
      `UPDATE blood_expiry_notifications 
       SET is_read = true 
       WHERE id = $1 AND hospital_id = $2
       RETURNING *`,
      [notificationId, hospitalId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Notification not found' 
      });
    }

    res.json({
      success: true,
      message: 'Notification marked as read',
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Mark notification read error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  }
};

exports.markAllNotificationsRead = async (req, res) => {
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

    await pool.query(
      `UPDATE blood_expiry_notifications 
       SET is_read = true 
       WHERE hospital_id = $1 AND is_read = false`,
      [hospitalId]
    );

    res.json({
      success: true,
      message: 'All notifications marked as read',
    });
  } catch (error) {
    console.error('Mark all notifications read error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  }
};

// ==================== DEBUG ====================

exports.debugBloodBank = async (req, res) => {
  try {
    const userId = req.user.id;
    
    console.log('🔍 Debug: Getting hospital for user:', userId);
    
    const hospitalResult = await pool.query(
      'SELECT id FROM hospitals WHERE user_id = $1',
      [userId]
    );

    if (hospitalResult.rows.length === 0) {
      console.log('❌ Hospital not found for user:', userId);
      return res.status(404).json({
        success: false,
        message: 'Hospital not found'
      });
    }

    const hospitalId = hospitalResult.rows[0].id;
    console.log('🏥 Hospital ID:', hospitalId);

    const result = await pool.query(
      'SELECT * FROM blood_bank WHERE hospital_id = $1',
      [hospitalId]
    );

    console.log('📊 Found', result.rows.length, 'blood records');
    
    res.json({
      success: true,
      data: {
        hospital_id: hospitalId,
        blood_bank: result.rows,
        count: result.rows.length
      }
    });
  } catch (error) {
    console.error('❌ Debug blood bank error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
      stack: error.stack
    });
  }
};

exports.debugGetAllBloodBank = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM blood_bank ORDER BY hospital_id, blood_group`
    );
    
    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error('Debug blood bank error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  }
};

// ==================== GET BLOOD STOCK WITH EXPIRY ====================
exports.getBloodStockWithExpiry = async (req, res) => {
  try {
    const userId = req.user.id;

    // Get hospital ID from user
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

    // Get blood stock with expiry - REMOVED batch_number column
    const result = await pool.query(
      `SELECT 
        id,
        blood_group,
        units_available as units,
        expiry_date,
        last_updated as updated_at
       FROM blood_bank 
       WHERE hospital_id = $1
       ORDER BY expiry_date ASC NULLS LAST`,
      [hospitalId]
    );

    // Process the data
    const stock = result.rows.map(row => {
      let daysUntilExpiry = null;
      let isExpiringSoon = false;
      let status = 'Good';
      
      if (row.expiry_date) {
        const expiry = new Date(row.expiry_date);
        const now = new Date();
        daysUntilExpiry = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
        isExpiringSoon = daysUntilExpiry <= 7;
        if (daysUntilExpiry <= 0) status = 'Expired';
        else if (daysUntilExpiry <= 7) status = 'Expiring Soon';
        else status = 'Good';
      }
      
      return {
        ...row,
        days_until_expiry: daysUntilExpiry,
        is_expiring_soon: isExpiringSoon,
        status: status,
        batch_number: `BATCH-${row.id}`, // Generate batch number dynamically
      };
    });

    res.json({
      success: true,
      data: stock,
      count: stock.length
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

// ==================== USE BLOOD UNITS ====================
exports.useBloodUnits = async (req, res) => {
  try {
    const userId = req.user.id;
    const { blood_group, units } = req.body;

    console.log('🩸 Using blood:', { blood_group, units });

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

    // Check if enough units available
    const checkResult = await pool.query(
      'SELECT units_available FROM blood_bank WHERE hospital_id = $1 AND blood_group = $2',
      [hospitalId, blood_group]
    );

    if (checkResult.rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: `Blood group ${blood_group} not found in inventory`
      });
    }

    const available = checkResult.rows[0].units_available || 0;
    if (available < units) {
      return res.status(400).json({
        success: false,
        message: `Not enough ${blood_group} blood. Available: ${available}, Requested: ${units}`
      });
    }

    // Update blood stock
    const result = await pool.query(
      `UPDATE blood_bank 
       SET units_available = units_available - $1,
           last_updated = CURRENT_TIMESTAMP
       WHERE hospital_id = $2 AND blood_group = $3
       RETURNING *`,
      [units, hospitalId, blood_group]
    );

    // Update hospital_resources
    await pool.query(
      `UPDATE hospital_resources 
       SET blood_units = COALESCE(blood_units, 0) - $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE hospital_id = $2`,
      [units, hospitalId]
    );

    res.json({
      success: true,
      message: `${units} unit(s) of ${blood_group} blood used successfully`,
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

// ==================== GET DONATION HISTORY ====================
exports.getDonationHistory = async (req, res) => {
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
      `SELECT * FROM blood_bank 
       WHERE hospital_id = $1 
       ORDER BY last_updated DESC 
       LIMIT 50`,
      [hospitalId]
    );

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Get donation history error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// ==================== CHECK BLOOD EXPIRY ====================
exports.checkBloodExpiry = async (req, res) => {
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
      `SELECT id, blood_group, units_available, expiry_date,
       EXTRACT(DAY FROM (expiry_date - CURRENT_DATE)) as days_until_expiry
       FROM blood_bank 
       WHERE hospital_id = $1 
       AND expiry_date IS NOT NULL
       AND expiry_date <= CURRENT_DATE + INTERVAL '7 days'
       ORDER BY expiry_date ASC`,
      [hospitalId]
    );

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Check blood expiry error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};