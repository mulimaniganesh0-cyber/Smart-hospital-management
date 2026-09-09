const { pool } = require('../config/database');
const { createNotification, notifyHospital } = require('../services/notificationService');
const { calculateQueueETA, processDueQueueNotifications, sendOnce } = require('../services/queueTimingService');
const { timezone } = require('./dailyQrController');

const active = ['BOOKED', 'CHECKED_IN', 'WAITING', 'CALLED', 'SERVING', 'HELD'];
const transitions = { BOOKED: ['CHECKED_IN', 'CANCELLED', 'EXPIRED'], CHECKED_IN: ['WAITING', 'CANCELLED'], WAITING: ['CALLED', 'SKIPPED', 'CANCELLED', 'HELD'], CALLED: ['SERVING', 'NO_SHOW', 'SKIPPED'], SERVING: ['COMPLETED'], HELD: ['WAITING', 'CANCELLED'] };
const patientId = async (db, userId) => (await db.query('SELECT id FROM patients WHERE user_id=$1', [userId])).rows[0]?.id;
const hospitalId = async (db, userId) => (await db.query('SELECT id FROM hospitals WHERE user_id=$1', [userId])).rows[0]?.id;
const dateKey = (value) => value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);

function emitQueue(io, queue, token = null) {
  if (!io) return;
  const payload = { queueId: queue.id, hospitalId: queue.hospital_id, currentTokenNumber: queue.current_token_number, token };
  io.to(`hospital_${queue.hospital_id}`).emit('queue:changed', payload);
  if (token?.patient_id) io.to(`patient_${token.patient_id}`).emit('queue:changed', payload);
}

async function summary(db, queueId) {
  const result = await db.query(`SELECT q.*, h.name hospital_name, d.name doctor_name,
    COUNT(t.id) FILTER (WHERE t.status IN ('WAITING','CHECKED_IN','BOOKED','HELD'))::int waiting_count
    FROM hospital_queues q JOIN hospitals h ON h.id=q.hospital_id LEFT JOIN doctors d ON d.id=q.doctor_id
    LEFT JOIN queue_tokens t ON t.queue_id=q.id GROUP BY q.id,h.name,d.name`, [queueId]);
  return result.rows[0];
}

async function dailyQrForPayload(db, payload) {
  const match = /^careguide:\/\/hospital-queue\/([A-Za-z0-9_-]{20,})$/.exec(String(payload || '').trim());
  if (!match) return { code: 'INVALID_QR' };
  const result = await db.query(`SELECT qr.*, h.id hospital_id, h.name hospital_name,
    h.address hospital_address, h.city hospital_city, h.phone hospital_phone,
    h.email hospital_email, h.is_verified hospital_verified,
    (CURRENT_TIMESTAMP AT TIME ZONE $2)::date AS today
    FROM hospital_daily_qr qr JOIN hospitals h ON h.id=qr.hospital_id
    WHERE qr.qr_token=$1`, [match[1], timezone]);
  const qr = result.rows[0];
  if (!qr) return { code: 'INVALID_QR' };
  if (qr.status === 'REVOKED') return { code: 'QR_REVOKED' };
  if (dateKey(qr.qr_date) !== dateKey(qr.today) || new Date(qr.valid_until) <= new Date()) return { code: 'QR_EXPIRED', qr };
  if (qr.status !== 'ACTIVE') return { code: 'QR_EXPIRED', qr };
  return { qr };
}

async function queuesForHospitalToday(db, hospitalId) {
  const result = await db.query(`SELECT q.*, h.name hospital_name, d.name doctor_name,
    COUNT(t.id) FILTER (WHERE t.status IN ('WAITING','CHECKED_IN','BOOKED','HELD'))::int waiting_count
    FROM hospital_queues q JOIN hospitals h ON h.id=q.hospital_id
    LEFT JOIN doctors d ON d.id=q.doctor_id LEFT JOIN queue_tokens t ON t.queue_id=q.id
    WHERE q.hospital_id=$1 AND q.queue_date=(CURRENT_TIMESTAMP AT TIME ZONE $2)::date AND q.status='OPEN'
    GROUP BY q.id,h.name,d.name ORDER BY q.department NULLS LAST,q.id`, [hospitalId, timezone]);
  return result.rows;
}

