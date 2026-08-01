// src/routes/ambulanceRoutes.js
const express = require('express');
const router = express.Router();
const ambulanceController = require('../controllers/ambulanceController');
const { protect, authorize } = require('../middleware/auth');

// ==================== PUBLIC ROUTES ====================
router.get('/nearby', ambulanceController.getNearbyAmbulances);

// ==================== PATIENT ROUTES ====================
router.post('/book', protect, ambulanceController.bookAmbulance);
router.get('/bookings', protect, ambulanceController.getMyAmbulanceBookings);

// ==================== HOSPITAL ROUTES ====================
router.post('/register', protect, authorize('hospital'), ambulanceController.registerAmbulance);
router.get('/hospital', protect, authorize('hospital'), ambulanceController.getHospitalAmbulances);
router.put('/:ambulanceId', protect, authorize('hospital'), ambulanceController.updateAmbulance);
router.put('/:ambulanceId/availability', protect, authorize('hospital'), ambulanceController.updateAmbulanceAvailability);
router.put('/assign/:bookingId', protect, authorize('hospital'), ambulanceController.assignAmbulanceToBooking);
router.put('/booking/:bookingId/status', protect, authorize('hospital'), ambulanceController.updateBookingStatus);
router.get('/hospital/bookings', protect, authorize('hospital'), ambulanceController.getHospitalAmbulanceBookings);

module.exports = router;