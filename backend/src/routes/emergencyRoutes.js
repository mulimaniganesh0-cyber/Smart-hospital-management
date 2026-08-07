// src/routes/emergencyRoutes.js
const express = require('express');
const router = express.Router();
const emergencyController = require('../controllers/emergencyController');
const { protect, authorize } = require('../middleware/auth');

router.post('/create', protect, emergencyController.createEmergencyRequest);
router.post('/sos', protect, emergencyController.createEmergencyRequest);
router.post('/location-update', protect, emergencyController.updateLiveLocation);
router.get('/patient-history', protect, emergencyController.getPatientSosHistory);
router.post('/:emergencyId/end', protect, emergencyController.endEmergency);
router.get('/nearby', emergencyController.getNearbyEmergencies);
router.get('/hospital', protect, authorize('hospital'), emergencyController.getHospitalEmergencies);
router.put('/:emergencyId/status', protect, emergencyController.updateEmergencyStatus);

module.exports = router;