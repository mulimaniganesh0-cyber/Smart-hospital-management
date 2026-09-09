// src/routes/hospitalRoutes.js
const express = require('express');
const router = express.Router();
const hospitalController = require('../controllers/hospitalController');
const dailyQrController = require('../controllers/dailyQrController');
const { protect, authorize } = require('../middleware/auth');

// Static protected paths must be registered before /:hospitalId.
router.get('/profile', protect, authorize('hospital'), hospitalController.getHospitalProfile);
router.get('/dashboard-stats', protect, authorize('hospital'), hospitalController.getDashboardStats);
router.get('/daily-qr', protect, authorize('hospital', 'hospital_admin'), dailyQrController.getToday);
router.put('/resources', protect, authorize('hospital'), hospitalController.updateResources);
router.get('/staff', protect, authorize('hospital'), hospitalController.getHospitalStaff);
router.post('/staff', protect, authorize('hospital'), hospitalController.addHospitalStaff);
router.put('/staff/:staffId', protect, authorize('hospital'), hospitalController.updateHospitalStaff);
router.delete('/staff/:staffId', protect, authorize('hospital'), hospitalController.deleteHospitalStaff);

// Public routes (no authentication required)
router.get('/nearby', hospitalController.getNearbyHospitals);
router.get('/all', hospitalController.getAllHospitals);
// Main directory: every approved platform hospital. Location never filters it.
router.get('/', hospitalController.getAllHospitals);
router.get('/search', hospitalController.getAllHospitals);
router.get('/cities', async (req, res) => {
  try {
    const { pool } = require('../config/database');
    const result = await pool.query('SELECT DISTINCT city FROM hospitals WHERE city IS NOT NULL AND (is_verified = true OR directory_visible = true) ORDER BY city');
    res.json({ success: true, data: result.rows.map(r => r.city) });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});
router.get('/:hospitalId/resources', hospitalController.getHospitalResources);

// Get hospital doctors (public - for patients to book)
router.get('/:hospitalId/doctors', hospitalController.getHospitalDoctors);
router.get('/:hospitalId', hospitalController.getHospitalDetails);
// Protected routes (authentication required)
router.put('/:hospitalId', protect, authorize('hospital'), hospitalController.updateHospitalLocation);

// Staff management routes (hospital only)

module.exports = router;
