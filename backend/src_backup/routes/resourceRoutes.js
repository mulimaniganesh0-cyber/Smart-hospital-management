// src/routes/resourceRoutes.js

const express = require('express');
const router = express.Router();
const resourceController = require('../controllers/resourceController');
const { protect, authorize } = require('../middleware/auth');

console.log('🔹 Loading resource routes...');

// ==================== PUBLIC ROUTES ====================
router.get('/nearby', resourceController.getNearbyHospitals);
router.get('/hospital/:hospital_id/resources', resourceController.getAvailableResources);

// ==================== RESOURCE REQUESTS ====================
router.post('/request', protect, resourceController.requestResource);
router.get('/my-requests', protect, resourceController.getMyResourceRequests);
router.get('/hospital-requests', protect, authorize('hospital'), resourceController.getHospitalResourceRequests);
router.put('/request/:requestId/fulfill', protect, authorize('hospital'), resourceController.fulfillResourceRequest);
router.put('/request/:requestId/reject', protect, authorize('hospital'), resourceController.rejectResourceRequest);
router.put('/free-resource', protect, authorize('hospital'), resourceController.freeResource);

// ==================== BLOOD REQUESTS ====================
router.post('/blood/request', protect, resourceController.requestBlood);
router.get('/blood/my-requests', protect, resourceController.getMyBloodRequests);
router.get('/blood/hospital/requests', protect, authorize('hospital'), resourceController.getHospitalBloodRequests);
router.put('/blood/request/:requestId/fulfill', protect, authorize('hospital'), resourceController.fulfillBloodRequest);
router.put('/blood/request/:requestId/reject', protect, authorize('hospital'), resourceController.rejectBloodRequest);

// ==================== BLOOD BANK MANAGEMENT ====================
// src/routes/resourceRoutes.js

// ==================== BLOOD BANK MANAGEMENT ====================
router.get('/blood-bank', protect, authorize('hospital'), resourceController.getHospitalBloodBank);
router.get('/blood-bank/:hospitalId', protect, resourceController.getBloodBank);
router.post('/blood-bank/add-expiry', protect, authorize('hospital'), resourceController.addBloodStockWithExpiry);
router.put('/blood-bank/update', protect, authorize('hospital'), resourceController.updateBloodStock);
router.delete('/blood-bank/:bloodGroup', protect, authorize('hospital'), resourceController.deleteBloodStock);
router.get('/blood-bank/stock/expiry', protect, authorize('hospital'), resourceController.getHospitalBloodBank);

console.log('✅ Resource routes loaded successfully');

module.exports = router;