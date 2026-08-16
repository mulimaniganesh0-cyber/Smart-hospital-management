const { searchDoctors } = require('../services/careGuideService');
const { pool } = require('../config/database');

exports.listDoctors = async (req, res) => {
  try {
    const { specialty, hospital_id, latitude, longitude, available, limit } = req.query;
    if (available === 'false') return res.status(400).json({ success: false, message: 'Only patient-bookable doctors are exposed by this endpoint' });
    let doctors = await searchDoctors({ specialty, latitude, longitude, limit });
    if (hospital_id) doctors = doctors.filter((doctor) => doctor.hospital_id === Number(hospital_id));
    res.json({ success: true, count: doctors.length, data: doctors });
  } catch (error) {
    console.error('List doctors error:', error);
    res.status(500).json({ success: false, message: 'Unable to search doctors' });
  }
};

exports.getDoctor = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ success: false, message: 'Valid doctor ID is required' });
    const result = await pool.query(`SELECT d.id, d.name, d.specialization, d.qualification, d.experience_years, d.consultation_fee, d.phone,
      h.id hospital_id, h.name hospital_name, h.address hospital_address
      FROM doctors d JOIN hospitals h ON h.id=d.hospital_id WHERE d.id=$1 AND h.is_verified=true`, [id]);
    if (!result.rowCount) return res.status(404).json({ success: false, message: 'Doctor not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (error) { res.status(500).json({ success: false, message: 'Unable to load doctor' }); }
};
