// src/controllers/authController.js
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Patient = require('../models/Patient');
const Hospital = require('../models/Hospital');

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE,
  });
};

exports.register = async (req, res) => {
  try {
    const { name, email, phone, password, user_type, additional_data } = req.body;
    
    console.log('Registration request:', { name, email, user_type });
    
    // Validate required fields
    if (!name || !email || !password || !user_type) {
      return res.status(400).json({
        success: false,
        message: 'Please provide all required fields: name, email, password, user_type'
      });
    }

    // Administrative accounts are provisioned by an administrator only.
    // Never trust a role supplied by a public registration form.
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
        });
      } else if (user_type === 'hospital') {
        await Hospital.create({
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
      }
    } catch (profileError) {
      // Do not leave an account that cannot be used when profile setup fails.
      await User.delete(user.id);
      console.error('Profile creation error:', profileError);
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
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password, user_type } = req.body;
    
    console.log('Login attempt:', { email, user_type });
    
    // Validate input
    if (!email || !password || !user_type) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email, password and user_type'
      });
    }
    
    const user = await User.findByEmail(email);
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }
    
    // Check password
    const isPasswordMatch = await bcrypt.compare(password, user.password_hash);
    
    if (!isPasswordMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }
    
    // Check user type
    if (user.user_type !== user_type) {
      return res.status(401).json({
        success: false,
        message: `This account is not registered as ${user_type}`
      });
    }
    
    const token = generateToken(user.id);
    
    res.json({
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
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
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
    
    const resetToken = jwt.sign({ id: user.id }, process.env.JWT_SECRET, {
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
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(new_password, salt);
    
    await User.update(decoded.id, { password_hash });
    
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
