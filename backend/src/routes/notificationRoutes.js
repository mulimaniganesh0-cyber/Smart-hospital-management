const router = require('express').Router();
const controller = require('../controllers/notificationController');
const { protect } = require('../middleware/auth');
router.get('/', protect, controller.getMyNotifications);
router.put('/:notificationId/read', protect, controller.markRead);
module.exports = router;
