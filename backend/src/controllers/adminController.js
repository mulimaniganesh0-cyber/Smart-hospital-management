// src/controllers/adminController.js
const { pool } = require('../config/database');
const User = require('../models/User');
const Hospital = require('../models/Hospital');
const { createNotification, emitNotification } = require('../services/notificationService');

exports.getAllUsers = async (req, res) => {
  try {
    const { page = 1, limit = 20, userType } = req.query;
    
    let query = `
      SELECT u.id, u.name, u.email, u.phone, u.user_type, u.is_verified, u.created_at,
             h.id as hospital_id, h.name as hospital_name, h.registration_number, 
             h.address, h.city, h.verification_status, h.is_verified as hospital_verified
      FROM users u
      LEFT JOIN hospitals h ON u.id = h.user_id
      WHERE u.user_type = $1
      ORDER BY u.created_at DESC
      LIMIT $2 OFFSET $3
    `;
    
    const params = [userType || 'hospital', parseInt(limit), (parseInt(page) - 1) * parseInt(limit)];
    const result = await pool.query(query, params);
    
    const users = result.rows.map(row => {
      if (row.user_type === 'hospital') {
        return {
          id: row.hospital_id,
          name: row.hospital_name || row.name,
          email: row.email,
          phone: row.phone,
          registration_number: row.registration_number,
          address: row.address,
          city: row.city,
          verification_status: row.verification_status || 'pending',
          is_verified: row.hospital_verified || false,
          created_at: row.created_at,
          user_id: row.id
        };
      }
      return row;
    });
    
    res.json({
      success: true,
      count: users.length,
      page: parseInt(page),
      data: users,
    });
  } catch (error) {
    console.error('Get all users error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

exports.getDashboardStats = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        (SELECT COUNT(*) FROM users WHERE user_type = 'hospital') as total_hospitals,
        (SELECT COUNT(*) FROM hospitals WHERE verification_status = 'pending') as pending_verification,
        (SELECT COUNT(*) FROM users WHERE user_type != 'admin') as total_users,
        (SELECT COUNT(*) FROM emergency_requests WHERE status = 'pending') as active_emergencies,
        (SELECT COUNT(*) FROM users WHERE created_at > NOW() - INTERVAL '30 days') as new_users,
        (SELECT COUNT(*) FROM hospitals WHERE created_at > NOW() - INTERVAL '30 days') as new_hospitals,
        (SELECT COUNT(*) FROM emergency_requests WHERE created_at > NOW() - INTERVAL '7 days') as new_emergencies
    `);
    
    res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

exports.verifyHospital = async (req, res) => {
  const client = await pool.connect();
  try {
    const { hospitalId } = req.params;
    const { adminNotes } = req.body;
    
    console.log('Verifying hospital:', hospitalId);
    
    await client.query('BEGIN');
    const checkResult = await client.query(
      'SELECT * FROM hospitals WHERE id = $1',
      [hospitalId]
    );
    
    if (checkResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Hospital not found' });
    }
    
    const result = await client.query(
      `UPDATE hospitals 
       SET is_verified = true, 
           verification_status = 'verified', 
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [hospitalId]
    );
    
    const hospital = result.rows[0];
    const notification = await createNotification({
      db: client,
      recipientUserId: hospital.user_id,
      hospitalId: hospital.id,
      type: 'hospital_verified',
      priority: 'high',
      relatedType: 'hospital',
      relatedId: hospital.id,
      title: 'HOSPITAL VERIFIED',
      message: 'Your hospital has been verified by the administrator. You can now use hospital management features.',
    });
    await client.query('COMMIT');
    emitNotification(req.app.get('io'), notification);
    res.json({
      success: true,
      message: 'Hospital verified successfully',
      data: hospital,
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Verify hospital error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  } finally { client.release(); }
};

// Keep a rejected registration in the real hospital record so that it can be
// reviewed later; never fabricate a rejection reason when the admin omitted it.
exports.rejectHospital = async (req, res) => {
  const client = await pool.connect();
  try {
    const { hospitalId } = req.params;
    const reason = String(req.body.reason || req.body.adminNotes || '').trim();
    await client.query('BEGIN');
    const result = await client.query(
      `UPDATE hospitals SET is_verified=FALSE, verification_status='rejected', updated_at=CURRENT_TIMESTAMP
       WHERE id=$1 RETURNING *`, [hospitalId]);
    if (!result.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Hospital not found' });
    }
    const hospital = result.rows[0];
    const notification = await createNotification({
      db: client, recipientUserId: hospital.user_id, hospitalId: hospital.id,
      type: 'hospital_verification_rejected', priority: 'high', relatedType: 'hospital', relatedId: hospital.id,
      title: 'HOSPITAL VERIFICATION REJECTED',
      message: reason ? `Your hospital verification request was rejected. Reason: ${reason}` : 'Your hospital verification request was rejected.',
    });
    await client.query('COMMIT');
    emitNotification(req.app.get('io'), notification);
    res.json({ success: true, message: 'Hospital verification rejected', data: hospital });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Reject hospital error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  } finally { client.release(); }
};

// ==================== ADMIN HOSPITAL RESOURCE MANAGEMENT ====================

// Get hospital resources for admin
exports.getHospitalResources = async (req, res) => {
  try {
    const { hospitalId } = req.params;
    
    const result = await pool.query(
      `SELECT 
        h.id, h.name, h.address, h.phone, h.email, h.city, h.state, h.is_verified,
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
       WHERE h.id = $1`,
      [hospitalId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Hospital not found' });
    }
    
    res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Get hospital resources error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// Update hospital resources by admin
exports.updateHospitalResources = async (req, res) => {
  try {
    const { hospitalId } = req.params;
    const resources = req.body;
    
    console.log('Admin updating resources for hospital:', hospitalId);
    console.log('Resources:', resources);
    
    // Check if hospital exists
    const hospitalCheck = await pool.query(
      'SELECT id FROM hospitals WHERE id = $1',
      [hospitalId]
    );
    
    if (hospitalCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Hospital not found' });
    }
    
    // Build update query
    const updates = [];
    const values = [];
    let paramIndex = 1;
    
    const fieldMap = {
      'general_beds_total': 'general_beds_total',
      'general_beds_available': 'general_beds_available',
      'icu_beds_total': 'icu_beds_total',
      'icu_beds_available': 'icu_beds_available',
      'ventilators_total': 'ventilators_total',
      'ventilators_available': 'ventilators_available',
      'oxygen_beds_total': 'oxygen_supported_beds_total',
      'oxygen_beds_available': 'oxygen_supported_beds_available',
    };
    
    for (const [key, value] of Object.entries(resources)) {
      const dbField = fieldMap[key];
      if (dbField !== undefined && value !== undefined) {
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
    
    const result = await pool.query(query, values);
    
    res.json({
      success: true,
      message: 'Hospital resources updated successfully',
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Update hospital resources error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// Get all hospitals with resource details for admin
exports.getAllHospitalsWithResources = async (req, res) => {
  try {
    const { page = 1, limit = 20, city, verified } = req.query;
    
    let query = `
      SELECT 
        h.id, h.name, h.address, h.city, h.phone, h.email, 
        h.is_verified, h.verification_status, h.created_at,
        COALESCE(hr.general_beds_total, 0) as general_beds_total,
        COALESCE(hr.general_beds_available, 0) as general_beds_available,
        COALESCE(hr.icu_beds_total, 0) as icu_beds_total,
        COALESCE(hr.icu_beds_available, 0) as icu_beds_available,
        COALESCE(hr.ventilators_total, 0) as ventilators_total,
        COALESCE(hr.ventilators_available, 0) as ventilators_available,
        COALESCE(hr.oxygen_supported_beds_total, 0) as oxygen_beds_total,
        COALESCE(hr.oxygen_supported_beds_available, 0) as oxygen_beds_available,
        COALESCE((SELECT CAST(SUM(units_available) AS INTEGER) FROM blood_bank WHERE hospital_id = h.id), 0) as blood_units
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
    } else if (verified === 'false') {
      query += ` AND h.is_verified = false`;
    }
    
    query += ` ORDER BY h.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(parseInt(limit), (parseInt(page) - 1) * parseInt(limit));
    
    const result = await pool.query(query, params);
    
    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total FROM hospitals
    `;
    const countResult = await pool.query(countQuery);
    
    res.json({
      success: true,
      count: result.rows.length,
      total: parseInt(countResult.rows[0].total),
      page: parseInt(page),
      totalPages: Math.ceil(parseInt(countResult.rows[0].total) / parseInt(limit)),
      data: result.rows,
    });
  } catch (error) {
    console.error('Get all hospitals error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// Get blood bank for admin
exports.getHospitalBloodBank = async (req, res) => {
  try {
    const { hospitalId } = req.params;
    
    const result = await pool.query(
      `SELECT blood_group, units_available, minimum_threshold, last_updated
       FROM blood_bank 
       WHERE hospital_id = $1
       ORDER BY blood_group`,
      [hospitalId]
    );
    
    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error('Get hospital blood bank error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// Update blood bank by admin
exports.updateBloodBank = async (req, res) => {
  try {
    const { hospitalId } = req.params;
    const { blood_group, units_available } = req.body;
    
    const result = await pool.query(
      `INSERT INTO blood_bank (hospital_id, blood_group, units_available, last_updated)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
       ON CONFLICT (hospital_id, blood_group) 
       DO UPDATE SET units_available = EXCLUDED.units_available, last_updated = CURRENT_TIMESTAMP
       RETURNING *`,
      [hospitalId, blood_group, units_available]
    );
    
    res.json({
      success: true,
      message: 'Blood bank updated successfully',
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Update blood bank error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// Delete hospital (soft delete or hard delete)
exports.deleteHospital = async (req, res) => {
  try {
    const { hospitalId } = req.params;
    const { reason } = req.body;
    
    console.log('Deleting hospital:', hospitalId, 'Reason:', reason);
    
    // Get hospital details first
    const hospitalResult = await pool.query(
      'SELECT * FROM hospitals WHERE id = $1',
      [hospitalId]
    );
    
    if (hospitalResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Hospital not found' });
    }
    
    const hospital = hospitalResult.rows[0];
    
    // Start transaction
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // Delete related data
      await client.query('DELETE FROM hospital_resources WHERE hospital_id = $1', [hospitalId]);
      await client.query('DELETE FROM blood_bank WHERE hospital_id = $1', [hospitalId]);
      await client.query('DELETE FROM doctors WHERE hospital_id = $1', [hospitalId]);
      await client.query('DELETE FROM appointments WHERE hospital_id = $1', [hospitalId]);
      await client.query('DELETE FROM emergency_requests WHERE hospital_id = $1', [hospitalId]);
      await client.query('DELETE FROM ambulances WHERE hospital_id = $1', [hospitalId]);
      
      // Delete hospital
      await client.query('DELETE FROM hospitals WHERE id = $1', [hospitalId]);
      
      // Delete user
      await client.query('DELETE FROM users WHERE id = $1', [hospital.user_id]);
      
      await client.query('COMMIT');
      
      res.json({
        success: true,
        message: 'Hospital deleted successfully',
        data: {
          hospital_name: hospital.name,
          hospital_id: hospital.id,
        }
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Delete hospital error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};
// src/controllers/adminController.js - Add this method

exports.deleteHospital = async (req, res) => {
  try {
    const { hospitalId } = req.params;
    const { reason } = req.body;
    
    console.log('Deleting hospital:', hospitalId, 'Reason:', reason);
    
    // Get hospital details first
    const hospitalResult = await pool.query(
      'SELECT * FROM hospitals WHERE id = $1',
      [hospitalId]
    );
    
    if (hospitalResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Hospital not found' });
    }
    
    const hospital = hospitalResult.rows[0];
    
    // Start transaction
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // Delete related data
      await client.query('DELETE FROM hospital_resources WHERE hospital_id = $1', [hospitalId]);
      await client.query('DELETE FROM blood_bank WHERE hospital_id = $1', [hospitalId]);
      await client.query('DELETE FROM doctors WHERE hospital_id = $1', [hospitalId]);
      await client.query('DELETE FROM appointments WHERE hospital_id = $1', [hospitalId]);
      await client.query('DELETE FROM emergency_requests WHERE hospital_id = $1', [hospitalId]);
      await client.query('DELETE FROM ambulances WHERE hospital_id = $1', [hospitalId]);
      
      // Delete hospital
      await client.query('DELETE FROM hospitals WHERE id = $1', [hospitalId]);
      
      // Delete user
      await client.query('DELETE FROM users WHERE id = $1', [hospital.user_id]);
      
      await client.query('COMMIT');
      
      res.json({
        success: true,
        message: 'Hospital deleted successfully',
        data: {
          hospital_name: hospital.name,
          hospital_id: hospital.id,
        }
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Delete hospital error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};
