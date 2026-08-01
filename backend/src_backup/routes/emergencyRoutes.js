// src/routes/emergencyRoutes.js
const express = require('express');
const router = express.Router();
const emergencyController = require('../controllers/emergencyController');
const { authenticateToken, isHospital, isPatient, isAdmin } = require('../middleware/auth');

// Public routes (no authentication required)
router.get('/contacts', emergencyController.getEmergencyContacts);

// Protected routes (authentication required)
router.use(authenticateToken);

// Get nearby emergencies
router.get('/nearby', emergencyController.getNearbyEmergencies);

// Get emergency stats
router.get('/stats', emergencyController.getEmergencyStats);
router.get('/stats/:hospitalId', emergencyController.getEmergencyStats);

// Get active emergencies
router.get('/active', emergencyController.getActiveEmergencies);
router.get('/active/:hospitalId', emergencyController.getActiveEmergencies);

// Hospital emergencies
router.get('/hospital/:hospitalId', isHospital, emergencyController.getHospitalEmergencies);

// Patient emergencies
router.get('/patient/:patientId', isPatient, emergencyController.getPatientEmergencies);

// Create emergency
router.post('/', emergencyController.createEmergency);

// Get emergency by ID
router.get('/:id', emergencyController.getEmergencyById);

// Update emergency status
router.patch('/:id/status', emergencyController.updateEmergencyStatus);

// Assign emergency to hospital
router.patch('/:id/assign', emergencyController.assignEmergency);

// Cancel emergency
router.patch('/:id/cancel', emergencyController.cancelEmergency);

module.exports = router;