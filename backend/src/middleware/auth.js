// src/middleware/auth.js
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { getJwtSecret } = require('../config/jwt');

const protect = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
    return res.status(401).json({ message: 'Not authorized, no token' });
  }

  const token = authHeader.split(' ')[1];
  if (!token) {
    return res.status(401).json({ message: 'Not authorized, no token' });
  }

  try {
    const decoded = jwt.verify(token, getJwtSecret());
    req.user = await User.findById(decoded.id);

    if (!req.user) {
      return res.status(401).json({ message: 'User not found' });
    }
    if (Number(decoded.token_version || 0) !== Number(req.user.token_version || 0)) return res.status(401).json({ message: 'Session expired. Please sign in again.' });
    if (req.user.account_status && req.user.account_status !== 'ACTIVE') {
      return res.status(403).json({ message: 'Account is not active' });
    }
    if (req.user.password_reset_required && req.originalUrl.split('?')[0] !== '/api/auth/change-password') {
      return res.status(403).json({
        message: 'A password change is required before this account can access the portal',
        code: 'PASSWORD_CHANGE_REQUIRED',
      });
    }

    next();
  } catch (error) {
    return res.status(401).json({ message: 'Not authorized, token failed' });
  }
};

const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Not authorized, no user context' });
    }

    const userRoles = new Set([
      req.user.user_type,
      req.user.role,
      req.user.hospital_role,
    ].filter(Boolean));

    const allowed = roles.some((role) => userRoles.has(role));

    if (!allowed) {
      return res.status(403).json({
        message: `User role ${req.user.user_type} is not authorized to access this route`,
      });
    }
    next();
  };
};

// Driver access is revoked from the database on every protected request. JWT
// claims alone never authorize trips, so suspensions and reassignments take
// effect without waiting for a token to expire.
const requireActiveDriver = async (req, res, next) => {
  if (!req.user || req.user.role !== 'ambulance_driver' || !['hospital_driver', 'private_driver'].includes(req.user.driver_type) || req.user.driver_status !== 'active' || req.user.account_status !== 'ACTIVE') {
    return res.status(403).json({ success: false, message: 'An approved and active driver account is required' });
  }
  try {
    const { pool } = require('../config/database');
    const result = await pool.query(`SELECT 1 FROM ambulances a JOIN users u ON u.id=a.driver_user_id
      WHERE u.id=$1 AND a.is_active=TRUE AND u.driver_status='active' AND u.account_status='ACTIVE'
        AND ((u.driver_type='hospital_driver' AND a.hospital_id=u.hospital_id AND a.private_operator_user_id IS NULL)
          OR (u.driver_type='private_driver' AND a.hospital_id IS NULL AND a.private_operator_user_id=u.id)) LIMIT 1`, [req.user.id]);
    if (!result.rowCount) return res.status(403).json({ success: false, message: 'No active ambulance is assigned to this driver' });
    return next();
  } catch (_) { return res.status(503).json({ success: false, message: 'Unable to verify driver authorization' }); }
};

module.exports = { protect, authorize, requireActiveDriver };