exports.getOrCreateQueue = async (req, res) => {
  const client = await pool.connect();
  try {
    const hospitalIdValue = Number(req.body.hospital_id); const doctorId = req.body.doctor_id == null ? null : Number(req.body.doctor_id);
    const department = String(req.body.department || '').trim() || null; const date = String(req.body.queue_date || new Date().toISOString().slice(0, 10));
    if (!Number.isInteger(hospitalIdValue) || (doctorId !== null && !Number.isInteger(doctorId))) return res.status(400).json({ success:false, message:'A valid hospital and optional doctor are required' });
    if (doctorId) { const doctor = await client.query('SELECT id FROM doctors WHERE id=$1 AND hospital_id=$2 AND COALESCE(is_active,true) AND availability_status=true', [doctorId,hospitalIdValue]); if (!doctor.rowCount) return res.status(400).json({success:false,message:'Doctor is not available at this hospital'}); }
    // PostgreSQL expression indexes cannot be named by ON CONFLICT columns.
    // Serialize creation for this scope so concurrent mobile requests still
    // create one (and only one) daily queue.
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`${hospitalIdValue}:${doctorId ?? 'all'}:${department ?? 'all'}:${date}:OUTPATIENT`]);
    const existing = await client.query(`SELECT * FROM hospital_queues WHERE hospital_id=$1 AND doctor_id IS NOT DISTINCT FROM $2 AND department IS NOT DISTINCT FROM $3 AND queue_date=$4 AND service_type='OUTPATIENT'`, [hospitalIdValue, doctorId, department, date]);
    const result = existing.rowCount ? existing : await client.query(`INSERT INTO hospital_queues(hospital_id,doctor_id,department,queue_date) VALUES($1,$2,$3,$4) RETURNING *`, [hospitalIdValue,doctorId,department,date]);
    await client.query('COMMIT');
    res.status(201).json({success:true,data:await summary(client,result.rows[0].id)});
  } catch (e) { await client.query('ROLLBACK').catch(() => {}); res.status(500).json({success:false,message:'Unable to create queue'}); } finally { client.release(); }
};

exports.bookToken = async (req, res) => {
  const client = await pool.connect();
  try {
    const queueId=Number(req.params.queueId); const patient=await patientId(client,req.user.id); const source=['ONLINE','QR'].includes(req.body.source)?req.body.source:'ONLINE';
    if (!patient || !Number.isInteger(queueId)) return res.status(400).json({success:false,message:'A valid patient and queue are required'});
    await client.query('BEGIN'); const queueResult=await client.query('SELECT * FROM hospital_queues WHERE id=$1 FOR UPDATE',[queueId]); const queue=queueResult.rows[0];
    if (!queue || queue.status!=='OPEN') { await client.query('ROLLBACK'); return res.status(409).json({success:false,message:'This queue is unavailable'}); }
    if (source === 'QR') {
      const validated = await dailyQrForPayload(client, req.body.qr_payload);
      if (!validated.qr) { await client.query('ROLLBACK'); return res.status(409).json({success:false,message:validated.code === 'QR_EXPIRED' ? 'This hospital QR code has expired. Please scan today\'s QR code displayed at the hospital.' : 'Invalid hospital QR code.',code:validated.code}); }
      if (validated.qr.hospital_id !== queue.hospital_id || dateKey(queue.queue_date) !== dateKey(validated.qr.qr_date)) { await client.query('ROLLBACK'); return res.status(409).json({success:false,message:'This QR cannot be used for the selected queue.',code:'QR_QUEUE_MISMATCH'}); }
    }
    const existing=await client.query(`SELECT * FROM queue_tokens WHERE queue_id=$1 AND patient_id=$2 AND status = ANY($3::text[]) FOR UPDATE`,[queueId,patient,active]);
    if (existing.rowCount) { await client.query('COMMIT'); return res.json({success:true,existing:true,data:existing.rows[0],queue:await summary(client,queueId)}); }
    const number=queue.next_token_number; const token=await client.query(`INSERT INTO queue_tokens(queue_id,patient_id,token_number,source,status,estimated_wait_minutes)
      VALUES($1,$2,$3,$4,'BOOKED',$5) RETURNING *`,[queueId,patient,number,source,number === 1 ? 0 : (number-1)*queue.default_consultation_minutes]);
    const updated=(await client.query('UPDATE hospital_queues SET next_token_number=next_token_number+1,updated_at=CURRENT_TIMESTAMP WHERE id=$1 RETURNING *',[queueId])).rows[0]; await client.query('COMMIT');
    const io=req.app.get('io'); const created=token.rows[0]; await createNotification({io,recipientUserId:req.user.id,hospitalId:queue.hospital_id,patientId:patient,type:'token_booked',relatedType:'queue_token',relatedId:created.id,title:`Token #${number} booked`,message:'Your digital queue token has been confirmed.'}); await notifyHospital({io,hospitalId:queue.hospital_id,type:'token_booked',relatedType:'queue_token',relatedId:created.id,title:'New digital token',message:`Token #${number} was booked online.`}); emitQueue(io,updated,created);
    const timing = await calculateQueueETA(queueId); await processDueQueueNotifications({ io });
    res.status(201).json({success:true,data:created,queue:await summary(pool,queueId),timing});
  } catch(e) { await client.query('ROLLBACK').catch(() => {}); if(e.code==='23505') return res.status(409).json({success:false,message:'You already have an active token for this queue'}); res.status(500).json({success:false,message:'Unable to book token'}); } finally { client.release(); }
};

