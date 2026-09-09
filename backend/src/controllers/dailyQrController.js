const crypto = require('crypto');
const { pool } = require('../config/database');

// Keep the queue day server-owned. Configure this per deployment; clients
// never supply or calculate dates for authorization decisions.
const timezone = process.env.HOSPITAL_TIMEZONE || 'Asia/Kolkata';
const payloadFor = (token) => `careguide://hospital-queue/${token}`;

async function authorizedHospitalId(db, userId) {
  return (await db.query(`SELECT h.id FROM hospitals h
    LEFT JOIN users u ON u.id=$1
    WHERE h.user_id=$1 OR h.id=u.hospital_id
    LIMIT 1`, [userId])).rows[0]?.id;
}

async function todayWindow(db) {
  const result = await db.query(`SELECT
    (CURRENT_TIMESTAMP AT TIME ZONE $1)::date AS qr_date,
    ((CURRENT_TIMESTAMP AT TIME ZONE $1)::date::timestamp AT TIME ZONE $1) AS valid_from,
    (((CURRENT_TIMESTAMP AT TIME ZONE $1)::date + 1)::timestamp AT TIME ZONE $1) AS valid_until`, [timezone]);
  return result.rows[0];
}

function serialize(row) {
  return {
    id: row.id, hospitalId: row.hospital_id, date: row.qr_date,
    payload: payloadFor(row.qr_token), status: row.status,
    validFrom: row.valid_from, validUntil: row.valid_until,
  };
}

exports.getToday = async (req, res) => {
  const client = await pool.connect();
  try {
    const hospitalId = await authorizedHospitalId(client, req.user.id);
    if (!hospitalId) return res.status(403).json({ success: false, message: 'You are not authorized to manage a hospital QR.' });
    const window = await todayWindow(client);
    await client.query('BEGIN');
    // Preserve historical records while keeping stale ACTIVE rows visibly expired.
    await client.query(`UPDATE hospital_daily_qr SET status='EXPIRED', updated_at=CURRENT_TIMESTAMP
      WHERE hospital_id=$1 AND status='ACTIVE' AND valid_until <= CURRENT_TIMESTAMP`, [hospitalId]);
    const token = crypto.randomBytes(32).toString('base64url');
    const result = await client.query(`INSERT INTO hospital_daily_qr
      (hospital_id, qr_date, qr_token, valid_from, valid_until)
      VALUES ($1,$2,$3,$4,$5)
      ON CONFLICT (hospital_id, qr_date) DO UPDATE SET updated_at=hospital_daily_qr.updated_at
      RETURNING *`, [hospitalId, window.qr_date, token, window.valid_from, window.valid_until]);
    await client.query('COMMIT');
    res.json({ success: true, qr: serialize(result.rows[0]) });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    res.status(500).json({ success: false, message: 'Unable to load today\'s hospital QR.' });
  } finally { client.release(); }
};

// The request path above is the correctness mechanism. This worker simply
// pre-warms records at day rollover so a hospital can display its QR instantly.
exports.ensureTodayForHospitals = async () => {
  const client = await pool.connect();
  try {
    const window = await todayWindow(client);
    const hospitals = await client.query('SELECT id FROM hospitals');
    for (const hospital of hospitals.rows) {
      await client.query(`INSERT INTO hospital_daily_qr
        (hospital_id, qr_date, qr_token, valid_from, valid_until)
        VALUES ($1,$2,$3,$4,$5) ON CONFLICT (hospital_id, qr_date) DO NOTHING`,
      [hospital.id, window.qr_date, crypto.randomBytes(32).toString('base64url'), window.valid_from, window.valid_until]);
    }
    await client.query(`UPDATE hospital_daily_qr SET status='EXPIRED', updated_at=CURRENT_TIMESTAMP
      WHERE status='ACTIVE' AND valid_until <= CURRENT_TIMESTAMP`);
  } finally { client.release(); }
};

exports.payloadFor = payloadFor;
exports.timezone = timezone;
