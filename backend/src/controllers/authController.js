// src/controllers/authController.js
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Patient = require('../models/Patient');
const Hospital = require('../models/Hospital');
const { createNotification } = require('../services/notificationService');
const { getJwtSecret } = require('../config/jwt');

const generateToken = (id, tokenVersion = 0) => {
  return jwt.sign({ id, token_version: tokenVersion }, getJwtSecret(), {
    expiresIn: process.env.JWT_EXPIRE || '7d',
  });
};

exports.register = async (req, res) => {
  try {
    const { name, email, phone, password, user_type, additional_data } = req.body;
    
    // Validate required fields
    if (!name || !email || !password || !user_type) {
      return res.status(400).json({
        success: false,
        message: 'Please provide all required fields: name, email, password, user_type'
      });
    }

    // Only the frontend-authenticated registration flow may create patient or hospital accounts.
    // Administrative and staff accounts are provisioned server-side by authorized hospital admins.
    if (!['patient', 'hospital'].includes(user_type)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user type'
      });
    }
    if (user_type === 'hospital') {
      const hospital = additional_data || {};
      const required = ['hospital_name', 'registration_number', 'address', 'area', 'city', 'state', 'country', 'pincode'];
      const missing = required.filter((field) => !String(hospital[field] || '').trim());
      const latitude = Number(hospital.latitude);
      const longitude = Number(hospital.longitude);
      if (missing.length || !Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180 || hospital.location_confirmed !== true) {
        return res.status(400).json({ success: false, message: 'Hospital details and a confirmed valid map location are required', fields: missing });
      }
    }
    if (user_type === 'patient') {
      const contact = String(additional_data?.emergency_contact || '').replace(/[\s()-]/g, '');
      if (!String(additional_data?.emergency_contact_name || '').trim() || !/^\+?[1-9]\d{7,14}$/.test(contact)) {
        return res.status(400).json({ success: false, message: 'A valid emergency contact name and phone number are required' });
      }
    }
    
    // Check if user exists
    const userExists = await User.findByEmail(email);
    if (userExists) {
      return res.status(400).json({
        success: false,
        message: 'User already exists'
      });
    }
    
    // Hash password
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);
    
    // Create user
    const user = await User.create({
      name,
      email,
      phone: phone || '',
      password_hash,
      user_type,
    });
    
    // Create role-specific profile
    try {
      if (user_type === 'patient') {
        await Patient.create({
          user_id: user.id,
          date_of_birth: additional_data?.date_of_birth,
          blood_group: additional_data?.blood_group,
          emergency_contact: additional_data?.emergency_contact,
          emergency_contact_name: additional_data?.emergency_contact_name,
          emergency_contact_relationship: additional_data?.emergency_contact_relationship,
        });
      } else if (user_type === 'hospital') {
        const hospitalProfile = await Hospital.create({
          user_id: user.id,
          name: additional_data?.hospital_name || name,
          registration_number: additional_data.registration_number,
          address: additional_data.address,
          area: additional_data.area,
          city: additional_data.city,
          state: additional_data.state,
          country: additional_data.country,
          pincode: additional_data.pincode,
          hospital_type: additional_data.hospital_type,
          departments: additional_data.departments || [], specialties: additional_data.specialties || [], services: additional_data.services || [],
          emergency_available: Boolean(additional_data.emergency_available),
          phone: phone || '',
          email: email,
          latitude: Number(additional_data.latitude), longitude: Number(additional_data.longitude),
        });
        // Every existing administrator receives a persistent verification task.
        const admins = await require('../config/database').pool.query(`SELECT id FROM users WHERE user_type='admin'`);
        for (const admin of admins.rows) {
          await createNotification({ io: req.app.get('io'), recipientUserId: admin.id, hospitalId: hospitalProfile.id, type: 'hospital_registration', priority: 'high', relatedType: 'hospital', relatedId: hospitalProfile.id, title: 'New hospital registration', message: `${hospitalProfile.name} is awaiting verification.` });
        }
      }
    } catch (profileError) {
      // Do not leave an account that cannot be used when profile setup fails.
      await User.delete(user.id);
      console.error('[AUTH] Profile creation failed:', profileError.code || profileError.name || 'unknown error');
      return res.status(400).json({
        success: false,
        message: 'Registration could not be completed. Please try again.'
      });
    }
    
    const token = generateToken(user.id);
    
    res.status(201).json({
      success: true,
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        user_type: user.user_type,
      },
    });
  } catch (error) {
    console.error('[AUTH] Registration failed:', error.code || error.name || 'unknown error');
    res.status(500).json({
      success: false,
      message: 'Registration could not be completed. Please try again.'
    });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, phone, password } = req.body;
    const identifier = String(email || phone || '').trim();
    
    // Validate input
    if (!identifier || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email or mobile number and password'
      });
    }
    
    const user = await User.findByLogin(identifier);
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }
    const effectiveRole = user.role || user.user_type;
    // Check password
    const isPasswordMatch = await bcrypt.compare(password, user.password_hash);
    
    if (!isPasswordMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    if (user.account_status && user.account_status !== 'ACTIVE') {
      return res.status(403).json({ success:false, code:user.driver_type==='private_driver'?'DRIVER_VERIFICATION_PENDING':'ACCOUNT_NOT_ACTIVE', message:user.driver_type==='private_driver'?'Driver verification is still pending or this account was not approved.':'This account is not active' });
    }
    if (effectiveRole === 'ambulance_driver' && user.driver_status !== 'active') {
      return res.status(403).json({ success:false, code:'DRIVER_NOT_AUTHORIZED', message:'This driver account is not authorized for portal access.' });
    }

    // Portal eligibility is checked against the current database records before
    // issuing a session. A role label alone is not enough to activate access.
    if (effectiveRole === 'doctor') {
      const doctor = await require('../config/database').pool.query(`
        SELECT d.id
        FROM doctors d
        JOIN hospitals h ON h.id = d.hospital_id
        WHERE d.user_id = $1
          AND COALESCE(d.is_active, TRUE) = TRUE
          AND d.account_activation_status IN ('ACTIVE', 'EMAIL_REQUIRED', 'PASSWORD_RESET_REQUIRED')
          AND h.id = $2
        LIMIT 1`, [user.id, user.hospital_id]);
      if (!doctor.rowCount) {
        return res.status(403).json({
          success: false,
          code: 'DOCTOR_NOT_AUTHORIZED',
          message: 'This doctor account is not active or is not linked to a hospital profile.'
        });
      }
    }

    if (effectiveRole === 'ambulance_driver') {
      const assignment = await require('../config/database').pool.query(`
        SELECT 1
        FROM ambulances a
        WHERE a.driver_user_id = $1
          AND a.is_active = TRUE
          AND (( $2 = 'hospital_driver' AND a.hospital_id = $3 AND a.private_operator_user_id IS NULL)
            OR ($2 = 'private_driver' AND a.hospital_id IS NULL AND a.private_operator_user_id = $1))
        LIMIT 1`, [user.id, user.driver_type, user.hospital_id]);
      if (!assignment.rowCount) {
        return res.status(403).json({
          success: false,
          code: 'DRIVER_NOT_AUTHORIZED',
          message: 'No active ambulance is assigned to this driver account.'
        });
      }
    }
    
    const token = generateToken(user.id, user.token_version);
    
    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        // Legacy doctor accounts used user_type=staff with role=doctor.  Keep
        // them compatible with the common login screen without a second flow.
        user_type: effectiveRole === 'doctor' ? 'doctor' : effectiveRole === 'ambulance_driver' ? 'ambulance_driver' : user.user_type,
        role: effectiveRole,
        driver_type: user.driver_type,
        driver_status: user.driver_status,
        password_reset_required: Boolean(user.password_reset_required),
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// Change credentials for the authenticated account. This route is the only
// protected route available while password_reset_required is set.
exports.changePassword = async (req, res) => {
  const { old_password, new_password, confirm_password } = req.body || {};
  if (typeof old_password !== 'string' || typeof new_password !== 'string' || new_password.length < 10 ||
      !/[a-z]/.test(new_password) || !/[A-Z]/.test(new_password) || !/[0-9]/.test(new_password) ||
      !/[!@#$%^&*(),.?":{}|<>_\-]/.test(new_password)) {
    return res.status(400).json({ success:false, message:'Use at least 10 characters with upper and lower case letters, a number, and a symbol.' });
  }
  if (new_password !== confirm_password) return res.status(400).json({ success:false, message:'New password confirmation does not match.' });
  try {
    const user = await User.findByEmail(req.user.email);
    if (!user || !(await bcrypt.compare(old_password, user.password_hash))) return res.status(400).json({success:false,message:'Current password is incorrect.'});
    if (await bcrypt.compare(new_password, user.password_hash)) return res.status(400).json({success:false,message:'Choose a password different from your current password.'});
    const password_hash = await bcrypt.hash(new_password, 10);
    const updated = await require('../config/database').pool.query(`UPDATE users SET password_hash=$1,password_reset_required=FALSE,token_version=COALESCE(token_version,0)+1,updated_at=CURRENT_TIMESTAMP WHERE id=$2 RETURNING token_version`,[password_hash,req.user.id]);
    await require('../config/database').pool.query(`UPDATE doctors SET account_activation_status='ACTIVE',updated_at=CURRENT_TIMESTAMP WHERE user_id=$1 AND account_activation_status='PASSWORD_RESET_REQUIRED'`,[req.user.id]);
    const room=req.user.role==='ambulance_driver'?`driver_${req.user.id}`:`user_${req.user.id}`;
    req.app?.get('io')?.in(room).disconnectSockets(true);
    res.json({success:true,message:'Password changed successfully.',token:generateToken(req.user.id,updated.rows[0].token_version)});
  } catch (error) { res.status(500).json({success:false,message:'Unable to change password.'}); }
};

exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    
    const user = await User.findByEmail(email);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    const resetToken = jwt.sign({ id: user.id }, getJwtSecret(), {
      expiresIn: '1h',
    });
    
    res.json({
      success: true,
      message: 'Password reset instructions sent to email',
      resetToken: process.env.NODE_ENV === 'development' ? resetToken : undefined,
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const { token, new_password } = req.body;
    
    const decoded = jwt.verify(token, getJwtSecret());
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(new_password, salt);
    
    await User.update(decoded.id, { password_hash, password_reset_required: false });
    // Completing a verified password reset activates migrated doctor accounts.
    await require('../config/database').pool.query(`
      UPDATE doctors SET account_activation_status='ACTIVE', updated_at=CURRENT_TIMESTAMP
      WHERE user_id=$1 AND account_activation_status='PASSWORD_RESET_REQUIRED'`, [decoded.id]);
    
    res.json({
      success: true,
      message: 'Password reset successfully',
    });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

exports.getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    
    let profileData = { ...user };
    
    if (user.user_type === 'patient') {
      const patient = await Patient.findByUserId(user.id);
      profileData.patient_details = patient;
    } else if (user.user_type === 'hospital') {
      const hospital = await Hospital.findByUserId(user.id);
      profileData.hospital_details = hospital;
    } else if (user.user_type === 'doctor') {
      const doctor = await require('../config/database').pool.query('SELECT d.*, h.name hospital_name FROM doctors d JOIN hospitals h ON h.id=d.hospital_id WHERE d.user_id=$1', [user.id]);
      profileData.doctor_details = doctor.rows[0] || null;
    }
    
    res.json({
      success: true,
      data: profileData,
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const { name, phone } = req.body;
    
    const updatedUser = await User.update(req.user.id, { name, phone });
    
    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: updatedUser,
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};
