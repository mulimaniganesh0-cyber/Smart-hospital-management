const { pool } = require('../config/database');
const { notifyHospital, createNotification, emitNotification } = require('../services/notificationService');

const finalStatuses = ['completed', 'cancelled'];
const validBookingStatuses = ['pending', 'assigned', 'in_progress', ...finalStatuses];
const coordinate = (value, min, max) => Number.isFinite(Number(value)) && Number(value) >= min && Number(value) <= max;

function emitBooking(io, event, booking) {
  if (!io || !booking) return;
  const payload = { ...booking, event, occurred_at: new Date().toISOString() };
  io.to(`booking_assignment_${booking.id}`).emit(event, payload);
  if (booking.driver_user_id) io.to(`driver_${booking.driver_user_id}`).emit(event, payload);
  if (booking.hospital_id) io.to(`hospital_${booking.hospital_id}`).emit(event, payload);
  if (booking.patient_id) io.to(`patient_${booking.patient_id}`).emit(event, payload);
}

async function hospitalForUser(userId) {
  const result = await pool.query('SELECT id FROM hospitals WHERE user_id = $1', [userId]);
  return result.rows[0]?.id;
}

exports.registerAmbulance = async (req, res) => {
  try {
    const { vehicle_number, driver_name, driver_phone, type } = req.body;
    if (!String(vehicle_number || '').trim()) return res.status(400).json({ success: false, message: 'Vehicle number is required' });
    const hospitalId = await hospitalForUser(req.user.id);
    if (!hospitalId) return res.status(404).json({ success: false, message: 'Hospital not found' });
    const result = await pool.query(`INSERT INTO ambulances (hospital_id, vehicle_number, driver_name, driver_phone, type, is_available, status, is_active) VALUES ($1,$2,$3,$4,$5,TRUE,'AVAILABLE',TRUE) RETURNING *`, [hospitalId, vehicle_number.trim(), driver_name || null, driver_phone || null, type || null]);
    res.status(201).json({ success: true, message: 'Ambulance registered successfully', data: result.rows[0] });
  } catch (error) { res.status(error.code === '23505' ? 409 : 500).json({ success: false, message: error.code === '23505' ? 'Vehicle number already exists' : 'Server error' }); }
};

exports.getNearbyAmbulances = async (req, res) => {
  try {
    const { lat, lng, type } = req.query;
    const hasLocation = coordinate(lat, -90, 90) && coordinate(lng, -180, 180);
    const distanceSql = hasLocation ? `(6371 * acos(least(1, greatest(-1, cos(radians($1)) * cos(radians(h.latitude)) * cos(radians(h.longitude) - radians($2)) + sin(radians($1)) * sin(radians(h.latitude))))))` : 'NULL';
    const params = hasLocation ? [Number(lat), Number(lng)] : [];
    if (type && type !== 'All Types') params.push(type);
    const typeWhere = type && type !== 'All Types' ? ` AND a.type = $${params.length}` : '';
    const result = await pool.query(`SELECT a.id,a.vehicle_number,a.type,a.is_available,a.status,a.hospital_id,h.name AS hospital_name,h.address AS hospital_address,${distanceSql} AS distance FROM ambulances a LEFT JOIN hospitals h ON h.id=a.hospital_id JOIN users d ON d.id=a.driver_user_id AND d.role='ambulance_driver' AND d.driver_status='active' AND d.account_status='ACTIVE' AND ((d.driver_type='hospital_driver' AND d.hospital_id=a.hospital_id AND a.private_operator_user_id IS NULL) OR (d.driver_type='private_driver' AND a.hospital_id IS NULL AND a.private_operator_user_id=d.id)) WHERE a.is_active=TRUE AND a.is_available=TRUE AND a.status='AVAILABLE'${typeWhere} ORDER BY distance NULLS LAST,h.name,a.id LIMIT 20`, params);
    res.json({ success: true, count: result.rows.length, data: result.rows });
  } catch (error) { console.error('Get nearby ambulances error:', error); res.status(500).json({ success: false, message: 'Server error' }); }
};

