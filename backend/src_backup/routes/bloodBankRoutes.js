// src/routes/bloodBankRoutes.js
const express = require('express');
const router = express.Router();
const bloodBankController = require('../controllers/bloodBankController');
const { protect, authorize } = require('../middleware/auth');

console.log('🩸 Loading blood bank routes...');

// ==================== PUBLIC ROUTES ====================
router.get('/all', bloodBankController.getAllBloodBanks);

// ==================== BLOOD AVAILABILITY ====================
// IMPORTANT: Put specific routes BEFORE parameter routes
router.get('/hospital', protect, bloodBankController.getHospitalBloodBank);
router.get('/stock/expiry', protect, bloodBankController.getBloodStockWithExpiry);

// Blood availability by hospital ID - parameter route goes LAST
router.get('/:hospitalId', bloodBankController.getBloodAvailability);

// All routes below require authentication
router.use(protect);

// ==================== BLOOD REQUESTS (Patient) ====================
router.post('/request', bloodBankController.requestBlood);

// ==================== HOSPITAL ONLY ROUTES ====================

// Add blood with expiry
router.post('/add-expiry', authorize('hospital'), bloodBankController.addBloodWithExpiry);

// Add blood stock - POST to root (for backward compatibility)
router.post('/', authorize('hospital'), bloodBankController.addBloodWithExpiry);

// Update blood stock - PUT to /stock
router.put('/stock', authorize('hospital'), bloodBankController.updateBloodStock);

// Use blood units
router.post('/use', authorize('hospital'), bloodBankController.useBloodUnits);

// Donation history
router.get('/donation-history', authorize('hospital'), bloodBankController.getDonationHistory);

// Expiry notifications
router.get('/notifications', authorize('hospital'), bloodBankController.getBloodExpiryNotifications);
router.put('/notification/:notificationId/read', authorize('hospital'), bloodBankController.markNotificationRead);
router.put('/notifications/read-all', authorize('hospital'), bloodBankController.markAllNotificationsRead);

// Debug route
router.get('/debug', authorize('hospital'), bloodBankController.debugBloodBank);

// Check expiry
router.post('/check-expiry', authorize('hospital'), bloodBankController.checkBloodExpiry);

// Debug route
router.get('/debug/all', authorize('hospital'), bloodBankController.debugGetAllBloodBank);

console.log('✅ Blood bank routes loaded successfully');

module.exports = router;