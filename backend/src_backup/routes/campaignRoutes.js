// src/routes/campaignRoutes.js
const express = require('express');
const router = express.Router();
const campaignController = require('../controllers/campaignController');
const { protect, authorize } = require('../middleware/auth');

console.log('🔹 Loading campaign routes...');

// ==================== HOSPITAL ROUTES ====================
// Get all campaigns for a hospital
router.get('/hospital', protect, authorize('hospital'), campaignController.getHospitalCampaigns);

// Create a new campaign
router.post('/create', protect, authorize('hospital'), campaignController.createCampaign);

// Get campaign details with donors and blood summary
router.get('/:campaignId/details', protect, authorize('hospital'), campaignController.getCampaignDetails);

// Get campaign donors list
router.get('/:campaignId/donors', protect, authorize('hospital'), campaignController.getCampaignDonors);

// Register a donor (also updates blood bank)
router.post('/donor/register', protect, authorize('hospital'), campaignController.registerDonor);

// Update campaign status
router.put('/:campaignId/status', protect, authorize('hospital'), campaignController.updateCampaignStatus);

// ==================== ADMIN ROUTES ====================
router.get('/admin/stats', protect, authorize('admin'), campaignController.getAdminCampaignStats);

console.log('✅ Campaign routes loaded successfully');

module.exports = router;