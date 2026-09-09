// src/controllers/emergencyController.js
const { pool } = require('../config/database');
const crypto = require('crypto');
const { notifyEmergencyContact } = require('../services/emergencyNotificationService');
const { createNotification, notifyHospital } = require('../services/notificationService');
const { RESPONSE_SECONDS, createDispatches, respond, processExpiredDispatches } = require('../services/emergencyDispatchService');

function emitEmergency(io, event, emergency) {
  if (!io || !emergency) return;
  const payload = { ...emergency, event, occurred_at: new Date().toISOString() };
  if (emergency.hospital_id) io.to(`hospital_${emergency.hospital_id}`).emit(event, payload);
  if (emergency.patient_id) io.to(`patient_${emergency.patient_id}`).emit(event, payload);
  // Legacy listeners remain supported while clients move to namespaced events.
  if (event === 'emergency:sos_created' && emergency.hospital_id) io.to(`hospital_${emergency.hospital_id}`).emit('new-emergency', payload);
  if (event !== 'emergency:sos_created') {
    if (emergency.hospital_id) io.to(`hospital_${emergency.hospital_id}`).emit('emergency-status-update', payload);
    if (emergency.patient_id) io.to(`patient_${emergency.patient_id}`).emit('emergency-status-update', payload);
  }
}

// Haversine distance formula SQL helper
const HAVERSINE_DIST_SQL = `
  (6371 * acos(
    cos(radians($1)) * cos(radians(latitude)) *
    cos(radians(longitude) - radians($2)) +
    sin(radians($1)) * sin(radians(latitude))
  ))
`;

