// src/controllers/roleController.js
const { pool } = require('../config/database');
const crypto = require('crypto');

const FALLBACK_ROLES = [
  { id: 'doctor', name: 'doctor', description: 'Hospital doctor access' },
  { id: 'nurse', name: 'nurse', description: 'Hospital nursing access' },
  { id: 'frontdesk', name: 'frontdesk', description: 'Front desk and scheduling access' },
  { id: 'billing', name: 'billing', description: 'Billing and records access' },
  { id: 'hospital_admin', name: 'hospital_admin', description: 'Hospital admin access' },
  { id: 'super_admin', name: 'super_admin', description: 'System administrator access' },
];

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
    if (error?.code === '42P01') {
      return res.json({
        success: true,
        data: FALLBACK_ROLES,
      });
    }
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
  const client = await pool.connect();
  try {
    const { 
      name, email, phone, password, 
      role, department, designation,
      qualifications, experience_years,
      permissions, doctor_id
    } = req.body;

    const hospitalAdminId = req.user.id;
    const rawPhone=String(phone||'').trim();
    const normalizedPhone = rawPhone.replace(/[^0-9]/g,'');
    const storedPhone=rawPhone.replace(/[ ()-]/g,'');
    const loginEmail = String(email || '').trim().toLowerCase() || (role==='doctor' && normalizedPhone ? `doctor-${normalizedPhone}@doctor.local` : '');
    const allowedRoles = new Set(['doctor', 'nurse', 'receptionist', 'lab_technician', 'pharmacist', 'frontdesk', 'billing', 'ambulance_driver']);
    if (role === 'ambulance_driver') return res.status(400).json({ success: false, message: 'Use the hospital driver invitation workflow so the account is authorized and assigned securely.' });
    if (!String(name || '').trim() || !/^\+?[0-9 ()-]{8,20}$/.test(rawPhone) || normalizedPhone.length<8 || normalizedPhone.length>15 || !allowedRoles.has(role) || (role !== 'ambulance_driver' && !loginEmail)) {
      return res.status(400).json({ success: false, message: 'Provide valid staff details, phone, and role.' });
    }
    if(role==='doctor' && email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(loginEmail))return res.status(400).json({success:false,message:'Provide a valid email address or leave it blank to use mobile login.'});
    if (role==='doctor' && (typeof password!=='string' || password.length<10 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password) || !/[!@#$%^&*(),.?":{}|<>_\-]/.test(password))) return res.status(400).json({success:false,message:'Doctor initial password must have at least 10 characters, upper and lower case letters, a number, and a symbol.'});
    if (typeof password !== 'string' || password.length < 8) return res.status(400).json({ success: false, message: 'Password must contain at least 8 characters.' });

    // The account that owns a hospital is its administrator.  Older accounts
    // may not have a separate hospital_admin role, so rely on the hospital
    // relationship instead of a client-supplied role.
    const adminCheck = await client.query(
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
    const hospitalResult = await client.query(
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
    const driverLogin = role === 'ambulance_driver';
    const accountIdentifier = driverLogin
      ? `driver-${String(phone).replace(/\D/g, '')}@driver.local`
      : loginEmail;
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[normalizedPhone]);
    const userExists = await client.query("SELECT id, user_type, hospital_id FROM users WHERE lower(email)=lower($1) OR regexp_replace(COALESCE(phone,''),'[^0-9]','','g')=$2", [accountIdentifier, normalizedPhone]);

    if (userExists.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ 
        success: false, 
        message: 'This login email is already in use.'
      });
    }

    // Hash password
    const bcrypt = require('bcryptjs');
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    // Create user
    let existingDoctor = null;
    if (role === 'doctor' && doctor_id != null) {
      const doctor = await client.query('SELECT id, user_id FROM doctors WHERE id=$1 AND hospital_id=$2 FOR UPDATE', [Number(doctor_id), hospitalId]);
      if (!doctor.rowCount) { await client.query('ROLLBACK'); return res.status(404).json({ success: false, message: 'Doctor not found at this hospital.' }); }
      if (doctor.rows[0].user_id != null) { await client.query('ROLLBACK'); return res.status(409).json({ success: false, message: 'Account already exists for this doctor. Use Reset Password instead.' }); }
      existingDoctor = doctor.rows[0];
    }
    const userResult = await client.query(
      `INSERT INTO users (name, email, phone, password_hash, user_type, role, hospital_role, permissions, hospital_id,password_reset_required)
       VALUES ($1, $2, $3, $4, $5, $6, $6, $7, $8,$9)
       RETURNING id, name, email, phone, role, hospital_role`,
      [name.trim(), accountIdentifier, storedPhone, password_hash, role === 'doctor' ? 'doctor' : 'staff', role, permissions || [], hospitalId, role==='doctor']
    );

    const user = userResult.rows[0];

    // Create doctor record if role is doctor
    if (existingDoctor) {
      await client.query("UPDATE doctors SET user_id=$1, email=COALESCE(NULLIF(email, ''), $2), phone=COALESCE(NULLIF(phone, ''), $3), account_activation_status='PASSWORD_RESET_REQUIRED', updated_at=CURRENT_TIMESTAMP WHERE id=$4 AND hospital_id=$5", [user.id, loginEmail, storedPhone, existingDoctor.id, hospitalId]);
    } else if (role === 'doctor') {
      await client.query(
        `INSERT INTO doctors (hospital_id, user_id, name, specialization, qualification, experience_years, phone, email, availability_status, account_activation_status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, 'PASSWORD_RESET_REQUIRED')`,
        [hospitalId, user.id, name.trim(), department || 'General', qualifications || '', experience_years || 0, storedPhone, loginEmail]
      );
    }

    // Log activity
    await client.query(
      `INSERT INTO staff_activity_log (user_id, hospital_id, action, details)
       VALUES ($1, $2, $3, $4)`,
      [hospitalAdminId, hospitalId, 'create_staff', JSON.stringify({ created_user: user.id, role: role })]
    );

    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      message: 'Staff user created successfully',
      data: { ...user, ...(role==='doctor'?{initial_password:password,password_change_required:true}:{}) },
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Create staff user error:', error);
    if (error.code === '23505') return res.status(400).json({ success: false, message: 'This login email is already in use.' });
    res.status(500).json({ 
      success: false, 
      message: 'Unable to create staff account.'
    });
  } finally { client.release(); }
};

