// src/routes/authRoutes.js
const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const authController = require('../controllers/authController');
const driverOnboarding = require('../controllers/driverOnboardingController');
const { protect } = require('../middleware/auth');
const { validate } = require('../middleware/validation');

router.post(
  '/register',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 6 }),
    body('name').notEmpty(),
    body('user_type').isIn(['patient', 'hospital']),
    validate,
  ],
  authController.register
);
router.post('/drivers/private-registration', driverOnboarding.registerPrivateDriver);

router.post('/login', (req, res, next) => {
  const startedAt = process.hrtime.bigint();
  res.once('finish', () => {
    const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    // Do not log passwords or JWTs. The email is intentionally omitted too.
    console.log(`[AUTH] POST /login -> ${res.statusCode} (${elapsedMs.toFixed(0)}ms)`);
  });
  next();
}, authController.login);
router.post('/change-password', protect, authController.changePassword);
router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password', authController.resetPassword);
router.get('/profile', protect, authController.getProfile);
router.get('/me', protect, authController.getProfile);
router.put('/profile', protect, authController.updateProfile);

module.exports = router;
