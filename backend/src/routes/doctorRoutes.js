const express = require('express');
const router = express.Router();
const doctorController = require('../controllers/doctorController');

router.get('/', doctorController.listDoctors);
// Explicit aliases keep the public API readable while using the same
// PostgreSQL-backed search implementation as CareGuide.
router.get('/search', doctorController.listDoctors);
router.get('/specialties', async (req, res) => {
  try {
    const { pool } = require('../config/database');
    const result = await pool.query('SELECT DISTINCT specialization FROM doctors WHERE specialization IS NOT NULL AND specialization != \'\' ORDER BY specialization');
    res.json({ success: true, count: result.rows.length, data: result.rows.map(r => r.specialization) });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Unable to load doctor specialties' });
  }
});
router.get('/:id', doctorController.getDoctor);

module.exports = router;
