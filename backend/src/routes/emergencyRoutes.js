// src/routes/emergencyRoutes.js
const express = require('express');
const router = express.Router();
const emergencyController = require('../controllers/emergencyController');
const { protect, authorize } = require('../middleware/auth');

router.get('/location/:token', emergencyController.getSecureEmergencyLocation);
router.post('/create', protect, emergencyController.createEmergencyRequest);
router.post('/sos', protect, emergencyController.createEmergencyRequest);
router.post('/location-update', protect, emergencyController.updateLiveLocation);
router.get('/patient-history', protect, emergencyController.getPatientSosHistory);
router.post('/:emergencyId/end', protect, emergencyController.endEmergency);
// Emergency records contain patient contact and location information; they are
// never a public directory. Hospital/admin access is authenticated and the
// hospital-specific endpoint below remains the normal dashboard data source.
router.get('/nearby', protect, authorize('hospital', 'admin'), emergencyController.getNearbyEmergencies);
router.get('/hospital', protect, authorize('hospital'), emergencyController.getHospitalEmergencies);
router.get('/:emergencyId', protect, emergencyController.getEmergencyDetails);
router.put('/:emergencyId/dispatch-response', protect, authorize('hospital'), emergencyController.respondToSosDispatch);
router.put('/:emergencyId/status', protect, authorize('hospital'), emergencyController.updateEmergencyStatus);
router.put('/:emergencyId/ambulance', protect, authorize('hospital'), emergencyController.assignEmergencyAmbulance);

module.exports = router;