exports.myTokens = async (req,res) => { const p=await patientId(pool,req.user.id); const r=await pool.query(`SELECT t.*,q.hospital_id,q.department,q.status queue_status,q.current_token_number,q.default_consultation_minutes,h.name hospital_name,d.name doctor_name,(SELECT COUNT(*) FROM queue_tokens ahead WHERE ahead.queue_id=t.queue_id AND ahead.token_number<t.token_number AND ahead.status IN ('BOOKED','CHECKED_IN','WAITING','CALLED','SERVING'))::int patients_ahead FROM queue_tokens t JOIN hospital_queues q ON q.id=t.queue_id JOIN hospitals h ON h.id=q.hospital_id LEFT JOIN doctors d ON d.id=q.doctor_id WHERE t.patient_id=$1 ORDER BY t.created_at DESC LIMIT 50`,[p]); res.json({success:true,data:r.rows}); };
exports.token = async (req,res) => { const p=await patientId(pool,req.user.id); const r=await pool.query(`SELECT t.*,q.hospital_id,q.department,q.current_token_number,h.name hospital_name,d.name doctor_name FROM queue_tokens t JOIN hospital_queues q ON q.id=t.queue_id JOIN hospitals h ON h.id=q.hospital_id LEFT JOIN doctors d ON d.id=q.doctor_id WHERE t.id=$1 AND t.patient_id=$2`,[req.params.tokenId,p]); if(!r.rowCount)return res.status(404).json({success:false,message:'Token not found'}); res.json({success:true,data:r.rows[0]}); };
exports.patientTransition = async (req,res) => { const wanted=req.body.status; const p=await patientId(pool,req.user.id); const client=await pool.connect(); try { await client.query('BEGIN'); const r=await client.query('SELECT * FROM queue_tokens WHERE id=$1 AND patient_id=$2 FOR UPDATE',[req.params.tokenId,p]); const t=r.rows[0]; if(!t||!transitions[t.status]?.includes(wanted)||!['CHECKED_IN','CANCELLED'].includes(wanted)){await client.query('ROLLBACK');return res.status(409).json({success:false,message:'This token cannot be changed that way'});} const u=(await client.query(`UPDATE queue_tokens SET status=$1,checked_in_at=CASE WHEN $1='CHECKED_IN' THEN CURRENT_TIMESTAMP ELSE checked_in_at END,cancelled_at=CASE WHEN $1='CANCELLED' THEN CURRENT_TIMESTAMP ELSE cancelled_at END,updated_at=CURRENT_TIMESTAMP WHERE id=$2 RETURNING *`,[wanted,t.id])).rows[0]; await client.query('COMMIT'); const q=await summary(pool,t.queue_id); emitQueue(req.app.get('io'),q,u);res.json({success:true,data:u});}catch(_){await client.query('ROLLBACK').catch(() => {});res.status(500).json({success:false,message:'Unable to update token'});}finally{client.release();} };

