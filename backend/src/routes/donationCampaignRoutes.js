// src/routes/donationCampaignRoutes.js
const express = require('express');
const router = express.Router();
const campaignController = require('../controllers/donationCampaignController');
const { protect, authorize } = require('../middleware/auth');

console.log('🔹 Loading campaign routes...');

// ==================== PUBLIC ROUTES ====================
router.get('/all', campaignController.getAllCampaigns);

// ==================== HOSPITAL ROUTES ====================
router.get('/hospital', protect, authorize('hospital'), campaignController.getHospitalCampaigns);
router.post('/create', protect, authorize('hospital'), campaignController.createCampaign);

// ==================== PATIENT ROUTES ====================
router.post('/register', protect, campaignController.registerForCampaign);
router.get('/my-registrations', protect, campaignController.getUserRegistrations);

// ==================== DONATION RECORDING ====================
router.post('/donation', protect, authorize('hospital'), campaignController.recordDonation);

// REST-shaped aliases for the same existing handlers.  They do not accept a
// hospital id from the client; ownership is still derived from the session.
router.post('/:campaignId/register', protect, (req, res, next) => {
  req.body.campaign_id = Number(req.params.campaignId);
  return campaignController.registerForCampaign(req, res, next);
});
router.post('/:campaignId/donations', protect, authorize('hospital'), campaignController.recordDonation);

// ==================== ADMIN ROUTES ====================
router.get('/admin/stats', protect, authorize('admin'), campaignController.getAdminCampaignStats);
router.put('/:campaignId/approve', protect, authorize('admin'), campaignController.approveCampaign);
router.put('/:campaignId/reject', protect, authorize('admin'), campaignController.rejectCampaign);

// ==================== PARAMETERIZED ROUTES ====================
router.get('/:campaignId', campaignController.getCampaignDetails);
router.get('/:campaignId/registrations', protect, authorize('hospital'), campaignController.getCampaignRegistrations);
router.get('/:campaignId/donations', protect, authorize('hospital'), campaignController.getCampaignDonationRecords);
router.put('/:campaignId/status', protect, authorize('hospital'), campaignController.updateCampaignStatus);

console.log('✅ Campaign routes loaded successfully');

module.exports = router;
