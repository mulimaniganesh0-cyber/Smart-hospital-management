const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const appointmentController = require('../controllers/appointmentController');
const { protect } = require('../middleware/auth');

// GET hospital appointments
router.get('/hospital-appointments', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM appointments ORDER BY id DESC');
    res.json({ success: true, data: result.rows });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

// ✅ UPDATE APPOINTMENT STATUS
router.put('/:id/status', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  try {
    await pool.query(
      'UPDATE appointments SET status = $1 WHERE id = $2',
      [status, id]
    );

    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

router.get('/my-appointments', protect, appointmentController.getMyAppointments);
router.post('/create', protect, appointmentController.createAppointment);
router.put('/:appointmentId/status', protect, appointmentController.updateAppointmentStatus);
router.delete('/:appointmentId/cancel', protect, appointmentController.cancelAppointment);

// Hospital routes
router.get('/hospital-appointments', protect, appointmentController.getHospitalAppointments);

module.exports = router;