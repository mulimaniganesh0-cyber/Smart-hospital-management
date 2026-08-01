// src/middleware/auth.js
const jwt = require('jsonwebtoken');

// Main authentication middleware
exports.authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({
            success: false,
            message: 'Access denied. No token provided.'
        });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(403).json({
            success: false,
            message: 'Invalid or expired token'
        });
    }
};

// Alias for authenticateToken (for compatibility with protect)
exports.protect = exports.authenticateToken;

// Role-based authorization middleware
exports.authorize = (...roles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: 'Not authenticated'
            });
        }

        // Get user_type from token
        const userType = req.user.user_type || req.user.role;
        
        if (!roles.includes(userType)) {
            return res.status(403).json({
                success: false,
                message: `Access denied. Required role: ${roles.join(' or ')}`
            });
        }

        next();
    };
};

// Check if user is admin
exports.isAdmin = (req, res, next) => {
    const userType = req.user.user_type || req.user.role;
    if (userType !== 'admin') {
        return res.status(403).json({
            success: false,
            message: 'Admin access required'
        });
    }
    next();
};

// Check if user is hospital
exports.isHospital = (req, res, next) => {
    const userType = req.user.user_type || req.user.role;
    if (userType !== 'hospital') {
        return res.status(403).json({
            success: false,
            message: 'Hospital access required'
        });
    }
    next();
};

// Check if user is patient
exports.isPatient = (req, res, next) => {
    const userType = req.user.user_type || req.user.role;
    if (userType !== 'patient') {
        return res.status(403).json({
            success: false,
            message: 'Patient access required'
        });
    }
    next();
};

// Check if user has access to hospital
exports.hasHospitalAccess = (req, res, next) => {
    const hospitalId = req.params.hospitalId || req.body.hospital_id || req.params.id;
    if (!hospitalId) {
        return res.status(400).json({
            success: false,
            message: 'Hospital ID is required'
        });
    }
    
    const userType = req.user.user_type || req.user.role;
    
    // Admin has access to all hospitals
    if (userType === 'admin') {
        return next();
    }
    
    // Hospital users can only access their own hospital
    if (userType === 'hospital' && req.user.hospitalId == hospitalId) {
        return next();
    }
    
    return res.status(403).json({
        success: false,
        message: 'Access denied to this hospital'
    });
};

// Check if user has access to patient data
exports.hasPatientAccess = (req, res, next) => {
    const patientId = req.params.patientId || req.body.patient_id || req.params.id;
    if (!patientId) {
        return res.status(400).json({
            success: false,
            message: 'Patient ID is required'
        });
    }
    
    const userType = req.user.user_type || req.user.role;
    
    // Admin has access to all patients
    if (userType === 'admin') {
        return next();
    }
    
    // Hospital users can access patients in their hospital
    if (userType === 'hospital') {
        return next();
    }
    
    // Patients can only access their own data
    if (userType === 'patient' && req.user.id == patientId) {
        return next();
    }
    
    return res.status(403).json({
        success: false,
        message: 'Access denied to this patient data'
    });
};

// Export all middleware
module.exports = {
    authenticateToken: exports.authenticateToken,
    protect: exports.protect,
    authorize: exports.authorize,
    isAdmin: exports.isAdmin,
    isHospital: exports.isHospital,
    isPatient: exports.isPatient,
    hasHospitalAccess: exports.hasHospitalAccess,
    hasPatientAccess: exports.hasPatientAccess
};