// An owning hospital may replace (but never read) a staff member's password.
exports.resetStaffPassword = async (req, res) => {
  try {
    const staffId = Number(req.params.staffId);
    if (!Number.isInteger(staffId)) return res.status(400).json({ success: false, message: 'Invalid staff account.' });
    const hospital = await pool.query('SELECT id FROM hospitals WHERE user_id=$1', [req.user.id]);
    if (!hospital.rowCount) return res.status(403).json({ success: false, message: 'Unauthorized to reset this password.' });
    const password = crypto.randomBytes(18).toString('base64url')+'A1!';
    const bcrypt = require('bcryptjs');
    const passwordHash = await bcrypt.hash(password, await bcrypt.genSalt(10));
    const result = await pool.query(`UPDATE users SET password_hash=$1, password_reset_required=true,token_version=COALESCE(token_version,0)+1, updated_at=CURRENT_TIMESTAMP
      WHERE id=$2 AND hospital_id=$3 AND role='doctor' RETURNING id`, [passwordHash, staffId, hospital.rows[0].id]);
    if (!result.rowCount) return res.status(404).json({ success: false, message: 'Staff account not found.' });
    req.app.get('io')?.in(`user_${staffId}`).disconnectSockets(true);
    res.json({ success: true, message: 'Temporary password created. Share it securely; it is shown only once.', data:{temporary_password:password,password_change_required:true} });
  } catch (error) {
    console.error('Reset staff password error:', error);
    res.status(500).json({ success: false, message: 'Unable to reset password.' });
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
              u.permissions, u.created_at, u.is_verified, u.account_status, u.password_reset_required,
              d.id as doctor_id, d.specialization, d.qualification, 
              d.experience_years, d.availability_status, d.account_activation_status, d.is_active
       FROM users u
       LEFT JOIN doctors d ON u.id = d.user_id AND d.hospital_id = $1
       WHERE u.user_type IN ('staff', 'doctor') AND u.hospital_id = $1
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
       WHERE id = $3 AND user_type IN ('staff', 'doctor') AND hospital_id = (SELECT id FROM hospitals WHERE user_id = $4)
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
      "DELETE FROM users WHERE id = $1 AND user_type IN ('staff', 'doctor') AND hospital_id = (SELECT id FROM hospitals WHERE user_id = $2) RETURNING id",
      [staffId, adminId]
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
