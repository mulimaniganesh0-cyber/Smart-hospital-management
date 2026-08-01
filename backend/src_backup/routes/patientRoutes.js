// src/routes/patientRoutes.js
const express = require('express');
const router = express.Router();
const patientController = require('../controllers/patientController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect, authorize('patient'));

router.get('/profile', patientController.getPatientProfile);
router.put('/profile', patientController.updatePatientProfile);
router.get('/medical-history', patientController.getMedicalHistory);

module.exports = router;