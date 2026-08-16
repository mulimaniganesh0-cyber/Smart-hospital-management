const { pool } = require('../config/database');

const config = {
  hospital: { table: 'hospital_reviews', target: 'hospital_id', appointmentTarget: 'hospital_id' },
  doctor: { table: 'doctor_reviews', target: 'doctor_id', appointmentTarget: 'doctor_id' },
};

function typeOf(req) { return req.originalUrl.includes('/doctors/') || req.originalUrl.includes('/doctor-reviews/') ? 'doctor' : 'hospital'; }
async function patientId(userId) { return (await pool.query('SELECT id FROM patients WHERE user_id=$1', [userId])).rows[0]?.id; }
function validRating(value) { const rating = Number(value); return Number.isInteger(rating) && rating >= 1 && rating <= 5 ? rating : null; }

exports.list = async (req, res) => {
  try {
    const type = typeOf(req); const c = config[type]; const targetId = Number(req.params[`${type}Id`]);
    if (!Number.isInteger(targetId)) return res.status(400).json({ success: false, message: `Valid ${type} ID is required` });
    const result = await pool.query(`SELECT r.id,r.rating,r.review,r.created_at,r.updated_at,u.name patient_name
      FROM ${c.table} r JOIN patients p ON p.id=r.patient_id JOIN users u ON u.id=p.user_id
      WHERE r.${c.target}=$1 AND r.is_visible=true ORDER BY r.created_at DESC`, [targetId]);
    const stats = await pool.query(`SELECT ROUND(AVG(rating)::numeric,1) average_rating, COUNT(*) review_count FROM ${c.table} WHERE ${c.target}=$1 AND is_visible=true`, [targetId]);
    res.json({ success: true, data: result.rows, summary: { average_rating: stats.rows[0].average_rating == null ? null : Number(stats.rows[0].average_rating), review_count: Number(stats.rows[0].review_count) } });
  } catch (error) { res.status(500).json({ success: false, message: 'Unable to load reviews' }); }
};

exports.create = async (req, res) => {
  try {
    const type = typeOf(req); const c = config[type]; const targetId = Number(req.params[`${type}Id`]); const appointmentId = Number(req.body.appointment_id); const rating = validRating(req.body.rating);
    const pId = await patientId(req.user.id);
    if (!pId || !Number.isInteger(targetId) || !Number.isInteger(appointmentId) || rating === null) return res.status(400).json({ success: false, message: 'A completed appointment and a 1–5 star rating are required' });
    const appointment = await pool.query(`SELECT id FROM appointments WHERE id=$1 AND patient_id=$2 AND ${c.appointmentTarget}=$3 AND status='completed'`, [appointmentId, pId, targetId]);
    if (!appointment.rowCount) return res.status(403).json({ success: false, message: 'You can review only hospitals/doctors where you completed an appointment.' });
    const inserted = await pool.query(`INSERT INTO ${c.table}(${c.target},patient_id,appointment_id,rating,review) VALUES($1,$2,$3,$4,$5) RETURNING *`, [targetId, pId, appointmentId, rating, String(req.body.review || '').trim().slice(0, 2000) || null]);
    res.status(201).json({ success: true, data: inserted.rows[0] });
  } catch (error) { if (error.code === '23505') return res.status(409).json({ success: false, message: 'You have already reviewed this appointment.' }); res.status(500).json({ success: false, message: 'Unable to submit review' }); }
};

exports.update = async (req, res) => {
  try {
    const type = typeOf(req); const c = config[type]; const reviewId = Number(req.params.reviewId); const rating = validRating(req.body.rating); const pId = await patientId(req.user.id);
    if (!pId || !Number.isInteger(reviewId) || rating === null) return res.status(400).json({ success: false, message: 'A 1–5 star rating is required' });
    const result = await pool.query(`UPDATE ${c.table} SET rating=$1,review=$2,updated_at=CURRENT_TIMESTAMP WHERE id=$3 AND patient_id=$4 RETURNING *`, [rating, String(req.body.review || '').trim().slice(0, 2000) || null, reviewId, pId]);
    if (!result.rowCount) return res.status(403).json({ success: false, message: 'You can edit only your own review' }); res.json({ success: true, data: result.rows[0] });
  } catch (_) { res.status(500).json({ success: false, message: 'Unable to update review' }); }
};

exports.remove = async (req, res) => {
  try { const c = config[typeOf(req)]; const pId = await patientId(req.user.id); const result = await pool.query(`DELETE FROM ${c.table} WHERE id=$1 AND patient_id=$2 RETURNING id`, [Number(req.params.reviewId), pId]); if (!result.rowCount) return res.status(403).json({ success: false, message: 'You can delete only your own review' }); res.json({ success: true }); } catch (_) { res.status(500).json({ success: false, message: 'Unable to delete review' }); }
};

exports.mine = async (req, res) => {
  try { const pId = await patientId(req.user.id); const result = await pool.query(`SELECT 'hospital' review_type,r.id,r.rating,r.review,r.appointment_id,h.name target_name FROM hospital_reviews r JOIN hospitals h ON h.id=r.hospital_id WHERE r.patient_id=$1 UNION ALL SELECT 'doctor',r.id,r.rating,r.review,r.appointment_id,d.name FROM doctor_reviews r JOIN doctors d ON d.id=r.doctor_id WHERE r.patient_id=$1 ORDER BY id DESC`, [pId]); res.json({ success: true, data: result.rows }); } catch (_) { res.status(500).json({ success: false, message: 'Unable to load your reviews' }); }
};