exports.bookAmbulance = async (req, res) => {
  const client = await pool.connect();
  try {
    const { ambulance_id, hospital_id, pickup_location, pickup_address, pickup_lat, pickup_lng, pickup_accuracy, dropoff_location, patient_name, patient_phone, is_sos, emergency_request_id, share_live_location } = req.body;
    const location = String(pickup_location || pickup_address || '').trim();
    if (!location && !(coordinate(pickup_lat, -90, 90) && coordinate(pickup_lng, -180, 180))) return res.status(400).json({ success: false, message: 'A pickup location or valid coordinates are required' });
    if((pickup_lat==null)!==(pickup_lng==null)||(pickup_lat!=null&&(!coordinate(pickup_lat,-90,90)||!coordinate(pickup_lng,-180,180))))return res.status(400).json({success:false,message:'Provide both valid pickup coordinates or use an address only'});
    await client.query('BEGIN');
    const patient = await client.query(`SELECT p.id,u.name,u.phone FROM patients p JOIN users u ON u.id=p.user_id WHERE p.user_id=$1`, [req.user.id]);
    if (!patient.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ success: false, message: 'Patient not found' }); }
    const ambulance = ambulance_id
      ? await client.query(`SELECT a.*,h.name AS hospital_name FROM ambulances a LEFT JOIN hospitals h ON h.id=a.hospital_id WHERE a.id=$1 FOR UPDATE OF a`, [ambulance_id])
      : await client.query(`SELECT a.*,h.name AS hospital_name FROM ambulances a LEFT JOIN hospitals h ON h.id=a.hospital_id WHERE a.is_active=TRUE AND a.is_available=TRUE AND a.status='AVAILABLE'${hospital_id ? ' AND a.hospital_id=$1' : ''} ORDER BY a.id FOR UPDATE OF a SKIP LOCKED LIMIT 1`, hospital_id ? [hospital_id] : []);
    if (!ambulance.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ success: false, message: 'No ambulance is currently available' }); }
    const selected = ambulance.rows[0];
    if ((hospital_id && Number(hospital_id) !== selected.hospital_id) || !selected.is_active || !selected.is_available || selected.status !== 'AVAILABLE') { await client.query('ROLLBACK'); return res.status(409).json({ success: false, message: 'This ambulance is no longer available for booking' }); }
    const eligibleDriver=await client.query(`SELECT d.id FROM users d WHERE d.id=$1 AND d.role='ambulance_driver' AND d.driver_status='active' AND d.account_status='ACTIVE'
      AND ((d.driver_type='hospital_driver' AND d.hospital_id=$2::integer AND $2::integer IS NOT NULL AND $3::integer IS NULL)
        OR (d.driver_type='private_driver' AND $2::integer IS NULL AND $3::integer=d.id)) FOR UPDATE OF d`,[selected.driver_user_id,selected.hospital_id,selected.private_operator_user_id]);
    if(!eligibleDriver.rowCount){await client.query('ROLLBACK');return res.status(409).json({success:false,message:'This ambulance does not have an approved active driver'});}
    const conflictingTrip = await client.query(`SELECT 1 FROM ambulance_bookings WHERE driver_user_id=$1 AND status NOT IN ('completed','cancelled')
      UNION ALL SELECT 1 FROM emergency_requests WHERE assigned_driver_user_id=$1 AND status NOT IN ('completed','resolved','cancelled') LIMIT 1`, [eligibleDriver.rows[0].id]);
    if (conflictingTrip.rowCount) { await client.query('ROLLBACK'); return res.status(409).json({success:false,message:'This driver is already handling an active trip'}); }
    const booking = await client.query(`INSERT INTO ambulance_bookings (patient_id,hospital_id,ambulance_id,driver_user_id,pickup_location,pickup_lat,pickup_lng,pickup_accuracy,pickup_timestamp,dropoff_location,patient_name,patient_phone,status,is_sos,emergency_request_id,patient_location_lat,patient_location_lng,patient_location_updated_at,pickup_location_shared)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,CASE WHEN $6::numeric IS NOT NULL AND $7::numeric IS NOT NULL THEN CURRENT_TIMESTAMP END,$9,$10,$11,'assigned',$12,$13,$6,$7,CASE WHEN $6::numeric IS NOT NULL AND $7::numeric IS NOT NULL THEN CURRENT_TIMESTAMP END,$14) RETURNING *`, [patient.rows[0].id, selected.hospital_id, selected.id, selected.driver_user_id || null, location || null, coordinate(pickup_lat,-90,90) ? Number(pickup_lat) : null, coordinate(pickup_lng,-180,180) ? Number(pickup_lng) : null, coordinate(pickup_accuracy,0,10000) ? Number(pickup_accuracy) : null, dropoff_location || null, patient_name || null, patient_phone || null, Boolean(is_sos), emergency_request_id || null, share_live_location === true]);
    await client.query(`UPDATE ambulances SET is_available=FALSE,status='ASSIGNED' WHERE id=$1`, [selected.id]);
    const hospitalNotification = selected.hospital_id ? await notifyHospital({ db: client, hospitalId: selected.hospital_id, type: 'ambulance_booking', priority: 'high', relatedType: 'ambulance_booking', relatedId: booking.rows[0].id, patientId: patient.rows[0].id, ambulanceId: selected.id, title: 'NEW AMBULANCE BOOKING', message: `${booking.rows[0].patient_name || patient.rows[0].name} requested ${selected.vehicle_number}. Pickup: ${location || 'coordinates supplied'}.` }) : null;
    await client.query('COMMIT');
    if (hospitalNotification) emitNotification(req.app.get('io'), hospitalNotification);
    const payload = { ...booking.rows[0], patient_name: booking.rows[0].patient_name || patient.rows[0].name, patient_phone: booking.rows[0].patient_phone || patient.rows[0].phone, ambulance: selected };
    emitBooking(req.app.get('io'), 'ambulance:booking_created', payload);
    res.status(201).json({ success: true, message: 'Ambulance booked successfully', data: { ...booking.rows[0], ambulance: selected }, tracking_id: `AMB-${booking.rows[0].id}` });
  } catch (error) { await client.query('ROLLBACK').catch(() => {}); console.error('Book ambulance error:', error); res.status(500).json({ success: false, message: 'Unable to create ambulance booking' }); } finally { client.release(); }
};

