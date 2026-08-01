// src/middleware/validation.js
const { body, validationResult } = require('express-validator');

exports.validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

exports.registerValidation = [
  body('name').notEmpty().withMessage('Name is required'),
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('user_type').isIn(['patient', 'hospital']).withMessage('Invalid user type'),
  exports.validate,
];

exports.loginValidation = [
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').notEmpty().withMessage('Password is required'),
  exports.validate,
];

exports.appointmentValidation = [
  body('hospital_id').isInt().withMessage('Valid hospital ID required'),
  body('appointment_date').isDate().withMessage('Valid date required'),
  body('appointment_time').matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).withMessage('Valid time required'),
  exports.validate,
];