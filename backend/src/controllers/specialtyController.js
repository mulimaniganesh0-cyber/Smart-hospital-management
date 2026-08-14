const { pool } = require('../config/database');

// Existing installations store hospital specialties in hospitals.specialties (TEXT[]).
exports.getSpecialties = async (_req, res) => {
  try {
    const result = await pool.query(`SELECT specialty AS name, COUNT(*)::int AS hospital_count FROM hospitals h CROSS JOIN LATERAL unnest(COALESCE(h.specialties, '{}')) AS specialty WHERE h.is_verified = true GROUP BY specialty ORDER BY specialty`);
    res.json({ success: true, count: result.rowCount, data: result.rows });
  } catch (error) {
    console.error('Get specialties error:', error);
    res.status(500).json({ success: false, message: 'Unable to load specialties' });
  }
};