exports.getMyAmbulanceBookings = async (req, res) => { try { const result=await pool.query(`SELECT b.*,a.vehicle_number,a.driver_name,a.driver_phone,a.type,h.name AS hospital_name FROM ambulance_bookings b JOIN patients p ON p.id=b.patient_id JOIN ambulances a ON a.id=b.ambulance_id LEFT JOIN hospitals h ON h.id=b.hospital_id WHERE p.user_id=$1 ORDER BY b.booking_time DESC`,[req.user.id]);res.json({success:true,data:result.rows}); }catch(_){res.status(500).json({success:false,message:'Server error'});} };
exports.getAmbulanceBookingDetails = async (req,res) => { try { const result=await pool.query(`SELECT b.*,a.vehicle_number,a.driver_name,a.driver_phone,a.type,h.name AS hospital_name FROM ambulance_bookings b JOIN patients p ON p.id=b.patient_id JOIN ambulances a ON a.id=b.ambulance_id LEFT JOIN hospitals h ON h.id=b.hospital_id WHERE b.id=$1 AND (p.user_id=$2 OR h.user_id=$2 OR b.driver_user_id=$2 OR $3='admin')`,[req.params.bookingId,req.user.id,req.user.user_type]);if(!result.rows.length)return res.status(404).json({success:false,message:'This booking is no longer available.'});res.json({success:true,data:result.rows[0]});}catch(error){console.error('Get ambulance booking detail error:',error);res.status(500).json({success:false,message:'Unable to load booking'});} };

