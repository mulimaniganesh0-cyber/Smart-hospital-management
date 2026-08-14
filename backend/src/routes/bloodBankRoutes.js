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

// Declare named endpoints before /:hospitalId so they are never parsed as IDs.
router.get('/stock', protect, authorize('hospital'), bloodBankController.getBloodStockWithExpiry);

// Blood request (patient)
router.post('/request', protect, bloodBankController.requestBlood);

// Emergency blood request (patient - auto-approved)
router.post('/emergency-request', protect, bloodBankController.emergencyBloodRequest);

// Update blood stock (hospital)
router.put('/stock', protect, authorize('hospital'), bloodBankController.updateBloodStock);
router.delete('/stock/:bloodGroup', protect, authorize('hospital'), bloodBankController.deleteBloodStock);

// Add blood with expiry (hospital)
router.post('/add-expiry', protect, authorize('hospital'), bloodBankController.addBloodWithExpiry);

// Use blood units (hospital)
router.post('/use', protect, authorize('hospital'), bloodBankController.useBloodUnits);

// Approve / Reject blood requests (hospital)
router.put('/request/:requestId/approve', protect, authorize('hospital'), bloodBankController.approveBloodRequest);
router.put('/request/:requestId/reject', protect, authorize('hospital'), bloodBankController.rejectBloodRequest);

// Inter-hospital blood transfer (hospital)
router.post('/transfer', protect, authorize('hospital'), bloodBankController.transferBlood);

// Blood bank analytics (hospital)
router.get('/analytics', protect, authorize('hospital'), bloodBankController.getBloodBankAnalytics);

// Donation history (hospital)
router.get('/donation-history', protect, authorize('hospital'), bloodBankController.getDonationHistory);

// Expiry notifications (hospital)
router.get('/notifications', protect, authorize('hospital'), bloodBankController.getBloodExpiryNotifications);
router.put('/notification/:notificationId/read', protect, authorize('hospital'), bloodBankController.markNotificationRead);
router.put('/notifications/read-all', protect, authorize('hospital'), bloodBankController.markAllNotificationsRead);

// Check expiry (hospital)
router.post('/check-expiry', protect, authorize('hospital'), bloodBankController.checkBloodExpiry);

// Debug
router.get('/debug/all', protect, authorize('hospital'), bloodBankController.debugGetAllBloodBank);

// Parameterized route must remain last.
router.get('/:hospitalId', bloodBankController.getBloodAvailability);

module.exports = router;
