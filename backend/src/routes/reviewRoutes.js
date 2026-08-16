const express = require('express'); const router = express.Router(); const reviews = require('../controllers/reviewController'); const { protect, authorize } = require('../middleware/auth');
router.get('/hospitals/:hospitalId/reviews', reviews.list); router.post('/hospitals/:hospitalId/reviews', protect, authorize('patient'), reviews.create); router.put('/hospital-reviews/:reviewId', protect, authorize('patient'), reviews.update); router.delete('/hospital-reviews/:reviewId', protect, authorize('patient'), reviews.remove);
router.get('/doctors/:doctorId/reviews', reviews.list); router.post('/doctors/:doctorId/reviews', protect, authorize('patient'), reviews.create); router.put('/doctor-reviews/:reviewId', protect, authorize('patient'), reviews.update); router.delete('/doctor-reviews/:reviewId', protect, authorize('patient'), reviews.remove);
router.get('/patients/me/reviews', protect, authorize('patient'), reviews.mine);
module.exports = router;
