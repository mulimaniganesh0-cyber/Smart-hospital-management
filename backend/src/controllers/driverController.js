const { pool } = require('../config/database');
const { NEXT_DRIVER_STATUS, canTransitionDriverStatus } = require('../services/driverWorkflowService');

async function driverContext(userId) {
  const result = await pool.query(`SELECT u.id,u.name,u.phone,u.email,u.hospital_id,h.name hospital_name,
      a.id ambulance_id,a.vehicle_number,a.type ambulance_type,a.status ambulance_status,a.is_available,
      a.driver_location_lat,a.driver_location_lng,a.driver_location_timestamp,
      (SELECT COUNT(*)::int FROM emergency_requests e WHERE e.assigned_driver_user_id=u.id
        AND e.status NOT IN ('completed','resolved','cancelled')) active_assignment_count,
      (SELECT COUNT(*)::int FROM emergency_requests e WHERE e.assigned_driver_user_id=u.id
        AND e.status='completed' AND COALESCE(e.completed_at,e.updated_at)::date=(CURRENT_TIMESTAMP AT TIME ZONE $2)::date) completed_trips_today
    FROM users u
    LEFT JOIN hospitals h ON h.id=u.hospital_id
    LEFT JOIN ambulances a ON a.driver_user_id=u.id AND a.is_active=true
    WHERE u.id=$1 AND (u.role='ambulance_driver' OR u.user_type='ambulance_driver')
    ORDER BY a.id DESC LIMIT 1`, [userId,process.env.HOSPITAL_TIMEZONE || 'Asia/Kolkata']);
  return result.rows[0];
}

const assignmentSelect = `SELECT e.id,e.status,e.emergency_type,e.severity,e.description,
    e.location_lat,e.location_lng,e.location_accuracy,e.location_timestamp,e.patient_location_updated_at,e.patient_location_sharing,e.created_at,e.updated_at,
    e.ambulance_id,e.assigned_at,h.id hospital_id,h.name hospital_name,
    h.entrance_latitude destination_latitude,h.entrance_longitude destination_longitude,
    h.entrance_verified destination_verified,a.vehicle_number,a.type ambulance_type,
    a.driver_location_lat,a.driver_location_lng,a.driver_location_timestamp,
    u.name patient_name
  FROM emergency_requests e
  JOIN hospitals h ON h.id=COALESCE(e.accepting_hospital_id,e.hospital_id)
  JOIN patients p ON p.id=e.patient_id
  JOIN users u ON u.id=p.user_id
  LEFT JOIN ambulances a ON a.id=e.ambulance_id`;

exports.profile = async (req, res) => {
  const driver = await driverContext(req.user.id);
  if (!driver) return res.status(403).json({ success:false,message:'Ambulance driver account required' });
  res.json({ success:true,data:driver });
};

exports.assignments = async (req, res) => {
  const [result, bookings] = await Promise.all([pool.query(`${assignmentSelect}
    WHERE e.assigned_driver_user_id=$1 AND e.status NOT IN ('completed','resolved','cancelled')
    ORDER BY e.updated_at DESC`, [req.user.id]), pool.query(`SELECT b.id,b.id assignment_id,'booking' assignment_type,b.status,b.pickup_location,b.dropoff_location,b.pickup_lat location_lat,b.pickup_lng location_lng,b.pickup_accuracy location_accuracy,COALESCE(b.patient_location_updated_at,b.pickup_timestamp,b.booking_time) location_timestamp,b.patient_location_lat,b.patient_location_lng,b.patient_location_accuracy,b.booking_time created_at,b.updated_at,b.ambulance_id,b.hospital_id,h.name hospital_name,h.entrance_latitude destination_latitude,h.entrance_longitude destination_longitude,h.entrance_verified destination_verified,a.vehicle_number,a.type ambulance_type,u.name patient_name
      FROM ambulance_bookings b JOIN ambulances a ON a.id=b.ambulance_id LEFT JOIN hospitals h ON h.id=b.hospital_id JOIN patients p ON p.id=b.patient_id JOIN users u ON u.id=p.user_id
      WHERE b.driver_user_id=$1 AND b.status NOT IN ('completed','cancelled') ORDER BY b.updated_at DESC`, [req.user.id])]);
  res.json({ success:true,data:[...result.rows.map((row)=>({...row,assignment_type:'emergency'})),...bookings.rows] });
};

