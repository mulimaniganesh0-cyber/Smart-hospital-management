// src/controllers/roleController.js
const { pool } = require('../config/database');

// ==================== GET ALL ROLES ====================
exports.getRoles = async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM roles ORDER BY name'
    );
    
    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error('Get roles error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  }
};

// ==================== CREATE STAFF USER ====================
exports.createStaffUser = async (req, res) => {
  try {
    const { 
      name, email, phone, password, 
      role, department, designation,
      qualifications, experience_years,
      permissions
    } = req.body;

    const hospitalAdminId = req.user.id;

    // Check if user is hospital admin
    const adminCheck = await pool.query(
      'SELECT id, role FROM users WHERE id = $1 AND role IN ($2, $3)',
      [hospitalAdminId, 'hospital_admin', 'super_admin']
    );

    if (adminCheck.rows.length === 0) {
      return res.status(403).json({ 
        success: false, 
        message: 'Unauthorized to create staff users' 
      });
    }

    // Get hospital id
    const hospitalResult = await pool.query(
      'SELECT id FROM hospitals WHERE user_id = $1',
      [hospitalAdminId]
    );

    if (hospitalResult.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Hospital not found' 
      });
    }

    const hospitalId = hospitalResult.rows[0].id;

    // Check if email already exists
    const userExists = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );

    if (userExists.rows.length > 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Email already exists' 
      });
    }

    // Hash password
    const bcrypt = require('bcryptjs');
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    // Create user
    const userResult = await pool.query(
      `INSERT INTO users (name, email, phone, password_hash, user_type, role, hospital_role, permissions)
       VALUES ($1, $2, $3, $4, 'staff', $5, $6, $7)
       RETURNING id, name, email, phone, role, hospital_role`,
      [name, email, phone, password_hash, role, role, permissions || []]
    );

    const user = userResult.rows[0];

    // Create doctor record if role is doctor
    if (role === 'doctor') {
      await pool.query(
        `INSERT INTO doctors (hospital_id, user_id, name, specialization, qualification, experience_years, phone, email, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true)`,
        [hospitalId, user.id, name, department || 'General', qualifications, experience_years || 0, phone, email]
      );
    }

    // Log activity
    await pool.query(
      `INSERT INTO staff_activity_log (user_id, hospital_id, action, details)
       VALUES ($1, $2, $3, $4)`,
      [hospitalAdminId, hospitalId, 'create_staff', JSON.stringify({ created_user: user.id, role: role })]
    );

    res.status(201).json({
      success: true,
      message: 'Staff user created successfully',
      data: user,
    });
  } catch (error) {
    console.error('Create staff user error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  }
};

// ==================== GET HOSPITAL STAFF ====================
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
      `SELECT u.id, u.name, u.email, u.phone, u.role, u.hospital_role, 
              u.permissions, u.created_at, u.is_verified,
              d.id as doctor_id, d.specialization, d.qualification, 
              d.experience_years, d.availability_status
       FROM users u
       LEFT JOIN doctors d ON u.id = d.user_id AND d.hospital_id = $1
       WHERE u.user_type = 'staff' AND u.id IN (
         SELECT user_id FROM doctors WHERE hospital_id = $1
         UNION
         SELECT user_id FROM users WHERE role IN ('hospital_admin', 'super_admin')
       )
       ORDER BY u.created_at DESC`,
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

// ==================== UPDATE STAFF ROLE ====================
exports.updateStaffRole = async (req, res) => {
  try {
    const { staffId } = req.params;
    const { role, permissions } = req.body;
    const adminId = req.user.id;

    // Check if admin has permission
    const adminCheck = await pool.query(
      'SELECT role FROM users WHERE id = $1',
      [adminId]
    );

    if (adminCheck.rows.length === 0 || 
        !['hospital_admin', 'super_admin'].includes(adminCheck.rows[0].role)) {
      return res.status(403).json({ 
        success: false, 
        message: 'Unauthorized to update staff roles' 
      });
    }

    const result = await pool.query(
      `UPDATE users 
       SET role = $1, hospital_role = $1, permissions = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3 AND user_type = 'staff'
       RETURNING id, name, email, role, permissions`,
      [role, permissions || [], staffId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Staff user not found' 
      });
    }

    res.json({
      success: true,
      message: 'Staff role updated successfully',
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Update staff role error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  }
};

// ==================== DELETE STAFF USER ====================
exports.deleteStaffUser = async (req, res) => {
  try {
    const { staffId } = req.params;
    const adminId = req.user.id;

    const adminCheck = await pool.query(
      'SELECT role FROM users WHERE id = $1',
      [adminId]
    );

    if (adminCheck.rows.length === 0 || 
        !['hospital_admin', 'super_admin'].includes(adminCheck.rows[0].role)) {
      return res.status(403).json({ 
        success: false, 
        message: 'Unauthorized to delete staff users' 
      });
    }

    // Check if trying to delete self
    if (staffId == adminId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Cannot delete your own account' 
      });
    }

    const result = await pool.query(
      'DELETE FROM users WHERE id = $1 AND user_type = $2 RETURNING id',
      [staffId, 'staff']
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Staff user not found' 
      });
    }

    res.json({
      success: true,
      message: 'Staff user deleted successfully',
    });
  } catch (error) {
    console.error('Delete staff user error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  }
};

// ==================== GET STAFF ACTIVITY LOG ====================
exports.getStaffActivityLog = async (req, res) => {
  try {
    const userId = req.user.id;
    const { limit = 50 } = req.query;

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
      `SELECT l.*, u.name as user_name
       FROM staff_activity_log l
       JOIN users u ON l.user_id = u.id
       WHERE l.hospital_id = $1
       ORDER BY l.created_at DESC
       LIMIT $2`,
      [hospitalId, limit]
    );

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error('Get staff activity log error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  }
};