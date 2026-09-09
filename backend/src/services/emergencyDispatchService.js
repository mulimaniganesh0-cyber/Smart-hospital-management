const { pool } = require('../config/database');
const RESPONSE_SECONDS = Math.max(15, Number(process.env.EMERGENCY_HOSPITAL_RESPONSE_TIMEOUT_SECONDS || 30));
const RADIUS_KM = Math.max(1, Number(process.env.EMERGENCY_SEARCH_RADIUS_KM || 30));

const distanceSql = `(6371 * acos(LEAST(1, GREATEST(-1, cos(radians($1))*cos(radians(h.latitude))*cos(radians(h.longitude)-radians($2))+sin(radians($1))*sin(radians(h.latitude))))))`;

async function rankHospitals(db, latitude, longitude) {
  if (!Number.isFinite(Number(latitude)) || !Number.isFinite(Number(longitude))) return [];
  const result = await db.query(`SELECT h.id, ${distanceSql} AS distance FROM hospitals h
    WHERE h.is_verified=TRUE AND h.emergency_available=TRUE AND h.latitude IS NOT NULL AND h.longitude IS NOT NULL
      AND ${distanceSql} <= $3 ORDER BY distance, h.id`, [Number(latitude), Number(longitude), RADIUS_KM]);
  return result.rows;
}

async function notifyNext(db, emergencyId) {
  const next = await db.query(`SELECT * FROM emergency_hospital_dispatches WHERE emergency_id=$1 AND status='PENDING' ORDER BY sequence_number FOR UPDATE SKIP LOCKED LIMIT 1`, [emergencyId]);
  if (!next.rows[0]) {
    await db.query(`UPDATE emergency_requests SET escalation_exhausted_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND accepting_hospital_id IS NULL`, [emergencyId]);
    return { exhausted: true };
  }
  const attempt = next.rows[0];
  const updated = await db.query(`UPDATE emergency_hospital_dispatches SET status='NOTIFIED', notified_at=CURRENT_TIMESTAMP, response_deadline=CURRENT_TIMESTAMP + ($2 * INTERVAL '1 second'), updated_at=CURRENT_TIMESTAMP WHERE id=$1 RETURNING *`, [attempt.id, RESPONSE_SECONDS]);
  await db.query(`UPDATE emergency_requests SET hospital_id=$2,status='pending',updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND accepting_hospital_id IS NULL`, [emergencyId, attempt.hospital_id]);
  return { attempt: updated.rows[0] };
}

async function createDispatches(db, emergency) {
  const hospitals = await rankHospitals(db, emergency.location_lat, emergency.location_lng);
  for (const [index, hospital] of hospitals.entries()) await db.query(`INSERT INTO emergency_hospital_dispatches(emergency_id,hospital_id,sequence_number) VALUES($1,$2,$3)`, [emergency.id, hospital.id, index + 1]);
  return notifyNext(db, emergency.id);
}

async function respond(db, emergencyId, hospitalId, action, reason) {
  const emergency = await db.query('SELECT * FROM emergency_requests WHERE id=$1 FOR UPDATE', [emergencyId]);
  if (!emergency.rows[0]) throw Object.assign(new Error('Emergency not found'), { status: 404 });
  const attempt = await db.query(`SELECT * FROM emergency_hospital_dispatches WHERE emergency_id=$1 AND hospital_id=$2 AND status='NOTIFIED' FOR UPDATE`, [emergencyId, hospitalId]);
  if (!attempt.rows[0]) throw Object.assign(new Error('This SOS is not awaiting this hospital'), { status: 409 });
  if (action === 'accept') {
    if (emergency.rows[0].accepting_hospital_id) throw Object.assign(new Error('Emergency already accepted'), { status: 409 });
    await db.query(`UPDATE emergency_hospital_dispatches SET status='ACCEPTED',responded_at=CURRENT_TIMESTAMP,accepted_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=$1`, [attempt.rows[0].id]);
    const updated = await db.query(`UPDATE emergency_requests SET accepting_hospital_id=$2,hospital_id=$2,status='accepted',assigned_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=$1 RETURNING *`, [emergencyId,hospitalId]);
    await db.query(`UPDATE emergency_hospital_dispatches SET status='CANCELLED',updated_at=CURRENT_TIMESTAMP WHERE emergency_id=$1 AND status='PENDING'`, [emergencyId]);
    return { emergency: updated.rows[0], attempt: attempt.rows[0], accepted: true };
  }
  await db.query(`UPDATE emergency_hospital_dispatches SET status='REJECTED',responded_at=CURRENT_TIMESTAMP,rejected_at=CURRENT_TIMESTAMP,rejection_reason=$2,updated_at=CURRENT_TIMESTAMP WHERE id=$1`, [attempt.rows[0].id, reason || null]);
  return { emergency: emergency.rows[0], ...(await notifyNext(db, emergencyId)), rejected: true };
}

async function processExpiredDispatches() {
  const client = await pool.connect(); let events=[];
  try { await client.query('BEGIN'); const expired = await client.query(`SELECT d.* FROM emergency_hospital_dispatches d JOIN emergency_requests e ON e.id=d.emergency_id WHERE d.status='NOTIFIED' AND d.response_deadline <= CURRENT_TIMESTAMP AND e.accepting_hospital_id IS NULL FOR UPDATE SKIP LOCKED`);
    for (const attempt of expired.rows) { await client.query(`UPDATE emergency_hospital_dispatches SET status='TIMED_OUT',timed_out_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=$1`,[attempt.id]); events.push({ emergencyId:attempt.emergency_id, ...(await notifyNext(client,attempt.emergency_id)), timedOut:true }); }
    await client.query('COMMIT'); return events;
  } catch(e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
}
module.exports={ RESPONSE_SECONDS, createDispatches, respond, processExpiredDispatches };