exports.callNext = async (req,res) => { const client=await pool.connect();try{const qid=Number(req.params.queueId);const hid=await hospitalId(client,req.user.id);await client.query('BEGIN');const q=(await client.query('SELECT * FROM hospital_queues WHERE id=$1 AND hospital_id=$2 FOR UPDATE',[qid,hid])).rows[0];if(!q){await client.query('ROLLBACK');return res.status(404).json({success:false,message:'Queue not found'});}await client.query(`UPDATE queue_tokens SET status='COMPLETED',completed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE queue_id=$1 AND status='SERVING'`,[qid]);const n=(await client.query(`SELECT * FROM queue_tokens WHERE queue_id=$1 AND status IN ('WAITING','CHECKED_IN') ORDER BY CASE status WHEN 'WAITING' THEN 0 ELSE 1 END,token_number FOR UPDATE SKIP LOCKED LIMIT 1`,[qid])).rows[0];if(!n){await client.query('COMMIT');return res.json({success:true,data:null,message:'No checked-in tokens are waiting'});}const t=(await client.query(`UPDATE queue_tokens SET status='CALLED',called_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=$1 RETURNING *`,[n.id])).rows[0];const u=(await client.query('UPDATE hospital_queues SET current_token_number=$1,updated_at=CURRENT_TIMESTAMP WHERE id=$2 RETURNING *',[t.token_number,qid])).rows[0];await client.query('COMMIT');const user=(await pool.query('SELECT user_id FROM patients WHERE id=$1',[t.patient_id])).rows[0];if(user)await createNotification({io:req.app.get('io'),recipientUserId:user.user_id,hospitalId:hid,patientId:t.patient_id,type:'token_called',priority:'high',relatedType:'queue_token',relatedId:t.id,title:`Token #${t.token_number} is called`,message:'Please proceed to your consultation queue.'});emitQueue(req.app.get('io'),u,t);res.json({success:true,data:t,queue:await summary(pool,qid)});}catch(_){await client.query('ROLLBACK').catch(() => {});res.status(500).json({success:false,message:'Unable to call next token'});}finally{client.release();} };

// Staff transitions are persisted once; elapsed consultation time is derived
// from serving_at, never from a Flutter counter.
exports.callNext = async (req, res) => {
  const client = await pool.connect();
  try {
    const queueId = Number(req.params.queueId); const hid = await hospitalId(client, req.user.id);
    await client.query('BEGIN');
    const queue = (await client.query('SELECT * FROM hospital_queues WHERE id=$1 AND hospital_id=$2 FOR UPDATE', [queueId, hid])).rows[0];
    if (!queue || queue.status !== 'OPEN') { await client.query('ROLLBACK'); return res.status(409).json({ success:false, message:'Queue is not open' }); }
    const serving = await client.query(`SELECT id FROM queue_tokens WHERE queue_id=$1 AND status IN ('CALLED','SERVING') FOR UPDATE`, [queueId]);
    if (serving.rowCount) { await client.query('ROLLBACK'); return res.status(409).json({ success:false, message:'Complete, hold, or skip the current token first' }); }
    const next = (await client.query(`SELECT * FROM queue_tokens WHERE queue_id=$1 AND status IN ('WAITING','CHECKED_IN') ORDER BY CASE status WHEN 'WAITING' THEN 0 ELSE 1 END, token_number FOR UPDATE SKIP LOCKED LIMIT 1`, [queueId])).rows[0];
    if (!next) { await client.query('COMMIT'); return res.json({ success:true, data:null, message:'No checked-in tokens are waiting' }); }
    const token = (await client.query(`UPDATE queue_tokens SET status='SERVING', called_at=CURRENT_TIMESTAMP, serving_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=$1 RETURNING *`, [next.id])).rows[0];
    const updatedQueue = (await client.query('UPDATE hospital_queues SET current_token_number=$1,updated_at=CURRENT_TIMESTAMP WHERE id=$2 RETURNING *', [token.token_number, queueId])).rows[0];
    await client.query('COMMIT');
    const user = (await pool.query('SELECT user_id FROM patients WHERE id=$1', [token.patient_id])).rows[0];
    if (user) await createNotification({ io:req.app.get('io'), recipientUserId:user.user_id, hospitalId:hid, patientId:token.patient_id, type:'token_called', priority:'high', relatedType:'queue_token', relatedId:token.id, title:`Token #${token.token_number} is now being served`, message:`Please proceed to ${queue.department || 'your consultation queue'}.` });
    const timing = await calculateQueueETA(queueId); await processDueQueueNotifications({ io:req.app.get('io') }); emitQueue(req.app.get('io'), updatedQueue, token);
    res.json({ success:true, data:token, queue:await summary(pool, queueId), timing });
  } catch (_) { await client.query('ROLLBACK').catch(() => {}); res.status(500).json({success:false,message:'Unable to call next token'}); } finally { client.release(); }
};

