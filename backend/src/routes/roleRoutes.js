// src/routes/roleRoutes.js
const express = require('express');
const router = express.Router();
const roleController = require('../controllers/roleController');
const { protect, authorize } = require('../middleware/auth');
const driverOnboarding = require('../controllers/driverOnboardingController');

console.log('🔹 Loading role routes...');

// Get all roles
router.get('/roles', protect, authorize('hospital_admin', 'super_admin'), roleController.getRoles);

// Staff management
router.post('/drivers', protect, driverOnboarding.createHospitalDriver);
router.get('/drivers', protect, driverOnboarding.listHospitalDrivers);
router.put('/drivers/:driverId', protect, driverOnboarding.editHospitalDriver);
router.put('/drivers/:driverId/status', protect, driverOnboarding.updateHospitalDriver);
router.post('/drivers/:driverId/password-reset', protect, driverOnboarding.resetHospitalDriverPassword);
router.put('/drivers/:driverId/ambulance', protect, driverOnboarding.reassignHospitalDriver);
router.post('/staff', protect, authorize('hospital', 'hospital_admin', 'super_admin'), roleController.createStaffUser);
router.get('/staff', protect, authorize('hospital', 'hospital_admin', 'super_admin'), roleController.getHospitalStaff);
router.put('/staff/:staffId/role', protect, authorize('hospital', 'hospital_admin', 'super_admin'), roleController.updateStaffRole);
router.put('/staff/:staffId/password', protect, authorize('hospital', 'hospital_admin', 'super_admin'), roleController.resetStaffPassword);
router.delete('/staff/:staffId', protect, authorize('hospital', 'hospital_admin', 'super_admin'), roleController.deleteStaffUser);
router.get('/activity-log', protect, authorize('hospital', 'hospital_admin', 'super_admin'), roleController.getStaffActivityLog);

console.log('✅ Role routes loaded successfully');

module.exports = router;
