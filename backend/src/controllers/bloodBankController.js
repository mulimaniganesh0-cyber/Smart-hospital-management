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
    
    const result = await pool.query(
      `INSERT INTO blood_bank (hospital_id, blood_group, units_available, last_updated)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
       ON CONFLICT (hospital_id, blood_group) 
       DO UPDATE SET units_available = EXCLUDED.units_available, last_updated = CURRENT_TIMESTAMP
       RETURNING *`,
      [hospitalId, bloodGroup, units]
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

// ==================== BLOOD EXPIRY MANAGEMENT ====================

// src/controllers/bloodBankController.js - Replace the addBloodWithExpiry method

exports.addBloodWithExpiry = async (req, res) => {
  try {
    const userId = req.user.id;
    const { 
      blood_group, 
      units, 
      expiry_date,
      donation_date,
      donor_name,
      donor_phone,
      batch_number
    } = req.body;

    console.log('Adding blood with expiry:', { blood_group, units, expiry_date, donor_name });

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
    const batchNum = batch_number || `BATCH${Date.now().toString().slice(-6)}${blood_group}`;

    // Check if blood group already exists for this hospital
    const existingResult = await pool.query(
      'SELECT id, units_available FROM blood_bank WHERE hospital_id = $1 AND blood_group = $2',
      [hospitalId, blood_group]
    );

    let result;
    if (existingResult.rows.length > 0) {
      // Update existing record - add units to existing stock
      const existingId = existingResult.rows[0].id;
      const currentUnits = existingResult.rows[0].units_available || 0;
      const newUnits = currentUnits + units;
      
      result = await pool.query(
        `UPDATE blood_bank 
         SET units_available = $1,
             expiry_date = COALESCE($2, expiry_date),
             batch_number = COALESCE($3, batch_number),
             donation_date = COALESCE($4, donation_date),
             donor_name = COALESCE($5, donor_name),
             last_updated = CURRENT_TIMESTAMP
         WHERE id = $6
         RETURNING *`,
        [newUnits, expiry_date, batchNum, donation_date || new Date(), donor_name || 'Unknown', existingId]
      );
      console.log(`Updated existing ${blood_group} stock: ${currentUnits} -> ${newUnits} units`);
    } else {
      // Insert new record
      result = await pool.query(
        `INSERT INTO blood_bank (
          hospital_id, blood_group, units_available, 
          expiry_date, batch_number, donation_date, donor_name,
          last_updated, minimum_threshold
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP, 10)
        RETURNING *`,
        [hospitalId, blood_group, units, expiry_date, batchNum, donation_date || new Date(), donor_name || 'Unknown']
      );
      console.log(`Added new ${blood_group} stock: ${units} units`);
    }

    // Add to donation history
    await pool.query(
      `INSERT INTO blood_donation_history (
        hospital_id, donor_name, donor_phone, blood_group, 
        units_donated, donation_date, expiry_date, batch_number
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [hospitalId, donor_name || 'Anonymous', donor_phone || '', blood_group, units, donation_date || new Date(), expiry_date, batchNum]
    );

    res.status(201).json({
      success: true,
      message: existingResult.rows.length > 0 
        ? `Blood stock updated successfully. Added ${units} units to existing ${blood_group} stock.`
        : 'Blood stock added successfully with expiry tracking',
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Add blood with expiry error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  }
};exports.addBloodWithExpiry = async (req, res) => {
  try {
    const userId = req.user.id;
    const { 
      blood_group, 
      units, 
      expiry_date,
      donation_date,
      donor_name,
      donor_phone,
      batch_number
    } = req.body;

    console.log('Adding blood with expiry:', { blood_group, units, expiry_date, donor_name });

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
    const batchNum = batch_number || `BATCH${Date.now().toString().slice(-6)}${blood_group}`;

    // Check if blood group already exists
    const existingResult = await pool.query(
      'SELECT id, units_available FROM blood_bank WHERE hospital_id = $1 AND blood_group = $2',
      [hospitalId, blood_group]
    );

    let result;
    if (existingResult.rows.length > 0) {
      // Update existing record
      const existingId = existingResult.rows[0].id;
      const currentUnits = existingResult.rows[0].units_available || 0;
      const newUnits = currentUnits + units;
      
      result = await pool.query(
        `UPDATE blood_bank 
         SET units_available = $1,
             expiry_date = COALESCE($2, expiry_date),
             batch_number = COALESCE($3, batch_number),
             donation_date = COALESCE($4, donation_date),
             donor_name = COALESCE($5, donor_name),
             last_updated = CURRENT_TIMESTAMP
         WHERE id = $6
         RETURNING *`,
        [newUnits, expiry_date, batchNum, donation_date || new Date(), donor_name || 'Unknown', existingId]
      );
      console.log(`Updated existing ${blood_group} stock: ${currentUnits} -> ${newUnits} units`);
    } else {
      // Insert new record
      result = await pool.query(
        `INSERT INTO blood_bank (
          hospital_id, blood_group, units_available, 
          expiry_date, batch_number, donation_date, donor_name,
          last_updated, minimum_threshold
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP, 10)
        RETURNING *`,
        [hospitalId, blood_group, units, expiry_date, batchNum, donation_date || new Date(), donor_name || 'Unknown']
      );
      console.log(`Added new ${blood_group} stock: ${units} units`);
    }

    await pool.query(
      `INSERT INTO blood_donation_history (
        hospital_id, donor_name, donor_phone, blood_group, 
        units_donated, donation_date, expiry_date, batch_number
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [hospitalId, donor_name || 'Anonymous', donor_phone || '', blood_group, units, donation_date || new Date(), expiry_date, batchNum]
    );

    res.status(201).json({
      success: true,
      message: existingResult.rows.length > 0 
        ? `Blood stock updated successfully. Added ${units} units to existing ${blood_group} stock.`
        : 'Blood stock added successfully with expiry tracking',
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Add blood with expiry error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  }
};

// src/controllers/bloodBankController.js - Replace the getBloodStockWithExpiry method

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

// src/controllers/bloodBankController.js - Replace the useBloodUnits method

exports.useBloodUnits = async (req, res) => {
  try {
    const userId = req.user.id;
    const { blood_group, units_required, used_for } = req.body;

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

    // First, check total available units
    const totalResult = await pool.query(
      `SELECT SUM(units_available) as total 
       FROM blood_bank 
       WHERE hospital_id = $1 AND blood_group = $2 
         AND (expiry_date IS NULL OR expiry_date >= CURRENT_DATE)
         AND units_available > 0`,
      [hospitalId, blood_group]
    );

    const totalAvailable = parseInt(totalResult.rows[0]?.total || 0);
    
    if (totalAvailable < units_required) {
      return res.status(400).json({ 
        success: false, 
        message: `Not enough ${blood_group} blood. Available: ${totalAvailable}, Requested: ${units_required}` 
      });
    }

    // Use FIFO (First In First Out) - use oldest blood first
    let remainingUnits = units_required;
    let usedBatches = [];

    while (remainingUnits > 0) {
      const result = await pool.query(
        `SELECT id, units_available, batch_number, expiry_date 
         FROM blood_bank 
         WHERE hospital_id = $1 AND blood_group = $2 
           AND units_available > 0 AND (expiry_date IS NULL OR expiry_date >= CURRENT_DATE)
         ORDER BY expiry_date ASC NULLS LAST
         LIMIT 1`,
        [hospitalId, blood_group]
      );

      if (result.rows.length === 0) {
        break;
      }

      const batch = result.rows[0];
      const unitsToUse = Math.min(batch.units_available, remainingUnits);

      await pool.query(
        `UPDATE blood_bank 
         SET units_available = units_available - $1 
         WHERE id = $2`,
        [unitsToUse, batch.id]
      );

      usedBatches.push({
        batch_number: batch.batch_number || 'N/A',
        units_used: unitsToUse,
        expiry_date: batch.expiry_date,
      });

      remainingUnits -= unitsToUse;
    }

    // Update donation history
    if (usedBatches.length > 0) {
      for (const batch of usedBatches) {
        await pool.query(
          `UPDATE blood_donation_history 
           SET status = 'used', used_at = CURRENT_TIMESTAMP, used_for = $1
           WHERE batch_number = $2 AND hospital_id = $3`,
          [used_for || 'Patient use', batch.batch_number, hospitalId]
        );
      }
    }

    res.json({
      success: true,
      message: `${units_required} unit(s) of ${blood_group} blood used successfully`,
      data: {
        blood_group,
        units_used: units_required,
        batches_used: usedBatches,
        used_for: used_for || 'Patient use',
      },
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

    const columnsCheck = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'blood_bank' 
      AND column_name = 'expiry_date'
    `);

    if (columnsCheck.rows.length === 0) {
      return res.json({
        success: true,
        message: 'Expiry tracking not enabled. Please run migration.',
        data: { critical: [], warning: [], notifications_created: 0 }
      });
    }

    const criticalResult = await pool.query(
      `SELECT blood_group, SUM(units_available) as total_units, 
              MIN(expiry_date) as nearest_expiry
       FROM blood_bank 
       WHERE hospital_id = $1 AND expiry_date <= CURRENT_DATE + INTERVAL '7 days' 
         AND expiry_date >= CURRENT_DATE AND units_available > 0
       GROUP BY blood_group`,
      [hospitalId]
    );

    const warningResult = await pool.query(
      `SELECT blood_group, SUM(units_available) as total_units, 
              MIN(expiry_date) as nearest_expiry
       FROM blood_bank 
       WHERE hospital_id = $1 AND expiry_date <= CURRENT_DATE + INTERVAL '30 days' 
         AND expiry_date > CURRENT_DATE + INTERVAL '7 days'
         AND units_available > 0
       GROUP BY blood_group`,
      [hospitalId]
    );

    let notificationsCreated = 0;

    try {
      for (const item of criticalResult.rows) {
        await pool.query(
          `INSERT INTO blood_expiry_notifications (
            hospital_id, blood_group, units_affected, 
            expiry_date, notification_type, message
          ) VALUES ($1, $2, $3, $4, 'critical', $5)`,
          [
            hospitalId,
            item.blood_group,
            item.total_units,
            item.nearest_expiry,
            `⚠️ CRITICAL: ${item.total_units} unit(s) of ${item.blood_group} blood expiring in 7 days!`
          ]
        );
        notificationsCreated++;
      }

      for (const item of warningResult.rows) {
        await pool.query(
          `INSERT INTO blood_expiry_notifications (
            hospital_id, blood_group, units_affected, 
            expiry_date, notification_type, message
          ) VALUES ($1, $2, $3, $4, 'warning', $5)`,
          [
            hospitalId,
            item.blood_group,
            item.total_units,
            item.nearest_expiry,
            `📋 ${item.total_units} unit(s) of ${item.blood_group} blood expiring in 30 days. Plan usage.`
          ]
        );
        notificationsCreated++;
      }
    } catch (err) {
      console.log('Notifications table not yet created, skipping notifications');
    }

    res.json({
      success: true,
      message: 'Blood expiry check completed',
      data: {
        critical: criticalResult.rows,
        warning: warningResult.rows,
        notifications_created: notificationsCreated,
      },
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

    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT 1 
        FROM information_schema.tables 
        WHERE table_name = 'blood_donation_history'
      )
    `);
    
    if (!tableCheck.rows[0].exists) {
      return res.json({
        success: true,
        data: [],
        message: 'Donation history table not yet created. Please run migration.',
      });
    }

    const result = await pool.query(
      `SELECT * FROM blood_donation_history 
       WHERE hospital_id = $1 
       ORDER BY donation_date DESC 
       LIMIT 100`,
      [hospitalId]
    );

    res.json({
      success: true,
      data: result.rows,
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

    const columnsCheck = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'blood_bank' 
      AND column_name IN ('expiry_date', 'batch_number', 'donation_date', 'donor_name')
    `);

    const hasExpiryColumns = columnsCheck.rows.length > 0;

    let query;
    if (hasExpiryColumns) {
      query = `
        SELECT 
          id, 
          blood_group, 
          units_available, 
          expiry_date, 
          batch_number, 
          donation_date, 
          donor_name,
          CASE 
            WHEN expiry_date IS NULL THEN 'good'
            WHEN expiry_date < CURRENT_DATE THEN 'expired'
            WHEN expiry_date <= CURRENT_DATE + INTERVAL '7 days' THEN 'critical'
            WHEN expiry_date <= CURRENT_DATE + INTERVAL '30 days' THEN 'warning'
            ELSE 'good'
          END as status,
          CASE 
            WHEN expiry_date IS NULL THEN NULL
            WHEN expiry_date < CURRENT_DATE THEN 0
            ELSE (expiry_date - CURRENT_DATE) 
          END as days_remaining
        FROM blood_bank 
        WHERE hospital_id = $1 AND units_available > 0
        ORDER BY expiry_date ASC NULLS LAST
      `;
    } else {
      query = `
        SELECT 
          id, 
          blood_group, 
          units_available,
          NULL as expiry_date, 
          NULL as batch_number, 
          NULL as donation_date, 
          NULL as donor_name,
          'good' as status,
          NULL as days_remaining
        FROM blood_bank 
        WHERE hospital_id = $1 AND units_available > 0
        ORDER BY blood_group
      `;
    }

    const result = await pool.query(query, [hospitalId]);

    let notifications = [];
    try {
      const notificationsResult = await pool.query(`
        SELECT * FROM blood_expiry_notifications 
        WHERE hospital_id = $1 AND is_read = false
        ORDER BY created_at DESC
        LIMIT 50
      `, [hospitalId]);
      notifications = notificationsResult.rows;
    } catch (err) {
      console.log('Notifications table not yet created');
    }

    res.json({
      success: true,
      data: {
        blood_stock: result.rows,
        notifications: notifications,
        summary: _getBloodSummary(result.rows),
      },
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
// src/controllers/bloodBankController.js - Add debug endpoint

// ==================== DEBUG: GET ALL BLOOD BANK ====================
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
// ==================== HELPER FUNCTIONS ====================

// At the bottom of bloodBankController.js

const _getBloodSummary = (bloodStock) => {
  const summary = {
    total_units: 0,
    by_group: {},
    by_status: {
      good: 0,
      warning: 0,
      critical: 0,
      expired: 0,
    },
    expiring_soon: [],
  };

  if (!bloodStock || bloodStock.length === 0) {
    return summary;
  }

  bloodStock.forEach((item) => {
    const units = item.units_available || 0;
    summary.total_units += units;
    
    if (!summary.by_group[item.blood_group]) {
      summary.by_group[item.blood_group] = 0;
    }
    summary.by_group[item.blood_group] += units;

    const status = item.status || 'good';
    if (status === 'good') summary.by_status.good += units;
    else if (status === 'warning') summary.by_status.warning += units;
    else if (status === 'critical') summary.by_status.critical += units;
    else if (status === 'expired') summary.by_status.expired += units;

    const daysRemaining = item.days_remaining;
    if (daysRemaining !== null && daysRemaining !== undefined && daysRemaining >= 0 && daysRemaining <= 30) {
      summary.expiring_soon.push({
        blood_group: item.blood_group,
        units: units,
        days_remaining: Math.round(daysRemaining),
        expiry_date: item.expiry_date,
      });
    }
  });

  return summary;
};