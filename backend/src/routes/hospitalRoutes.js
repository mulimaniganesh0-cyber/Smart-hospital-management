// src/routes/hospitalRoutes.js
const express = require('express');
const router = express.Router();
const hospitalController = require('../controllers/hospitalController');
const { protect, authorize } = require('../middleware/auth');

// Public routes (no authentication required)
router.get('/nearby', hospitalController.getNearbyHospitals);
router.get('/all', hospitalController.getAllHospitals);
router.get('/:hospitalId/resources', hospitalController.getHospitalResources);

// Get hospital doctors (public - for patients to book)
router.get('/:hospitalId/doctors', hospitalController.getHospitalDoctors);

// Protected routes (authentication required)
router.get('/profile', protect, authorize('hospital'), hospitalController.getHospitalProfile);
router.put('/resources', protect, authorize('hospital'), hospitalController.updateResources);

// Staff management routes (hospital only)
router.post('/staff', protect, authorize('hospital'), hospitalController.addHospitalStaff);
router.get('/staff', protect, authorize('hospital'), hospitalController.getHospitalStaff);
router.put('/staff/:staffId', protect, authorize('hospital'), hospitalController.updateHospitalStaff);
router.delete('/staff/:staffId', protect, authorize('hospital'), hospitalController.deleteHospitalStaff);

module.exports = router;