exports.updateBookingPatientLocation = async (req,res) => {
  const bookingId=Number(req.body?.booking_id), latitude=Number(req.body?.latitude), longitude=Number(req.body?.longitude), accuracy=req.body?.accuracy==null?null:Number(req.body.accuracy);
  const clientTimestamp=req.body?.timestamp?new Date(req.body.timestamp):new Date();
  if(!Number.isSafeInteger(bookingId)||bookingId<1||!Number.isFinite(latitude)||latitude < -90||latitude > 90||!Number.isFinite(longitude)||longitude < -180||longitude > 180||(accuracy!==null&&(!Number.isFinite(accuracy)||accuracy<0||accuracy>10000))||Number.isNaN(clientTimestamp.getTime())||clientTimestamp>new Date(Date.now()+30000)||Date.now()-clientTimestamp.getTime()>5*60*1000) return res.status(400).json({success:false,message:'Coordinates, accuracy, or timestamp are invalid or stale'});
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    const updated=await client.query(`UPDATE ambulance_bookings b SET patient_location_lat=$1,patient_location_lng=$2,patient_location_accuracy=$3,patient_location_updated_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP
      FROM patients p,users d,ambulances a WHERE b.id=$4 AND b.patient_id=p.id AND p.user_id=$5 AND b.pickup_location_shared=TRUE AND b.status NOT IN ('completed','cancelled')
        AND d.id=b.driver_user_id AND d.role='ambulance_driver' AND d.driver_status='active' AND d.account_status='ACTIVE'
        AND a.id=b.ambulance_id AND a.driver_user_id=d.id AND a.is_active=TRUE
        AND (b.patient_location_updated_at IS NULL OR b.patient_location_updated_at<CURRENT_TIMESTAMP-INTERVAL '3 seconds') RETURNING b.*`,[latitude,longitude,accuracy,bookingId,req.user.id]);
    if(!updated.rowCount){await client.query('ROLLBACK');return res.status(409).json({success:false,message:'Booking is unavailable, sharing is off, or updates are arriving too quickly'});}
    await client.query('COMMIT');
    const row=updated.rows[0], payload={bookingId:row.id,latitude,longitude,accuracy,timestamp:row.patient_location_updated_at};
    const io=req.app.get('io');
    if(io){io.to(`booking_assignment_${row.id}`).emit('patient:location_updated',payload);if(row.driver_user_id)io.to(`driver_${row.driver_user_id}`).emit('patient:location_updated',payload);if(row.hospital_id)io.to(`hospital_${row.hospital_id}`).emit('patient:location_updated',payload);const patient=await pool.query('SELECT id FROM patients WHERE id=$1',[row.patient_id]);if(patient.rows[0])io.to(`patient_${patient.rows[0].id}`).emit('patient:location_updated',payload);}
    res.json({success:true,data:payload});
  }catch(error){await client.query('ROLLBACK').catch(()=>{});res.status(500).json({success:false,message:'Unable to update booking location'});}finally{client.release();}
};
exports.getHospitalAmbulances = async (req,res) => { try { const id=await hospitalForUser(req.user.id);if(!id)return res.status(404).json({success:false,message:'Hospital not found'});const result=await pool.query('SELECT * FROM ambulances WHERE hospital_id=$1 ORDER BY id',[id]);res.json({success:true,data:result.rows}); }catch(_){res.status(500).json({success:false,message:'Server error'});} };
exports.getHospitalAmbulanceBookings = async (req,res) => { try { const id=await hospitalForUser(req.user.id);if(!id)return res.status(404).json({success:false,message:'Hospital not found'});const result=await pool.query(`SELECT b.*,a.vehicle_number,a.driver_name,a.driver_phone,a.type FROM ambulance_bookings b JOIN ambulances a ON a.id=b.ambulance_id WHERE b.hospital_id=$1 ORDER BY b.booking_time DESC`,[id]);res.json({success:true,data:result.rows}); }catch(_){res.status(500).json({success:false,message:'Server error'});} };
exports.updateAmbulance = async (req,res) => { try { const id=await hospitalForUser(req.user.id);const {vehicle_number,driver_name,driver_phone,type,driver_user_id}=req.body; if(driver_user_id != null){const driver=await pool.query(`SELECT id,name,phone FROM users WHERE id=$1 AND hospital_id=$2 AND role='ambulance_driver' AND driver_type='hospital_driver' AND driver_status='active' AND account_status='ACTIVE'`,[Number(driver_user_id),id]);if(!driver.rowCount)return res.status(400).json({success:false,message:'Select an active hospital driver assigned to this hospital'});const result=await pool.query(`UPDATE ambulances SET vehicle_number=COALESCE($1,vehicle_number),driver_name=COALESCE($2,driver_name),driver_phone=COALESCE($3,driver_phone),type=COALESCE($4,type),driver_user_id=$5 WHERE id=$6 AND hospital_id=$7 RETURNING *`,[vehicle_number,driver.rows[0].name,driver.rows[0].phone,type,driver.rows[0].id,req.params.ambulanceId,id]);if(!result.rows.length)return res.status(404).json({success:false,message:'Ambulance not found'});return res.json({success:true,data:result.rows[0]});}const result=await pool.query(`UPDATE ambulances SET vehicle_number=COALESCE($1,vehicle_number),driver_name=COALESCE($2,driver_name),driver_phone=COALESCE($3,driver_phone),type=COALESCE($4,type) WHERE id=$5 AND hospital_id=$6 RETURNING *`,[vehicle_number,driver_name,driver_phone,type,req.params.ambulanceId,id]);if(!result.rows.length)return res.status(404).json({success:false,message:'Ambulance not found'});res.json({success:true,data:result.rows[0]}); }catch(e){res.status(e.code==='23505'?409:500).json({success:false,message:e.code==='23505'?'Vehicle number already exists':'Server error'});} };
exports.updateAmbulanceAvailability = async (req,res) => { try { const id=await hospitalForUser(req.user.id);const available=req.body.is_available===true;const result=await pool.query(`UPDATE ambulances SET is_available=$1,status=$2 WHERE id=$3 AND hospital_id=$4 RETURNING *`,[available,available?'AVAILABLE':'OUT_OF_SERVICE',req.params.ambulanceId,id]);if(!result.rows.length)return res.status(404).json({success:false,message:'Ambulance not found'});res.json({success:true,data:result.rows[0]}); }catch(_){res.status(500).json({success:false,message:'Server error'});} };
exports.deactivateAmbulance = async (req, res) => {
  const ambulanceId = Number(req.params.ambulanceId);
  if (!Number.isSafeInteger(ambulanceId) || ambulanceId < 1) {
    return res.status(400).json({ success: false, message: 'Invalid ambulance id' });
  }

  let client;
  try {
    const hospitalId = await hospitalForUser(req.user.id);
    if (!hospitalId) return res.status(404).json({ success: false, message: 'Hospital not found' });

    client = await pool.connect();
    await client.query('BEGIN');
    const ambulance = await client.query(
      'SELECT id FROM ambulances WHERE id=$1 AND hospital_id=$2 FOR UPDATE',
      [ambulanceId, hospitalId],
    );
    if (!ambulance.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Ambulance not found' });
    }

    const activeTrip = await client.query(`
      SELECT 1 FROM ambulance_bookings
      WHERE ambulance_id=$1 AND status NOT IN ('completed','cancelled')
      UNION ALL
      SELECT 1 FROM emergency_requests
      WHERE ambulance_id=$1 AND status NOT IN ('completed','resolved','cancelled')
      LIMIT 1`, [ambulanceId]);
    if (activeTrip.rowCount) {
      await client.query('ROLLBACK');
      return res.status(409).json({ success: false, message: 'This ambulance has an active trip or assignment and cannot be deactivated yet.' });
    }

    const result = await client.query(`
      UPDATE ambulances
      SET is_active=FALSE, is_available=FALSE, status='OUT_OF_SERVICE'
      WHERE id=$1 AND hospital_id=$2
        AND COALESCE((
          SELECT COUNT(*)
          FROM ambulance_bookings
          WHERE ambulance_id=$1 AND status NOT IN ('completed','cancelled')
        ), 0) = 0
        AND COALESCE((
          SELECT COUNT(*)
          FROM emergency_requests
          WHERE ambulance_id=$1 AND status NOT IN ('completed','resolved','cancelled')
        ), 0) = 0
      RETURNING *`, [ambulanceId, hospitalId]);
    if (!result.rowCount) {
      await client.query('ROLLBACK');
      return res.status(409).json({ success: false, message: 'This ambulance received an active trip or assignment and cannot be deactivated yet.' });
    }
    await client.query('COMMIT');
    return res.json({ success: true, message: 'Ambulance deactivated. Historical trip records were retained.', data: result.rows[0] });
  } catch (error) {
    await client?.query('ROLLBACK').catch(() => {});
    return res.status(500).json({ success: false, message: 'Unable to deactivate ambulance' });
  } finally {
    client?.release();
  }
};