exports.staffTokenAction = async (req, res) => {
  const action = String(req.body.action || '').toUpperCase(); const allowed = { COMPLETE:'COMPLETED', HOLD:'HELD', RESUME:'WAITING', SKIP:'SKIPPED' };
  if (!allowed[action]) return res.status(400).json({success:false,message:'Unsupported queue action'});
  const client = await pool.connect();
  try {
    const hid = await hospitalId(client, req.user.id); await client.query('BEGIN');
    const token = (await client.query(`SELECT t.*,q.hospital_id FROM queue_tokens t JOIN hospital_queues q ON q.id=t.queue_id WHERE t.id=$1 AND q.hospital_id=$2 FOR UPDATE`, [req.params.tokenId, hid])).rows[0];
    if (!token) { await client.query('ROLLBACK'); return res.status(404).json({success:false,message:'Token not found'}); }
    if ((action === 'COMPLETE' || action === 'HOLD' || action === 'SKIP') && !['CALLED','SERVING'].includes(token.status)) { await client.query('ROLLBACK'); return res.status(409).json({success:false,message:'Action requires the current serving token'}); }
    if (action === 'RESUME' && token.status !== 'HELD') { await client.query('ROLLBACK'); return res.status(409).json({success:false,message:'Only held tokens can resume'}); }
    const updated = (await client.query(`UPDATE queue_tokens SET status=$1, completed_at=CASE WHEN $2='COMPLETE' THEN CURRENT_TIMESTAMP ELSE completed_at END, consultation_duration_seconds=CASE WHEN $2='COMPLETE' THEN GREATEST(0,EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP-serving_at))::int) ELSE consultation_duration_seconds END, held_at=CASE WHEN $2='HOLD' THEN CURRENT_TIMESTAMP ELSE held_at END, resumed_at=CASE WHEN $2='RESUME' THEN CURRENT_TIMESTAMP ELSE resumed_at END, updated_at=CURRENT_TIMESTAMP WHERE id=$3 RETURNING *`, [allowed[action], action, token.id])).rows[0];
    await client.query('COMMIT'); const timing = await calculateQueueETA(token.queue_id); await processDueQueueNotifications({ io:req.app.get('io') }); const queue = await summary(pool, token.queue_id); emitQueue(req.app.get('io'), queue, updated);
    res.json({success:true,data:updated,timing,queue});
  } catch (_) { await client.query('ROLLBACK').catch(() => {}); res.status(500).json({success:false,message:'Unable to update token'}); } finally { client.release(); }
};

exports.hospitalQueues = async (req, res) => {
  try {
    const hid = await hospitalId(pool, req.user.id);
    const result = await pool.query(`SELECT q.*, d.name doctor_name,
      (SELECT row_to_json(current_token) FROM (SELECT id,token_number,status,serving_at FROM queue_tokens WHERE queue_id=q.id AND status IN ('CALLED','SERVING') ORDER BY serving_at DESC NULLS LAST LIMIT 1) current_token),
      (SELECT row_to_json(next_token) FROM (SELECT id,token_number,status,estimated_turn_at FROM queue_tokens WHERE queue_id=q.id AND status IN ('BOOKED','CHECKED_IN','WAITING') ORDER BY token_number LIMIT 1) next_token)
      FROM hospital_queues q LEFT JOIN doctors d ON d.id=q.doctor_id WHERE q.hospital_id=$1 AND q.queue_date=CURRENT_DATE ORDER BY q.department NULLS LAST,q.id`, [hid]);
    res.json({success:true,data:result.rows});
  } catch (_) { res.status(500).json({success:false,message:'Unable to load queues'}); }
};

exports.validateQr = async (req, res) => {
  try {
    const validated = await dailyQrForPayload(pool, req.body.payload);
    if (!validated.qr) {
      const expired = validated.code === 'QR_EXPIRED';
      return res.status(expired ? 410 : 400).json({success:false,valid:false,message:expired ? 'This hospital QR code has expired. Please scan today\'s QR code displayed at the hospital.' : 'Invalid hospital QR code.',code:validated.code || 'INVALID_QR'});
    }
    res.json({success:true,valid:true,data:{hospital:{
      id:validated.qr.hospital_id,
      name:validated.qr.hospital_name,
      address:validated.qr.hospital_address,
      city:validated.qr.hospital_city,
      phone:validated.qr.hospital_phone,
      email:validated.qr.hospital_email,
      is_verified:validated.qr.hospital_verified,
    },qrDate:validated.qr.qr_date,expiresAt:validated.qr.valid_until,payload:String(req.body.payload)}});
  } catch (_) { res.status(500).json({success:false,message:'Unable to validate hospital QR code.'}); }
};
