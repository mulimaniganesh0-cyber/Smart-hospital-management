// src/routes/bloodBankRoutes.js
const express = require('express');
const router = express.Router();
const bloodBankController = require('../controllers/bloodBankController');
const { protect, authorize } = require('../middleware/auth');

// ==================== PUBLIC ROUTES ====================
router.get('/all', bloodBankController.getAllBloodBanks);

// ==================== HOSPITAL PROTECTED ROUTES ====================

// Blood stock with expiry (HOSPITAL only)
router.get('/stock/expiry', protect, authorize('hospital'), bloodBankController.getBloodStockWithExpiry);

// Blood availability by hospital (public)
router.get('/:hospitalId', bloodBankController.getBloodAvailability);

// Blood request (patient)
router.post('/request', protect, bloodBankController.requestBlood);

// Update blood stock (hospital)
router.put('/stock', protect, authorize('hospital'), bloodBankController.updateBloodStock);

// Add blood with expiry (hospital)
router.post('/add-expiry', protect, authorize('hospital'), bloodBankController.addBloodWithExpiry);

// Use blood units (hospital)
router.post('/use', protect, authorize('hospital'), bloodBankController.useBloodUnits);

// Donation history (hospital)
router.get('/donation-history', protect, authorize('hospital'), bloodBankController.getDonationHistory);

// Expiry notifications (hospital)
router.get('/notifications', protect, authorize('hospital'), bloodBankController.getBloodExpiryNotifications);
router.put('/notification/:notificationId/read', protect, authorize('hospital'), bloodBankController.markNotificationRead);
router.put('/notifications/read-all', protect, authorize('hospital'), bloodBankController.markAllNotificationsRead);

// Check expiry (hospital)
router.post('/check-expiry', protect, authorize('hospital'), bloodBankController.checkBloodExpiry);
// src/routes/bloodBankRoutes.js
router.get('/debug/all', protect, authorize('hospital'), bloodBankController.debugGetAllBloodBank);

module.exports = router;