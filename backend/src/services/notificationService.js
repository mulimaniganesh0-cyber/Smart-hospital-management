const { pool } = require('../config/database');

function emit(io, notification) {
  if (!io || !notification) return;
  io.to(`user_${notification.user_id}`).emit('notification:new', notification);
  if (notification.hospital_id) io.to(`hospital_${notification.hospital_id}`).emit('notification:new', notification);
  if (notification.recipient_role === 'admin') io.to('admins').emit('notification:new', notification);
}

async function createNotification({ db = pool, io, recipientUserId, hospitalId = null, patientId = null, ambulanceId = null, emergencyId = null, type, priority = 'normal', relatedType = null, relatedId = null, title, message }) {
  const result = await db.query(
    `INSERT INTO notifications (user_id,hospital_id,patient_id,ambulance_id,emergency_id,type,priority,related_type,related_id,title,message,is_read)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,FALSE) RETURNING *`,
    [recipientUserId, hospitalId, patientId, ambulanceId, emergencyId, type, priority, relatedType, relatedId, title, message],
  );
  const notification = result.rows[0];
  emit(io, notification);
  return notification;
}

async function notifyHospital({ db = pool, io, hospitalId, ...data }) {
  const hospital = await db.query('SELECT user_id FROM hospitals WHERE id=$1', [hospitalId]);
  if (!hospital.rows[0]?.user_id) return null;
  return createNotification({ db, io, recipientUserId: hospital.rows[0].user_id, hospitalId, ...data });
}

module.exports = { createNotification, notifyHospital, emitNotification: emit };
