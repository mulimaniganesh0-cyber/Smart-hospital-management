const { pool } = require('../config/database');
const { createNotification } = require('./notificationService');

const waiting = ['BOOKED', 'CHECKED_IN', 'WAITING'];

async function averageDurationSeconds(db, queue) {
  const result = await db.query(
    `SELECT AVG(consultation_duration_seconds)::int AS seconds
       FROM (SELECT t.consultation_duration_seconds FROM queue_tokens t
             JOIN hospital_queues q ON q.id=t.queue_id
             WHERE q.hospital_id=$1
               AND q.doctor_id IS NOT DISTINCT FROM $2
               AND q.department IS NOT DISTINCT FROM $3
               AND t.consultation_duration_seconds IS NOT NULL
             ORDER BY t.completed_at DESC LIMIT 10) recent`,
    [queue.hospital_id, queue.doctor_id, queue.department],
  );
  return result.rows[0]?.seconds || queue.default_consultation_minutes * 60;
}

async function calculateQueueETA(queueId, { db = pool } = {}) {
  const queueResult = await db.query('SELECT * FROM hospital_queues WHERE id=$1', [queueId]);
  const queue = queueResult.rows[0];
  if (!queue) return null;
  const averageSeconds = await averageDurationSeconds(db, queue);
  const serving = (await db.query(`SELECT * FROM queue_tokens WHERE queue_id=$1 AND status IN ('CALLED','SERVING') ORDER BY serving_at DESC NULLS LAST LIMIT 1`, [queueId])).rows[0];
  let cursor = new Date();
  if (serving?.serving_at) {
    const elapsed = Math.max(0, (Date.now() - new Date(serving.serving_at).getTime()) / 1000);
    cursor = new Date(Date.now() + Math.max(0, averageSeconds - elapsed) * 1000);
  }
  const tokens = (await db.query(`SELECT * FROM queue_tokens WHERE queue_id=$1 AND status = ANY($2::text[]) ORDER BY token_number`, [queueId, waiting])).rows;
  for (const token of tokens) {
    await db.query(`UPDATE queue_tokens SET estimated_turn_at=$1, estimated_wait_minutes=$2, updated_at=CURRENT_TIMESTAMP WHERE id=$3`, [cursor, Math.max(0, Math.ceil((cursor.getTime() - Date.now()) / 60000)), token.id]);
    cursor = new Date(cursor.getTime() + averageSeconds * 1000);
  }
  return { queue, averageSeconds, currentToken: serving?.token_number || queue.current_token_number, tokens: (await db.query(`SELECT id,patient_id,token_number,status,estimated_turn_at,estimated_wait_minutes FROM queue_tokens WHERE queue_id=$1 AND status = ANY($2::text[]) ORDER BY token_number`, [queueId, waiting])).rows };
}

async function sendOnce({ db = pool, io, token, type, title, message, priority = 'normal' }) {
  const user = (await db.query('SELECT user_id FROM patients WHERE id=$1', [token.patient_id])).rows[0];
  if (!user) return false;
  try {
    await createNotification({ db, io, recipientUserId: user.user_id, hospitalId: token.hospital_id, patientId: token.patient_id, type, priority, relatedType: 'queue_token', relatedId: token.id, title, message });
    return true;
  } catch (error) {
    if (error.code === '23505') return false;
    throw error;
  }
}

async function processDueQueueNotifications({ db = pool, io } = {}) {
  const approaching = (await db.query(`SELECT t.*,q.hospital_id,q.department,h.name hospital_name,
      (SELECT COUNT(*) FROM queue_tokens ahead WHERE ahead.queue_id=t.queue_id AND ahead.token_number<t.token_number AND ahead.status IN ('BOOKED','CHECKED_IN','WAITING','CALLED','SERVING'))::int patients_ahead
      FROM queue_tokens t JOIN hospital_queues q ON q.id=t.queue_id JOIN hospitals h ON h.id=q.hospital_id
      WHERE t.status IN ('BOOKED','CHECKED_IN','WAITING')`)).rows;
  for (const token of approaching) {
    if (token.patients_ahead <= 1) await sendOnce({ db, io, token, type:'token_next', priority:'high', title:'Your token is next', message:`Token #${token.token_number} is next at ${token.hospital_name}. Please be ready.` });
    else if (token.patients_ahead <= 3) await sendOnce({ db, io, token, type:'token_approaching_3', title:'Your token is approaching', message:`${token.patients_ahead} patients are ahead of token #${token.token_number}.` });
  }
  const tokens = (await db.query(`SELECT t.*,q.hospital_id,q.department,h.name hospital_name FROM queue_tokens t JOIN hospital_queues q ON q.id=t.queue_id JOIN hospitals h ON h.id=q.hospital_id WHERE t.status IN ('BOOKED','CHECKED_IN','WAITING') AND t.estimated_turn_at <= CURRENT_TIMESTAMP`)).rows;
  for (const token of tokens) await sendOnce({ db, io, token, type: 'token_eta_reached', title: 'Estimated turn time reached', message: `Your estimated turn time has arrived at ${token.hospital_name}. Please be ready.` });
}

module.exports = { calculateQueueETA, averageDurationSeconds, processDueQueueNotifications, sendOnce };
