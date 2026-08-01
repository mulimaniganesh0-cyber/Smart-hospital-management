// src/routes/adminRoutes.js
const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect, authorize('admin'));

// Dashboard
router.get('/dashboard/stats', adminController.getDashboardStats);

// User management
router.get('/users', adminController.getAllUsers);

// Hospital management
router.get('/hospitals', adminController.getAllHospitalsWithResources);
router.get('/hospitals/:hospitalId/resources', adminController.getHospitalResources);
router.put('/hospitals/:hospitalId/resources', adminController.updateHospitalResources);
router.get('/hospitals/:hospitalId/blood-bank', adminController.getHospitalBloodBank);
router.put('/hospitals/:hospitalId/blood-bank', adminController.updateBloodBank);
router.put('/verify-hospital/:hospitalId', adminController.verifyHospital);
router.delete('/hospitals/:hospitalId', adminController.deleteHospital);


module.exports = router;