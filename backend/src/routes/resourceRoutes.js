// src/routes/resourceRoutes.js
const express = require('express');
const router = express.Router();
const resourceController = require('../controllers/resourceController');
const { protect, authorize } = require('../middleware/auth');

console.log('🔹 Loading resource routes...');

// ==================== RESOURCE REQUESTS ====================

// Patient routes
router.post('/request', protect, resourceController.requestResource);
router.get('/my-requests', protect, resourceController.getMyResourceRequests);

// Hospital routes
router.get('/hospital-requests', protect, authorize('hospital'), resourceController.getHospitalResourceRequests);
router.put('/request/:requestId/fulfill', protect, authorize('hospital'), resourceController.fulfillResourceRequest);
router.put('/request/:requestId/reject', protect, authorize('hospital'), resourceController.rejectResourceRequest);

// Free resource (after patient discharge)
router.put('/free-resource', protect, authorize('hospital'), resourceController.freeResource);

// Public route to check hospital resources
router.get('/hospital/:hospital_id/resources', resourceController.getAvailableResources);

// ==================== BLOOD REQUESTS ====================

// Patient blood routes
router.post('/blood/request', protect, resourceController.requestBlood);
router.get('/blood/my-requests', protect, resourceController.getMyBloodRequests);

// Hospital blood routes
router.get('/blood/hospital/requests', protect, authorize('hospital'), resourceController.getHospitalBloodRequests);
router.put('/blood/request/:requestId/fulfill', protect, authorize('hospital'), resourceController.fulfillBloodRequest);
router.put('/blood/request/:requestId/reject', protect, authorize('hospital'), resourceController.rejectBloodRequest);

console.log('✅ Resource routes loaded successfully');

module.exports = router;