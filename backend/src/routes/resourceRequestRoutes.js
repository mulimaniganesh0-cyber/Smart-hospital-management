// src/routes/resourceRequestRoutes.js
const express = require('express');
const router = express.Router();
const resourceRequestController = require('../controllers/resourceRequestController');
const { protect, authorize } = require('../middleware/auth');

// Patient routes
router.post('/create', protect, resourceRequestController.createResourceRequest);
router.get('/my-requests', protect, resourceRequestController.getMyResourceRequests);
router.post('/blood', protect, resourceRequestController.createBloodRequest);
router.get('/blood/my-requests', protect, resourceRequestController.getMyBloodRequests);

// Hospital routes
router.get('/hospital', protect, authorize('hospital'), resourceRequestController.getHospitalResourceRequests);
router.get('/blood/hospital', protect, authorize('hospital'), resourceRequestController.getHospitalBloodRequests);
router.put('/:requestId/fulfill', protect, authorize('hospital'), resourceRequestController.fulfillResourceRequest);
router.put('/:requestId/reject', protect, authorize('hospital'), resourceRequestController.rejectResourceRequest);
router.put('/blood/:requestId/fulfill', protect, authorize('hospital'), resourceRequestController.fulfillBloodRequest);
router.put('/blood/:requestId/reject', protect, authorize('hospital'), resourceRequestController.rejectBloodRequest);

module.exports = router;