exports.createEmergencyRequest = async (req, res) => {
  const client = await pool.connect();
  try {
    const userId = req.user.id;
    const { emergency_type, severity, description, location_lat, location_lng, location_accuracy, location_timestamp } = req.body;
    const validCoordinate = (value, min, max) => Number.isFinite(Number(value)) && Number(value) >= min && Number(value) <= max;
    if ((location_lat !== undefined && !validCoordinate(location_lat, -90, 90)) || (location_lng !== undefined && !validCoordinate(location_lng, -180, 180))) {
      return res.status(400).json({ success: false, message: 'Location coordinates are invalid' });
    }
    await client.query('BEGIN');
    
    const patientResult = await client.query(
      `SELECT p.id, p.emergency_contact, p.emergency_contact_name, u.name as patient_name, u.phone as patient_phone
       FROM patients p
       JOIN users u ON p.user_id = u.id
       WHERE p.user_id = $1`,
      [userId]
    );
    
    if (patientResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Patient not found' });
    }
    
    const patient = patientResult.rows[0];
    const patientId = patient.id;
    const active = await client.query(`SELECT id FROM emergency_requests WHERE patient_id=$1 AND status NOT IN ('completed','resolved','cancelled') FOR UPDATE`, [patientId]);
    if (active.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(409).json({ success: false, message: 'An SOS is already active for this patient', emergencyId: active.rows[0].id });
    }

    const assignedAmbulance = null;
    
    const result = await client.query(
      `INSERT INTO emergency_requests 
       (patient_id, hospital_id, ambulance_id, emergency_type, severity, description, location_lat, location_lng, location_accuracy, location_timestamp, status)
       VALUES ($1, NULL, $2, $3, $4, $5, $6, $7, $8, 'pending')
       RETURNING *`,
      [
        patientId, 
        assignedAmbulance ? assignedAmbulance.id : null,
        emergency_type || 'General Emergency', 
        severity || 'critical', 
        description || 'Emergency SOS triggered', 
        location_lat, 
        location_lng,
        Number.isFinite(Number(location_accuracy)) ? Number(location_accuracy) : null,
        location_timestamp ? new Date(location_timestamp) : new Date()
      ]
    );

    const emergencyData = result.rows[0];
    const contactToken = crypto.randomBytes(32).toString('base64url');
    const contactTokenHash = crypto.createHash('sha256').update(contactToken).digest('hex');
    await client.query(`UPDATE emergency_requests SET secure_location_token_hash=$1,secure_location_expires_at=CURRENT_TIMESTAMP + INTERVAL '24 hours' WHERE id=$2`, [contactTokenHash, emergencyData.id]);
    const dispatch = await createDispatches(client, emergencyData);
    await client.query('COMMIT');

    let hospitalNotification = null;
    let nearestHospital = null;
    if (dispatch.attempt) {
      const hospital = await pool.query('SELECT id,name,phone,address,latitude,longitude FROM hospitals WHERE id=$1', [dispatch.attempt.hospital_id]);
      nearestHospital = hospital.rows[0] || null;
      hospitalNotification = await notifyHospital({ io: req.app.get('io'), hospitalId: dispatch.attempt.hospital_id, type: 'sos', priority: 'critical', relatedType: 'emergency', relatedId: emergencyData.id, patientId, emergencyId: emergencyData.id, title: 'SOS EMERGENCY', message: `${patient.patient_name} triggered an SOS. Respond within ${RESPONSE_SECONDS} seconds.` });
    }

    emitEmergency(req.app.get('io'), 'emergency:sos_created', {
      ...emergencyData, patient_name: patient.patient_name, patient_phone: patient.patient_phone,
      hospital: nearestHospital, ambulance: null,
    });

    // Record and attempt notification after the emergency has safely persisted.
    // A provider being unavailable is not reported as a sent SMS.
    let notification = { contactFound: Boolean(patient.emergency_contact), status: 'not_attempted' };
    if (patient.emergency_contact) {
      try {
        const publicBase = process.env.PUBLIC_APP_URL?.replace(/\/$/, '');
        const secureLocationUrl = publicBase ? `${publicBase}/emergency/location/${contactToken}` : null;
        const delivered = await notifyEmergencyContact({ phone: patient.emergency_contact, patientName: patient.patient_name, createdAt: new Date(), secureLocationUrl });
        notification = { contactFound: true, status: delivered.status };
        await pool.query(`INSERT INTO notifications (user_id, title, message, type, recipient_phone, delivery_status, failure_reason) VALUES ($1,$2,$3,'emergency',$4,$5,$6)`, [userId, 'EMERGENCY SOS ALERT', delivered.message, patient.emergency_contact, delivered.status, delivered.failureReason || null]);
      } catch (notificationError) {
        console.error('SOS notification recording failed:', notificationError);
        notification = { contactFound: true, status: 'failed' };
      }
    }

    res.status(201).json({
      success: true,
      message: 'Emergency request created successfully',
      data: {
        ...emergencyData,
        patient_name: patient.patient_name,
        patient_phone: patient.patient_phone,
        hospital: nearestHospital,
        ambulance: assignedAmbulance, dispatch: dispatch.attempt || null,
        notification,
      },
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Create emergency error:', error);
    res.status(500).json({ success: false, message: 'Unable to create emergency request' });
  } finally { client.release(); }
};

// The token is an expiring, cryptographically-random bearer credential sent
// only to the registered contact. It exposes only the current SOS state.
exports.getSecureEmergencyLocation = async (req, res) => {
  try {
    const token = String(req.params.token || '');
    if (!/^[A-Za-z0-9_-]{32,}$/.test(token)) return res.status(404).json({ success: false, message: 'Emergency location is unavailable' });
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    const result = await pool.query(`SELECT e.id,e.status,e.location_lat,e.location_lng,e.location_accuracy,e.location_timestamp,
      h.name AS hospital_name,h.phone AS hospital_phone,h.latitude AS hospital_latitude,h.longitude AS hospital_longitude,
      a.vehicle_number,a.current_location_lat AS ambulance_latitude,a.current_location_lng AS ambulance_longitude
      FROM emergency_requests e LEFT JOIN hospitals h ON h.id=e.accepting_hospital_id LEFT JOIN ambulances a ON a.id=e.ambulance_id
      WHERE e.secure_location_token_hash=$1 AND e.secure_location_expires_at>CURRENT_TIMESTAMP AND e.status NOT IN ('completed','resolved','cancelled')`, [hash]);
    if (!result.rows[0]) return res.status(404).json({ success: false, message: 'Emergency location is unavailable' });
    res.json({ success: true, data: result.rows[0] });
  } catch (error) { res.status(500).json({ success: false, message: 'Unable to load emergency location' }); }
};

async function notifyDispatchTransition(req, transition) {
  const io = req.app.get('io');
  const emergency = transition.emergency || (await pool.query('SELECT * FROM emergency_requests WHERE id=$1', [transition.emergencyId])).rows[0];
  if (!emergency) return;
  const patient = await pool.query('SELECT user_id FROM patients WHERE id=$1', [emergency.patient_id]);
  if (patient.rows[0]) await createNotification({ io, recipientUserId: patient.rows[0].user_id, patientId: emergency.patient_id, emergencyId: emergency.id, type: 'emergency_status', priority: 'critical', relatedType: 'emergency', relatedId: emergency.id, title: transition.accepted ? 'Emergency accepted' : transition.exhausted ? 'Emergency assistance still needed' : 'Emergency dispatch update', message: transition.accepted ? 'A hospital has accepted your emergency request.' : transition.exhausted ? 'No nearby hospital has accepted yet. Please call emergency services or your emergency contact.' : 'We are contacting the next eligible hospital.' });
  if (transition.attempt) {
    const hospitalNotification = await notifyHospital({ io, hospitalId: transition.attempt.hospital_id, type: 'sos', priority: 'critical', relatedType: 'emergency', relatedId: emergency.id, patientId: emergency.patient_id, emergencyId: emergency.id, title: 'SOS EMERGENCY', message: `SOS emergency requires a response within ${RESPONSE_SECONDS} seconds.` });
  }
  emitEmergency(io, transition.accepted ? 'emergency:accepted' : 'emergency:dispatch_updated', emergency);
}

exports.respondToSosDispatch = async (req, res) => {
  const client = await pool.connect();
  try {
    const emergencyId = Number(req.params.emergencyId);
    const action = String(req.body.action || '').toLowerCase();
    if (!Number.isInteger(emergencyId) || !['accept', 'reject'].includes(action)) return res.status(400).json({ success: false, message: 'Use accept or reject' });
    const hospital = await client.query('SELECT id FROM hospitals WHERE user_id=$1', [req.user.id]);
    if (!hospital.rows[0]) return res.status(404).json({ success: false, message: 'Hospital not found' });
    await client.query('BEGIN');
    const transition = await respond(client, emergencyId, hospital.rows[0].id, action, req.body.rejection_reason);
    await client.query('COMMIT');
    await notifyDispatchTransition(req, transition);
    res.json({ success: true, data: transition.emergency, dispatch: transition.attempt || null });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    res.status(error.status || 500).json({ success: false, message: error.message || 'Unable to respond to SOS' });
  } finally { client.release(); }
};

exports.processSosDispatchTimeouts = async (req, res) => {
  try {
    const transitions = await processExpiredDispatches();
    for (const transition of transitions) await notifyDispatchTransition(req, transition);
    res.json({ success: true, processed: transitions.length });
  } catch (error) { res.status(500).json({ success: false, message: 'Unable to process SOS timeouts' }); }
};

exports.updateLiveLocation = async (req, res) => {
  try {
    const { emergencyId, location_lat, location_lng } = req.body;

    if (!emergencyId || location_lat === undefined || location_lng === undefined) {
      return res.status(400).json({ success: false, message: 'Emergency ID and coordinates required' });
    }

    const result = await pool.query(
      `UPDATE emergency_requests
       SET location_lat = $1, location_lng = $2
       WHERE id = $3 AND patient_id = (SELECT id FROM patients WHERE user_id = $4)
       RETURNING *`,
      [location_lat, location_lng, emergencyId, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Emergency request not found' });
    }

    // Also fetch ambulance status if assigned
    let ambulanceData = null;
    if (result.rows[0].ambulance_id) {
      const ambRes = await pool.query(`SELECT * FROM ambulances WHERE id = $1`, [result.rows[0].ambulance_id]);
      if (ambRes.rows.length > 0) ambulanceData = ambRes.rows[0];
    }

    res.json({
      success: true,
      message: 'Live location updated',
      data: {
        ...result.rows[0],
        ambulance: ambulanceData,
      },
    });
  } catch (error) {
    console.error('Update live location error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

exports.getPatientSosHistory = async (req, res) => {
  try {
    const userId = req.user.id;

    const patientResult = await pool.query(
      'SELECT id FROM patients WHERE user_id = $1',
      [userId]
    );

    if (patientResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Patient profile not found' });
    }

    const patientId = patientResult.rows[0].id;

    const result = await pool.query(
      `SELECT er.*, h.name as hospital_name, h.phone as hospital_phone, a.vehicle_number, a.driver_name, a.driver_phone,
              COALESCE((SELECT json_agg(json_build_object('hospital_id',d.hospital_id,'sequence_number',d.sequence_number,'status',d.status,'notified_at',d.notified_at,'response_deadline',d.response_deadline,'responded_at',d.responded_at) ORDER BY d.sequence_number) FROM emergency_hospital_dispatches d WHERE d.emergency_id=er.id), '[]'::json) AS dispatch_history
       FROM emergency_requests er
       LEFT JOIN hospitals h ON er.hospital_id = h.id
       LEFT JOIN ambulances a ON er.ambulance_id = a.id
       WHERE er.patient_id = $1
       ORDER BY er.created_at DESC`,
      [patientId]
    );

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error('Get patient SOS history error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

exports.endEmergency = async (req, res) => {
  try {
    const { emergencyId } = req.params;
    const { status = 'completed' } = req.body;

    const result = await pool.query(
      `UPDATE emergency_requests
       SET status = $1, completed_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND patient_id = (SELECT id FROM patients WHERE user_id = $3)
       RETURNING *`,
      [status, emergencyId, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Emergency request not found' });
    }

    const emergency = result.rows[0];

    // Free up assigned ambulance
    if (emergency.ambulance_id) {
      await pool.query(`UPDATE ambulances SET is_available = TRUE, status = 'AVAILABLE' WHERE id = $1`, [emergency.ambulance_id]);
    }

    res.json({
      success: true,
      message: `Emergency marked as ${status}`,
      data: emergency,
    });
  } catch (error) {
    console.error('End emergency error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

exports.getNearbyEmergencies = async (req, res) => {
  try {
    // Hospital users are restricted to their own records.  Admins are the
    // only callers permitted to inspect the system-wide emergency queue.
    const isAdmin = req.user.user_type === 'admin';
    let hospitalId = null;
    if (!isAdmin) {
      const hospitalResult = await pool.query(
        'SELECT id FROM hospitals WHERE user_id = $1',
        [req.user.id]
      );
      if (!hospitalResult.rows.length) {
        return res.status(404).json({ success: false, message: 'Hospital not found' });
      }
      hospitalId = hospitalResult.rows[0].id;
    }
    if (!Number.isFinite(Number(location_lat)) || Number(location_lat) < -90 || Number(location_lat) > 90 || !Number.isFinite(Number(location_lng)) || Number(location_lng) < -180 || Number(location_lng) > 180) {
      return res.status(400).json({ success: false, message: 'Valid latitude and longitude are required' });
    }

    const result = await pool.query(
      `SELECT er.*, u.name as patient_name, u.phone as patient_phone
       FROM emergency_requests er
       JOIN patients p ON er.patient_id = p.id
       JOIN users u ON p.user_id = u.id
       WHERE er.status IN ('pending', 'accepted', 'assigned', 'dispatched', 'in_progress')
         AND ($1::integer IS NULL OR er.hospital_id = $1::integer)
       ORDER BY er.created_at DESC
       LIMIT 20`,
      [hospitalId]
    );
    
    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error('Get nearby emergencies error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

exports.getHospitalEmergencies = async (req, res) => {
  try {
    const userId = req.user.id;
    
    const hospitalResult = await pool.query(
      'SELECT id FROM hospitals WHERE user_id = $1',
      [userId]
    );
    
    if (hospitalResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Hospital not found' });
    }
    
    const hospitalId = hospitalResult.rows[0].id;
    
    const result = await pool.query(
      `SELECT er.*, d.status AS dispatch_status, d.response_deadline, d.sequence_number, u.name as patient_name, u.phone as patient_phone,
              a.vehicle_number as ambulance_vehicle, a.driver_name as ambulance_driver
       FROM emergency_requests er
       JOIN emergency_hospital_dispatches d ON d.emergency_id=er.id AND d.hospital_id=$1
       JOIN patients p ON er.patient_id = p.id
       JOIN users u ON p.user_id = u.id
       LEFT JOIN ambulances a ON er.ambulance_id = a.id
       WHERE d.status IN ('NOTIFIED','ACCEPTED')
       ORDER BY d.created_at DESC
       LIMIT 50`,
      [hospitalId]
    );
    
    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error('Get hospital emergencies error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

exports.getEmergencyDetails = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT e.*, u.name AS patient_name, u.phone AS patient_phone, h.name AS hospital_name,
              a.vehicle_number, a.driver_name, a.driver_phone
       FROM emergency_requests e
       JOIN patients p ON p.id=e.patient_id
       JOIN users u ON u.id=p.user_id
       LEFT JOIN hospitals h ON h.id=e.hospital_id
       LEFT JOIN ambulances a ON a.id=e.ambulance_id
       WHERE e.id=$1 AND (p.user_id=$2 OR h.user_id=$2 OR $3='admin')`,
      [req.params.emergencyId, req.user.id, req.user.user_type],
    );
    if (!result.rows.length) return res.status(404).json({ success: false, message: 'This emergency is no longer available.' });
    return res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Get emergency detail error:', error);
    return res.status(500).json({ success: false, message: 'Unable to load emergency' });
  }
};

exports.updateEmergencyStatus = async (req, res) => {
  const client = await pool.connect();
  try {
    const { emergencyId } = req.params;
    const status = String(req.body.status || '').trim().toLowerCase();
    const allowedStatuses = ['pending', 'accepted', 'assigned', 'dispatched', 'in_progress', 'completed', 'resolved', 'cancelled'];
    if (!allowedStatuses.includes(status)) return res.status(400).json({ success: false, message: 'Invalid emergency status' });
    const hospital = await client.query('SELECT id FROM hospitals WHERE user_id = $1', [req.user.id]);
    if (!hospital.rows.length) return res.status(404).json({ success: false, message: 'Hospital not found' });
    await client.query('BEGIN');
    
    const result = await client.query(
      `UPDATE emergency_requests 
       SET status = $1::varchar,
           assigned_at = CASE WHEN $1::varchar IN ('accepted', 'assigned', 'dispatched') THEN CURRENT_TIMESTAMP ELSE assigned_at END,
           completed_at = CASE WHEN $1::varchar IN ('completed', 'resolved', 'cancelled') THEN CURRENT_TIMESTAMP ELSE completed_at END,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2::integer AND hospital_id = $3::integer
         AND status IS DISTINCT FROM $1::varchar
       RETURNING *`,
      [status, emergencyId, hospital.rows[0].id]
    );

    if (!result.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Emergency request not found for this hospital' });
    }

    if (result.rows[0].ambulance_id && ['completed', 'resolved', 'cancelled'].includes(status)) {
      await client.query(`UPDATE ambulances SET is_available = TRUE, status = 'AVAILABLE', updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [result.rows[0].ambulance_id]);
    }
    await client.query('COMMIT');
    const hospitalName = await pool.query('SELECT name FROM hospitals WHERE id=$1', [hospital.rows[0].id]);
    const patientUser = await pool.query('SELECT user_id FROM patients WHERE id=$1', [result.rows[0].patient_id]);
    if (patientUser.rows[0]) {
      const notification = await createNotification({ io: req.app.get('io'), recipientUserId: patientUser.rows[0].user_id, hospitalId: hospital.rows[0].id, patientId: result.rows[0].patient_id, emergencyId: result.rows[0].id, type: 'emergency_status', priority: ['cancelled'].includes(status) ? 'high' : 'normal', relatedType: 'emergency', relatedId: result.rows[0].id, title: `Emergency ${status.replace('_', ' ')}`, message: `${hospitalName.rows[0]?.name || 'Hospital'} updated your emergency status to ${status.replace('_', ' ')}.` });
      void notification;
    }
    emitEmergency(req.app.get('io'), `emergency:${status}`, result.rows[0]);
    
    res.json({
      success: true,
      message: 'Emergency status updated',
      data: result.rows[0],
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Update emergency status error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  } finally { client.release(); }
};

exports.assignEmergencyAmbulance = async (req, res) => {
  const client = await pool.connect();
  try {
    const emergencyId = Number(req.params.emergencyId);
    const ambulanceId = Number(req.body.ambulance_id);
    if (!Number.isInteger(emergencyId) || !Number.isInteger(ambulanceId)) return res.status(400).json({ success: false, message: 'A valid emergency and ambulance are required' });
    const hospital = await client.query('SELECT id FROM hospitals WHERE user_id = $1', [req.user.id]);
    if (!hospital.rows.length) return res.status(404).json({ success: false, message: 'Hospital not found' });
    const hospitalId = hospital.rows[0].id;
    await client.query('BEGIN');
    const emergency = await client.query(`SELECT * FROM emergency_requests WHERE id=$1 AND hospital_id=$2 FOR UPDATE`, [emergencyId, hospitalId]);
    if (!emergency.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ success: false, message: 'Emergency request not found for this hospital' }); }
    if (['completed', 'resolved', 'cancelled'].includes(emergency.rows[0].status)) { await client.query('ROLLBACK'); return res.status(409).json({ success: false, message: 'Cannot assign an ambulance to a closed emergency' }); }
    const ambulance = await client.query(`SELECT * FROM ambulances WHERE id=$1 AND hospital_id=$2 FOR UPDATE`, [ambulanceId, hospitalId]);
    if (!ambulance.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ success: false, message: 'Ambulance not found for this hospital' }); }
    if (!ambulance.rows[0].is_active || !ambulance.rows[0].is_available || ambulance.rows[0].status !== 'AVAILABLE') { await client.query('ROLLBACK'); return res.status(409).json({ success: false, message: 'This ambulance is not available' }); }
    await client.query(`UPDATE ambulances SET is_available=FALSE,status='ASSIGNED' WHERE id=$1`, [ambulanceId]);
    const updated = await client.query(`UPDATE emergency_requests SET ambulance_id=$1,status='assigned',assigned_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=$2 RETURNING *`, [ambulanceId, emergencyId]);
    await client.query('COMMIT');
    const patientUser = await pool.query('SELECT user_id FROM patients WHERE id=$1', [updated.rows[0].patient_id]);
    if (patientUser.rows[0]) await createNotification({ io: req.app.get('io'), recipientUserId: patientUser.rows[0].user_id, hospitalId, patientId: updated.rows[0].patient_id, ambulanceId, emergencyId, type: 'ambulance_assigned', priority: 'high', relatedType: 'emergency', relatedId: emergencyId, title: 'Ambulance assigned', message: `An ambulance has been assigned to your emergency request.` });
    emitEmergency(req.app.get('io'), 'emergency:ambulance_assigned', { ...updated.rows[0], ambulance: ambulance.rows[0] });
    res.json({ success: true, message: 'Ambulance assigned', data: { ...updated.rows[0], ambulance: ambulance.rows[0] } });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Assign emergency ambulance error:', error);
    res.status(500).json({ success: false, message: 'Unable to assign ambulance' });
  } finally { client.release(); }
};