exports.updateBookingStatus = async (req,res) => {
  const bookingId=Number(req.params.bookingId), status=String(req.body?.status||'').toLowerCase();
  if (!Number.isInteger(bookingId)||!Object.values(NEXT_DRIVER_STATUS).includes(status)) return res.status(400).json({success:false,message:'Valid next booking status required'});
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    const booking=await client.query(`SELECT b.* FROM ambulance_bookings b JOIN users d ON d.id=b.driver_user_id AND d.role='ambulance_driver' AND d.driver_status='active' AND d.account_status='ACTIVE' JOIN ambulances a ON a.id=b.ambulance_id AND a.driver_user_id=d.id AND a.is_active=TRUE WHERE b.id=$1 AND b.driver_user_id=$2 FOR UPDATE OF b,d,a`,[bookingId,req.user.id]);
    if(!booking.rowCount){await client.query('ROLLBACK');return res.status(404).json({success:false,message:'Booking is not assigned to this driver'});}
    if(!canTransitionDriverStatus(booking.rows[0].status,status)){await client.query('ROLLBACK');return res.status(409).json({success:false,message:`Cannot move booking from ${booking.rows[0].status} to ${status}`});}
    const updated=await client.query(`UPDATE ambulance_bookings SET status=$1::varchar,completed_at=CASE WHEN $1::text='completed' THEN CURRENT_TIMESTAMP ELSE completed_at END,
      pickup_location_shared=CASE WHEN $1::text IN ('completed','cancelled') THEN FALSE ELSE pickup_location_shared END,
      pickup_location=CASE WHEN $1::text IN ('completed','cancelled') THEN NULL ELSE pickup_location END,
      pickup_lat=CASE WHEN $1::text IN ('completed','cancelled') THEN NULL ELSE pickup_lat END,pickup_lng=CASE WHEN $1::text IN ('completed','cancelled') THEN NULL ELSE pickup_lng END,
      pickup_accuracy=CASE WHEN $1::text IN ('completed','cancelled') THEN NULL ELSE pickup_accuracy END,pickup_timestamp=CASE WHEN $1::text IN ('completed','cancelled') THEN NULL ELSE pickup_timestamp END,
      patient_location_lat=CASE WHEN $1::text IN ('completed','cancelled') THEN NULL ELSE patient_location_lat END,patient_location_lng=CASE WHEN $1::text IN ('completed','cancelled') THEN NULL ELSE patient_location_lng END,
      patient_location_accuracy=CASE WHEN $1::text IN ('completed','cancelled') THEN NULL ELSE patient_location_accuracy END,patient_location_updated_at=CASE WHEN $1::text IN ('completed','cancelled') THEN NULL ELSE patient_location_updated_at END,updated_at=CURRENT_TIMESTAMP WHERE id=$2 RETURNING *`,[status,bookingId]);
    if(status==='completed') await client.query(`UPDATE ambulances SET is_available=TRUE,status='AVAILABLE' WHERE id=$1`,[booking.rows[0].ambulance_id]);
    await client.query('COMMIT');
    const io=req.app.get('io'), payload={...updated.rows[0],assignment_type:'booking'};
    if(io){if(['completed','cancelled'].includes(status))io.in(`booking_assignment_${bookingId}`).socketsLeave(`booking_assignment_${bookingId}`);io.to(`booking_assignment_${bookingId}`).emit('ambulance:booking_status_updated',payload);io.to(`driver_${req.user.id}`).emit('ambulance:booking_status_updated',payload);if(payload.hospital_id)io.to(`hospital_${payload.hospital_id}`).emit('ambulance:booking_status_updated',payload);const patient=await pool.query('SELECT id FROM patients WHERE id=$1',[payload.patient_id]);if(patient.rows[0])io.to(`patient_${patient.rows[0].id}`).emit('ambulance:booking_status_updated',payload);}
    res.json({success:true,data:updated.rows[0]});
  } catch(error){await client.query('ROLLBACK').catch(()=>{});console.error('Driver booking status update failed:',error.message);res.status(500).json({success:false,message:'Unable to update booking status'});}finally{client.release();}
};

