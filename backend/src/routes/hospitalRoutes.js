// src/routes/hospitalRoutes.js
const express = require('express');
const multer = require('multer');
const router = express.Router();
const hospitalController = require('../controllers/hospitalController');
const galleryController = require('../controllers/hospitalGalleryController').createHospitalGalleryController();
const dailyQrController = require('../controllers/dailyQrController');
const { protect, authorize } = require('../middleware/auth');

const galleryUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 1, fields: 5, parts: 6 },
});
const parseGalleryUpload = (req, res, next) => galleryUpload.single('photo')(req, res, (error) => {
  if (!error) return next();
  if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ success: false, message: 'Image must be 8 MB or smaller.' });
  }
  return res.status(400).json({ success: false, message: 'Invalid photo upload.' });
});
const manageGallery = [protect, authorize('hospital', 'hospital_admin')];

router.get('/gallery/manage', ...manageGallery, galleryController.getManagedPhotos);
router.get('/gallery/photos/:photoId/image', ...manageGallery, galleryController.serveManagedImage);
router.post('/gallery/photos', ...manageGallery, parseGalleryUpload, galleryController.upload);
router.put('/gallery/photos/reorder', ...manageGallery, galleryController.reorder);
router.put('/gallery/photos/:photoId/image', ...manageGallery, parseGalleryUpload, galleryController.replaceImage);
router.put('/gallery/photos/:photoId', ...manageGallery, galleryController.updatePhoto);
router.delete('/gallery/photos/:photoId', ...manageGallery, galleryController.deletePhoto);

// Static protected paths must be registered before /:hospitalId.
router.get('/profile', protect, authorize('hospital'), hospitalController.getHospitalProfile);
router.put('/profile', protect, authorize('hospital'), hospitalController.updateHospitalProfile);
router.get('/dashboard-stats', protect, authorize('hospital'), hospitalController.getDashboardStats);
router.get('/daily-qr', protect, authorize('hospital', 'hospital_admin'), dailyQrController.getToday);
router.put('/resources', protect, authorize('hospital'), hospitalController.updateResources);
router.get('/staff', protect, authorize('hospital'), hospitalController.getHospitalStaff);
router.post('/staff', protect, authorize('hospital'), hospitalController.addHospitalStaff);
router.put('/staff/:staffId', protect, authorize('hospital'), hospitalController.updateHospitalStaff);
router.put('/staff/:staffId/status', protect, authorize('hospital'), hospitalController.updateHospitalDoctorStatus);
router.delete('/staff/:staffId', protect, authorize('hospital'), hospitalController.deleteHospitalStaff);

// Public routes (no authentication required)
router.get('/nearby', hospitalController.getNearbyHospitals);
router.get('/all', hospitalController.getAllHospitals);
router.get('/:hospitalId/photos', galleryController.getPublicPhotos);
router.get('/:hospitalId/photos/:photoId/image', galleryController.serveImage);
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
router.get('/:hospitalId/navigation', hospitalController.getHospitalNavigation);
router.post('/:hospitalId/route', protect, hospitalController.getHospitalRoute);

// Get hospital doctors (public - for patients to book)
router.get('/:hospitalId/doctors', hospitalController.getHospitalDoctors);
router.get('/:hospitalId', hospitalController.getHospitalDetails);
// Protected routes (authentication required)
router.put('/:hospitalId', protect, authorize('hospital'), hospitalController.updateHospitalLocation);

// Staff management routes (hospital only)

module.exports = router;
