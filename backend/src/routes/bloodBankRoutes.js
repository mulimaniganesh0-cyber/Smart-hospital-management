// src/routes/bloodBankRoutes.js
const express = require('express');
const router = express.Router();
const bloodBankController = require('../controllers/bloodBankController');
const { protect, authorize } = require('../middleware/auth');

// ==================== PUBLIC ROUTES ====================
router.get('/all', bloodBankController.getAllBloodBanks);

// ==================== HOSPITAL PROTECTED ROUTES ====================

// Blood stock with expiry (HOSPITAL only)
router.get('/stock/expiry', protect, authorize('hospital', 'admin'), bloodBankController.getBloodStockWithExpiry);

// Declare named endpoints before /:hospitalId so they are never parsed as IDs.
router.get('/stock', protect, authorize('hospital', 'admin'), bloodBankController.getBloodStockWithExpiry);

// Update blood stock (hospital)
router.put('/stock', protect, authorize('hospital', 'admin'), bloodBankController.updateBloodStock);
router.delete('/stock/:bloodGroup', protect, authorize('hospital', 'admin'), bloodBankController.deleteBloodStock);

// Add blood with expiry (hospital)
router.post('/add-expiry', protect, authorize('hospital', 'admin'), bloodBankController.addBloodWithExpiry);

// Use blood units (hospital)
router.post('/use', protect, authorize('hospital', 'admin'), bloodBankController.useBloodUnits);

// Hospital blood requests listing & management
router.get('/requests/hospital', protect, authorize('hospital', 'admin'), bloodBankController.getHospitalBloodRequests);
router.get('/hospital/requests', protect, authorize('hospital', 'admin'), bloodBankController.getHospitalBloodRequests);
router.get('/requests', protect, authorize('hospital', 'admin'), bloodBankController.getHospitalBloodRequests);

// Approve / Fulfill / Reject blood requests (hospital)
router.put('/requests/:requestId/fulfill', protect, authorize('hospital', 'admin'), bloodBankController.approveBloodRequest);
router.put('/request/:requestId/fulfill', protect, authorize('hospital', 'admin'), bloodBankController.approveBloodRequest);
router.put('/requests/:requestId/approve', protect, authorize('hospital', 'admin'), bloodBankController.approveBloodRequest);
router.put('/request/:requestId/approve', protect, authorize('hospital', 'admin'), bloodBankController.approveBloodRequest);
router.put('/requests/:requestId/reject', protect, authorize('hospital', 'admin'), bloodBankController.rejectBloodRequest);
router.put('/request/:requestId/reject', protect, authorize('hospital', 'admin'), bloodBankController.rejectBloodRequest);

// Blood request (patient)
router.post('/request', protect, bloodBankController.requestBlood);
router.post('/emergency-request', protect, bloodBankController.emergencyBloodRequest);
router.get('/my-requests', protect, bloodBankController.getMyBloodRequests);
router.get('/requests/my', protect, bloodBankController.getMyBloodRequests);

// Inter-hospital blood transfer (hospital)
router.post('/transfer', protect, authorize('hospital', 'admin'), bloodBankController.transferBlood);

// Blood bank analytics (hospital)
router.get('/analytics', protect, authorize('hospital', 'admin'), bloodBankController.getBloodBankAnalytics);

// Donation history (hospital)
router.get('/donation-history', protect, authorize('hospital', 'admin'), bloodBankController.getDonationHistory);

// Expiry notifications (hospital)
router.get('/notifications', protect, authorize('hospital', 'admin'), bloodBankController.getBloodExpiryNotifications);
router.put('/notification/:notificationId/read', protect, authorize('hospital', 'admin'), bloodBankController.markNotificationRead);
router.put('/notifications/read-all', protect, authorize('hospital', 'admin'), bloodBankController.markAllNotificationsRead);

// Check expiry (hospital)
router.post('/check-expiry', protect, authorize('hospital', 'admin'), bloodBankController.checkBloodExpiry);

// Debug
router.get('/debug/all', protect, authorize('hospital', 'admin'), bloodBankController.debugGetAllBloodBank);

// Parameterized route must remain last.
router.get('/:hospitalId', bloodBankController.getBloodAvailability);

module.exports = router;