exports.history = async (req, res) => {
  const page = req.query.page === undefined ? 1 : Number(req.query.page);
  const limit = req.query.limit === undefined ? 20 : Number(req.query.limit);
  if (!Number.isSafeInteger(page) || page < 1 || page > 1_000_000 ||
      !Number.isSafeInteger(limit) || limit < 1 || limit > 50) {
    return res.status(400).json({success:false,message:'Page must be 1–1000000 and limit must be 1–50'});
  }
  const offset = (page - 1) * limit;
  const [rows, count] = await Promise.all([
    pool.query(`${assignmentSelect}
      WHERE e.assigned_driver_user_id=$1 AND e.status IN ('completed','resolved','cancelled')
      ORDER BY e.updated_at DESC LIMIT $2 OFFSET $3`, [req.user.id, limit, offset]),
    pool.query(`SELECT COUNT(*)::int total FROM emergency_requests
      WHERE assigned_driver_user_id=$1 AND status IN ('completed','resolved','cancelled')`, [req.user.id]),
  ]);
  res.json({ success:true,data:rows.rows,pagination:{page,limit,total:count.rows[0].total} });
};

exports.updateAssignmentStatus = async (req, res) => {
  const emergencyId = Number(req.params.emergencyId);
  const status = String(req.body?.status || '').toLowerCase();
  if (!Number.isInteger(emergencyId) || !Object.values(NEXT_DRIVER_STATUS).includes(status)) {
    return res.status(400).json({ success:false,message:'Valid next emergency status required' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const emergency = await client.query(`SELECT e.* FROM emergency_requests e JOIN users d ON d.id=e.assigned_driver_user_id AND d.role='ambulance_driver' AND d.driver_status='active' AND d.account_status='ACTIVE' JOIN ambulances a ON a.id=e.ambulance_id AND a.driver_user_id=d.id AND a.is_active=TRUE
      WHERE e.id=$1 AND e.assigned_driver_user_id=$2 FOR UPDATE OF e,d,a`, [emergencyId,req.user.id]);
    if (!emergency.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({success:false,message:'Emergency is not assigned to this driver'});
    }
    const current = emergency.rows[0].status;
    if (!canTransitionDriverStatus(current, status)) {
      await client.query('ROLLBACK');
      return res.status(409).json({success:false,message:`Cannot move emergency from ${current} to ${status}`});
    }
    const updated = await client.query(`UPDATE emergency_requests SET status=$1::varchar,updated_at=CURRENT_TIMESTAMP,
      completed_at=CASE WHEN $1::text='completed' THEN CURRENT_TIMESTAMP ELSE completed_at END,
      patient_location_sharing=CASE WHEN $1::text IN ('completed','resolved','cancelled') THEN FALSE ELSE patient_location_sharing END,
      location_lat=CASE WHEN $1::text IN ('completed','resolved','cancelled') THEN NULL ELSE location_lat END,
      location_lng=CASE WHEN $1::text IN ('completed','resolved','cancelled') THEN NULL ELSE location_lng END,
      location_accuracy=CASE WHEN $1::text IN ('completed','resolved','cancelled') THEN NULL ELSE location_accuracy END,
      location_timestamp=CASE WHEN $1::text IN ('completed','resolved','cancelled') THEN NULL ELSE location_timestamp END,
      patient_location_updated_at=CASE WHEN $1::text IN ('completed','resolved','cancelled') THEN NULL ELSE patient_location_updated_at END
      WHERE id=$2 RETURNING *`,[status,emergencyId]);
    if (status === 'completed' && emergency.rows[0].ambulance_id) {
      await client.query(`UPDATE ambulances SET is_available=true,status='AVAILABLE',updated_at=CURRENT_TIMESTAMP WHERE id=$1`,[emergency.rows[0].ambulance_id]);
    }
    await client.query('COMMIT');

    const io = req.app.get('io');
    const payload = { ...updated.rows[0], event:'emergency:driver_status_updated', occurred_at:new Date().toISOString() };
    if (io) {
      if(['completed','resolved','cancelled'].includes(status))io.in(`emergency_assignment_${emergencyId}`).socketsLeave(`emergency_assignment_${emergencyId}`);
      io.to(`driver_${req.user.id}`).emit('emergency:driver_status_updated', payload);
      const hospitalId = updated.rows[0].accepting_hospital_id || updated.rows[0].hospital_id;
      if (hospitalId) io.to(`hospital_${hospitalId}`).emit('emergency-status-update', payload);
      const patient = await pool.query('SELECT id FROM patients WHERE id=$1', [updated.rows[0].patient_id]);
      if (patient.rows[0]) io.to(`patient_${patient.rows[0].id}`).emit('emergency-status-update', payload);
    }
    res.json({success:true,data:updated.rows[0]});
  } catch(error) {
    await client.query('ROLLBACK').catch(()=>{});
    console.error('Driver emergency status update failed:', error.message);
    res.status(500).json({success:false,message:'Unable to update emergency status'});
  } finally { client.release(); }
};

exports.updateLocation = async (req,res) => {
  const latitude=Number(req.body?.latitude), longitude=Number(req.body?.longitude);
  const accuracy=req.body?.accuracy==null?null:Number(req.body.accuracy);
  const fixTime=req.body?.timestamp?new Date(req.body.timestamp):new Date();
  if (!Number.isFinite(latitude)||!Number.isFinite(longitude)||latitude < -90||latitude >90||longitude < -180||longitude >180||(accuracy!==null&&(!Number.isFinite(accuracy)||accuracy<0||accuracy>10000))||Number.isNaN(fixTime.getTime())||fixTime>new Date(Date.now()+30000)||Date.now()-fixTime.getTime()>120000) {
    return res.status(400).json({success:false,message:'Valid current driver coordinates, accuracy, and timestamp required'});
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const active = await client.query(`SELECT e.id emergency_id,'emergency' assignment_type,e.patient_id,
        COALESCE(e.accepting_hospital_id,e.hospital_id) hospital_id,a.id ambulance_id
      FROM emergency_requests e JOIN ambulances a ON a.id=e.ambulance_id JOIN users u ON u.id=e.assigned_driver_user_id AND u.role='ambulance_driver' AND u.driver_status='active' AND u.account_status='ACTIVE'
      WHERE e.assigned_driver_user_id=$1 AND a.driver_user_id=$1 AND a.is_active=true
        AND e.status NOT IN ('completed','resolved','cancelled') FOR UPDATE OF e,a`, [req.user.id]);
    const activeBooking = await client.query(`SELECT b.id emergency_id,'booking' assignment_type,b.patient_id,b.hospital_id,b.ambulance_id
      FROM ambulance_bookings b JOIN ambulances a ON a.id=b.ambulance_id JOIN users u ON u.id=b.driver_user_id AND u.role='ambulance_driver'
      WHERE b.driver_user_id=$1 AND a.driver_user_id=$1 AND a.is_active=TRUE AND u.driver_status='active' AND u.account_status='ACTIVE'
        AND b.status NOT IN ('completed','cancelled') FOR UPDATE OF b,a`, [req.user.id]);
    const activeRows=[...active.rows,...activeBooking.rows];
    if (!activeRows.length) {
      await client.query('ROLLBACK');
      return res.status(409).json({success:false,message:'Location sharing is available only during an active assigned emergency'});
    }
    if (activeRows.length > 1) {
      await client.query('ROLLBACK');
      return res.status(409).json({success:false,message:'Multiple active assignments found; contact hospital dispatch'});
    }
    const assignment = activeRows[0];
    const updated = await client.query(`UPDATE ambulances SET driver_location_lat=$1,driver_location_lng=$2,driver_location_accuracy=$3,
      driver_location_timestamp=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=$4 AND (driver_location_timestamp IS NULL OR driver_location_timestamp<CURRENT_TIMESTAMP-INTERVAL '3 seconds') RETURNING driver_location_timestamp`,
      [latitude,longitude,accuracy,assignment.ambulance_id]);
    if(!updated.rowCount){await client.query('ROLLBACK');return res.status(429).json({success:false,message:'Location updates are arriving too quickly'});}
    await client.query('COMMIT');
    const payload = { emergencyId:assignment.assignment_type==='emergency'?assignment.emergency_id:null,bookingId:assignment.assignment_type==='booking'?assignment.emergency_id:null,assignmentType:assignment.assignment_type,ambulanceId:assignment.ambulance_id,
      latitude,longitude,accuracy,timestamp:updated.rows[0].driver_location_timestamp };
    const io = req.app.get('io');
    if (io) {
      io.to(`${assignment.assignment_type}_assignment_${assignment.emergency_id}`).emit('ambulance:location_updated', payload);
      io.to(`driver_${req.user.id}`).emit('ambulance:location_updated', payload);
      if (assignment.hospital_id) io.to(`hospital_${assignment.hospital_id}`).emit('ambulance:location_updated', payload);
      const patient = await pool.query('SELECT id FROM patients WHERE id=$1', [assignment.patient_id]);
      if (patient.rows[0]) io.to(`patient_${patient.rows[0].id}`).emit('ambulance:location_updated', payload);
    }
    res.json({success:true,data:payload});
  } catch(error) {
    await client.query('ROLLBACK').catch(()=>{});
    console.error('Driver location update failed');
    res.status(500).json({success:false,message:'Unable to update driver location'});
  } finally { client.release(); }
};
