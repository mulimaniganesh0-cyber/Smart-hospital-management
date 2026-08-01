// src/routes/adminRoutes.js

const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { protect, authorize } = require('../middleware/auth');

// All admin routes require authentication and admin role
router.use(protect);
router.use(authorize('admin'));

// Hospital management
router.get('/hospitals', adminController.getAllHospitals);
router.get('/hospitals/:id', adminController.getHospitalDetails);
router.put('/hospitals/:id/verify', adminController.verifyHospital);
router.delete('/hospitals/:id', adminController.deleteHospital); // <-- NEW

// Resources
router.get('/hospitals/:id/resources', adminController.getHospitalResources);
router.put('/hospitals/:id/resources', adminController.updateHospitalResources);

// ... other routes ...

module.exports = router;