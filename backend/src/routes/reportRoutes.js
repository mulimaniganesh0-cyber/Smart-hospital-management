// src/routes/reportRoutes.js
const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');
const { protect, authorize } = require('../middleware/auth');

// All report routes require authentication and admin authorization
router.use(protect, authorize('admin'));

// Generate reports
router.get('/hospital-performance', reportController.generateHospitalPerformanceReport);
router.get('/resource-utilization', reportController.generateResourceReport);
router.get('/emergency-response', reportController.generateEmergencyReport);
router.get('/user-registration', reportController.generateUserReport);

// Download reports
router.get('/download/:reportType', reportController.downloadReport);

module.exports = router;