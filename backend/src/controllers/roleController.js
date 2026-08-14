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

    // The account that owns a hospital is its administrator.  Older accounts
    // may not have a separate hospital_admin role, so rely on the hospital
    // relationship instead of a client-supplied role.
    const adminCheck = await pool.query(
      `SELECT u.id, u.user_type, u.role FROM users u
       WHERE u.id = $1 AND (u.user_type = 'hospital' OR u.role IN ('hospital_admin', 'super_admin'))`,
      [hospitalAdminId]
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
      'SELECT id, user_type, hospital_id FROM users WHERE email = $1',
      [email]
    );

    if (userExists.rows.length > 0) {
      const existing = userExists.rows[0];
      // Repair staff accounts created by an earlier release that did not save
      // their hospital relationship; never reassign an already-owned account.
      if (existing.user_type === 'staff' && existing.hospital_id == null) {
        await pool.query('UPDATE users SET hospital_id = $1, role = $2, hospital_role = $2 WHERE id = $3', [hospitalId, role, existing.id]);
        if (role === 'doctor') {
          await pool.query(`INSERT INTO doctors (hospital_id, user_id, name, specialization, qualification, experience_years, phone, email, availability_status)
            SELECT $1, $2, $3, $4, $5, $6, $7, $8, true
            WHERE NOT EXISTS (SELECT 1 FROM doctors WHERE user_id = $2)`,
            [hospitalId, existing.id, name, department || 'General', qualifications || '', experience_years || 0, phone, email]);
        }
        return res.json({ success: true, message: 'Existing staff account linked to this hospital successfully', data: { id: existing.id } });
      }
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
      `INSERT INTO users (name, email, phone, password_hash, user_type, role, hospital_role, permissions, hospital_id)
       VALUES ($1, $2, $3, $4, 'staff', $5, $6, $7, $8)
       RETURNING id, name, email, phone, role, hospital_role`,
      [name, email, phone, password_hash, role, role, permissions || [], hospitalId]
    );

    const user = userResult.rows[0];

    // Create doctor record if role is doctor
    if (role === 'doctor') {
      await pool.query(
        `INSERT INTO doctors (hospital_id, user_id, name, specialization, qualification, experience_years, phone, email, availability_status)
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
       WHERE u.user_type = 'staff' AND u.hospital_id = $1
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

    const adminCheck = await pool.query(
      `SELECT u.role, u.user_type FROM users u WHERE u.id = $1
       AND (u.user_type = 'hospital' OR u.role IN ('hospital_admin', 'super_admin'))`,
      [adminId]
    );

    if (adminCheck.rows.length === 0) {
      return res.status(403).json({ 
        success: false, 
        message: 'Unauthorized to update staff roles' 
      });
    }

    const result = await pool.query(
      `UPDATE users 
       SET role = $1, hospital_role = $1, permissions = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3 AND user_type = 'staff' AND hospital_id = (SELECT id FROM hospitals WHERE user_id = $4)
       RETURNING id, name, email, role, permissions`,
      [role, permissions || [], staffId, adminId]
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
      `SELECT u.role, u.user_type FROM users u WHERE u.id = $1
       AND (u.user_type = 'hospital' OR u.role IN ('hospital_admin', 'super_admin'))`,
      [adminId]
    );

    if (adminCheck.rows.length === 0) {
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
      'DELETE FROM users WHERE id = $1 AND user_type = $2 AND hospital_id = (SELECT id FROM hospitals WHERE user_id = $3) RETURNING id',
      [staffId, 'staff', adminId]
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
