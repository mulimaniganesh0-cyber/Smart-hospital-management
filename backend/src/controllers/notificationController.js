const { pool } = require('../config/database');

exports.getMyNotifications = async (req, res) => {
  try {
    const unreadOnly = req.query.unread === 'true';
    const result = await pool.query(`SELECT * FROM notifications WHERE user_id=$1${unreadOnly ? ' AND is_read=FALSE' : ''} ORDER BY is_read ASC, created_at DESC LIMIT 100`, [req.user.id]);
    const unread = await pool.query('SELECT COUNT(*)::int AS count FROM notifications WHERE user_id=$1 AND is_read=FALSE', [req.user.id]);
    res.json({ success: true, data: result.rows, unread_count: unread.rows[0].count });
  } catch (error) { console.error('Get notifications error:', error); res.status(500).json({ success:false, message:'Unable to load notifications' }); }
};

exports.markRead = async (req, res) => {
  try {
    const result = await pool.query(`UPDATE notifications SET is_read=TRUE,read_at=CURRENT_TIMESTAMP WHERE id=$1 AND user_id=$2 RETURNING *`, [req.params.notificationId, req.user.id]);
    if (!result.rows.length) return res.status(404).json({ success:false, message:'Notification not found' });
    const notification = result.rows[0];
    const io = req.app.get('io');
    if (io) {
      io.to(`user_${req.user.id}`).emit('notification:read', { id: notification.id, read_at: notification.read_at });
      if (notification.hospital_id) io.to(`hospital_${notification.hospital_id}`).emit('notification:read', { id: notification.id, read_at: notification.read_at });
    }
    res.json({ success:true, data:notification });
  } catch (_) { res.status(500).json({ success:false, message:'Unable to update notification' }); }
};