exports.assignAmbulanceToBooking = async (_req,res) => res.status(400).json({success:false,message:'Ambulances are assigned when a booking is created'});
exports.updateBookingStatus = async (req,res) => { const client=await pool.connect();try {const hospitalId=await hospitalForUser(req.user.id);const status=String(req.body.status||'').toLowerCase();if(!validBookingStatuses.includes(status))return res.status(400).json({success:false,message:'Invalid booking status'});await client.query('BEGIN');const booking=await client.query(`UPDATE ambulance_bookings SET status=$1,completed_at=CASE WHEN $1=ANY($2::text[]) THEN CURRENT_TIMESTAMP ELSE completed_at END,pickup_location_shared=CASE WHEN $1=ANY($2::text[]) THEN FALSE ELSE pickup_location_shared END,pickup_location=CASE WHEN $1=ANY($2::text[]) THEN NULL ELSE pickup_location END,pickup_lat=CASE WHEN $1=ANY($2::text[]) THEN NULL ELSE pickup_lat END,pickup_lng=CASE WHEN $1=ANY($2::text[]) THEN NULL ELSE pickup_lng END,pickup_accuracy=CASE WHEN $1=ANY($2::text[]) THEN NULL ELSE pickup_accuracy END,pickup_timestamp=CASE WHEN $1=ANY($2::text[]) THEN NULL ELSE pickup_timestamp END,patient_location_lat=CASE WHEN $1=ANY($2::text[]) THEN NULL ELSE patient_location_lat END,patient_location_lng=CASE WHEN $1=ANY($2::text[]) THEN NULL ELSE patient_location_lng END,patient_location_accuracy=CASE WHEN $1=ANY($2::text[]) THEN NULL ELSE patient_location_accuracy END,patient_location_updated_at=CASE WHEN $1=ANY($2::text[]) THEN NULL ELSE patient_location_updated_at END WHERE id=$3 AND hospital_id=$4 AND status IS DISTINCT FROM $1 RETURNING *`,[status,finalStatuses,req.params.bookingId,hospitalId]);if(!booking.rows.length){await client.query('ROLLBACK');return res.status(404).json({success:false,message:'Booking not found or already at that status'});}if(finalStatuses.includes(status))await client.query(`UPDATE ambulances SET is_available=TRUE,status='AVAILABLE' WHERE id=$1`,[booking.rows[0].ambulance_id]);const patient=await client.query('SELECT user_id FROM patients WHERE id=$1',[booking.rows[0].patient_id]);const patientNotification=patient.rows[0]?await createNotification({db:client,recipientUserId:patient.rows[0].user_id,hospitalId,patientId:booking.rows[0].patient_id,ambulanceId:booking.rows[0].ambulance_id,type:'ambulance_status',priority:status==='cancelled'?'high':'normal',relatedType:'ambulance_booking',relatedId:booking.rows[0].id,title:`Ambulance booking ${status}`,message:`Your ambulance booking is now ${status}.`}):null;await client.query('COMMIT');if(patientNotification)emitNotification(req.app.get('io'),patientNotification);if(finalStatuses.includes(status))req.app.get('io')?.in(`booking_assignment_${booking.rows[0].id}`).socketsLeave(`booking_assignment_${booking.rows[0].id}`);emitBooking(req.app.get('io'), `ambulance:booking_${status}`, booking.rows[0]);res.json({success:true,message:'Booking status updated',data:booking.rows[0]});}catch(_){await client.query('ROLLBACK').catch(()=>{});res.status(500).json({success:false,message:'Server error'});}finally{client.release();} };
