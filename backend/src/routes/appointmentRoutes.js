const express = require('express');
const router = express.Router();
const appointmentController = require('../controllers/appointmentController');
const { protect, authorize } = require('../middleware/auth');

router.get('/my-appointments', protect, appointmentController.getMyAppointments);
router.post('/create', protect, authorize('patient'), appointmentController.createAppointment);
router.get('/hospital-appointments', protect, authorize('hospital'), appointmentController.getHospitalAppointments);
router.put('/:appointmentId/status', protect, authorize('hospital'), appointmentController.updateAppointmentStatus);
router.delete('/:appointmentId/cancel', protect, authorize('patient'), appointmentController.cancelAppointment);

module.exports = router;
