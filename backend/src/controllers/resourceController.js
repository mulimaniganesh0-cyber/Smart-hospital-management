// src/controllers/resourceController.js
const { pool } = require('../config/database');
const { notifyHospital, createNotification } = require('../services/notificationService');
const { normalizeBloodGroup } = require('../services/bloodInventoryService');

async function emitHospitalResourceState(req, hospitalId) {
  const io = req.app.get('io');
  if (!io || !hospitalId) return;
  try {
    const result = await pool.query('SELECT * FROM hospital_resources WHERE hospital_id=$1', [hospitalId]);
    if (!result.rowCount) return;
    const payload = { hospitalId, resources: result.rows[0], updatedAt: result.rows[0].updated_at };
    io.to(`hospital_${hospitalId}`).emit('resources-changed', payload);
  } catch (error) {
    console.error('Hospital resource realtime notification failed:', error.message);
  }
}

async function notifyPatientRequest({ req, request, type, title, message }) {
  if (!request.user_id) return null;
  const hospital = await pool.query('SELECT name FROM hospitals WHERE id=$1', [request.hospital_id]);
  const hospitalName = hospital.rows[0]?.name || 'the hospital';
  return createNotification({ io: req.app.get('io'), recipientUserId: request.user_id, hospitalId: request.hospital_id, patientId: request.patient_id, type, priority: type.includes('rejected') ? 'high' : 'normal', relatedType: type.includes('blood') ? 'blood_request' : 'resource_request', relatedId: request.id, title, message: `${message} ${hospitalName}.` });
}

async function getRequestDetail(req, res, table, requestId) {
  const hospitalColumn = table === 'blood_requests' ? 'b' : 'r';
  const result = await pool.query(
    `SELECT ${hospitalColumn}.*, h.name AS hospital_name
     FROM ${table} ${hospitalColumn}
     LEFT JOIN hospitals h ON h.id=${hospitalColumn}.hospital_id
     LEFT JOIN patients p ON p.id=${hospitalColumn}.patient_id
     WHERE ${hospitalColumn}.id=$1 AND (
       ${hospitalColumn}.user_id=$2 OR h.user_id=$2 OR $3='admin'
     )`,
    [requestId, req.user.id, req.user.user_type],
  );
  if (!result.rows.length) return res.status(404).json({ success: false, message: 'This request is no longer available.' });
  return res.json({ success: true, data: result.rows[0] });
}

exports.getResourceRequestDetails = async (req, res) => {
  try { return await getRequestDetail(req, res, 'resource_requests', req.params.requestId); }
  catch (error) { console.error('Get resource request detail error:', error); return res.status(500).json({ success: false, message: 'Unable to load request' }); }
};

exports.getBloodRequestDetails = async (req, res) => {
  try { return await getRequestDetail(req, res, 'blood_requests', req.params.requestId); }
  catch (error) { console.error('Get blood request detail error:', error); return res.status(500).json({ success: false, message: 'Unable to load request' }); }
};

// ==================== RESOURCE REQUESTS ====================

exports.requestResource = async (req, res) => {
  try {
    const userId = req.user.id;
    const { 
      hospital_id, 
      resource_type, 
      quantity, 
      description,
      patient_name,
      patient_phone,
      hospital_address 
    } = req.body;

    const hospitalId = Number(hospital_id);
    const requestedQuantity = Number(quantity ?? 1);
    if (!Number.isSafeInteger(hospitalId) || hospitalId < 1 || !Number.isSafeInteger(requestedQuantity) || requestedQuantity < 1 || requestedQuantity > 1000) {
      return res.status(400).json({ success: false, message: 'Select a valid hospital and a quantity from 1 to 1000.' });
    }

    console.log('Resource request received:', { userId, hospital_id, resource_type, quantity });

    // Map resource type to database field
    let resourceField = '';
    let normalizedResourceType = resource_type;
    
    if (resource_type === 'bed' || resource_type === 'general_bed') {
      resourceField = 'general_beds_available';
      normalizedResourceType = 'general_bed';
    } else if (resource_type === 'icu' || resource_type === 'icu_bed') {
      resourceField = 'icu_beds_available';
      normalizedResourceType = 'icu_bed';
    } else if (resource_type === 'ventilator') {
      resourceField = 'ventilators_available';
      normalizedResourceType = 'ventilator';
    } else if (resource_type === 'oxygen_bed' || resource_type === 'oxygen') {
      resourceField = 'oxygen_supported_beds_available';
      normalizedResourceType = 'oxygen_bed';
    }
    if (!resourceField) return res.status(400).json({ success: false, message: 'Select a supported resource type.' });

    // Get patient id
    const patientResult = await pool.query(
      'SELECT id FROM patients WHERE user_id = $1',
      [userId]
    );

    let patientId = null;
    if (patientResult.rows.length > 0) {
      patientId = patientResult.rows[0].id;
    }

    // Check if resource is available (for non-blood resources)
    if (resourceField) {
      const resourceCheck = await pool.query(
        `SELECT ${resourceField} as available FROM hospital_resources WHERE hospital_id = $1`,
        [hospitalId]
      );
      
      if (resourceCheck.rows.length > 0) {
        const available = resourceCheck.rows[0].available || 0;
        if (available < requestedQuantity) {
          return res.status(400).json({
            success: false,
            message: `Not enough ${normalizedResourceType}s available. Available: ${available}, Requested: ${requestedQuantity}`
          });
        }
      }
    }

    const result = await pool.query(
      `INSERT INTO resource_requests (
        patient_id, user_id, hospital_id, resource_type, quantity, 
        description, patient_name, patient_phone, hospital_address, status, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending', CURRENT_TIMESTAMP)
      RETURNING *`,
      [
        patientId, userId, hospitalId, normalizedResourceType, requestedQuantity,
        description || '', patient_name || 'Patient', patient_phone || '',
        hospital_address || ''
      ]
    );

    await notifyHospital({ io: req.app.get('io'), hospitalId: result.rows[0].hospital_id, type: 'resource_request', priority: 'high', relatedType: 'resource_request', relatedId: result.rows[0].id, patientId: result.rows[0].patient_id, title: 'NEW RESOURCE REQUEST', message: `${normalizedResourceType.replace('_', ' ')} request requires review.` });

    res.status(201).json({
      success: true,
      message: 'Resource request submitted successfully',
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Request resource error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  }
};

exports.getMyResourceRequests = async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(
      `SELECT r.*, h.name as hospital_name
       FROM resource_requests r
       LEFT JOIN hospitals h ON r.hospital_id = h.id
       WHERE r.user_id = $1
       ORDER BY r.created_at DESC`,
      [userId]
    );

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error('Get my resource requests error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  }
};

exports.getHospitalResourceRequests = async (req, res) => {
  try {
    const userId = req.user.id;

    console.log('Getting hospital requests for user:', userId);

    const hospitalResult = await pool.query(
      'SELECT id FROM hospitals WHERE user_id = $1',
      [userId]
    );

    if (hospitalResult.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Hospital not found' 
      });
    }

    const hospitalId = hospitalResult.rows[0].id;
    console.log('Hospital ID:', hospitalId);

    const result = await pool.query(
      `SELECT r.*, u.name as patient_name, u.phone as patient_phone
       FROM resource_requests r
       LEFT JOIN users u ON r.user_id = u.id
       WHERE r.hospital_id = $1
       ORDER BY r.created_at DESC
       LIMIT 100`,
      [hospitalId]
    );

    console.log(`Found ${result.rows.length} resource requests for hospital ${hospitalId}`);

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error('Get hospital resource requests error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  }
};

// ========== FULFILL RESOURCE REQUEST - UPDATED ==========
exports.fulfillResourceRequest = async (req, res) => {
  const { requestId } = req.params;
  const userId = req.user.id;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    console.log(`Fulfilling resource request: ${requestId} for user: ${userId}`);

    // Get hospital id
    const hospitalResult = await client.query(
      'SELECT id FROM hospitals WHERE user_id = $1',
      [userId]
    );

    if (hospitalResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ 
        success: false, 
        message: 'Hospital not found' 
      });
    }

    const hospitalId = hospitalResult.rows[0].id;

    // Check if request exists and is pending
    const requestResult = await client.query(
      'SELECT * FROM resource_requests WHERE id = $1 AND hospital_id = $2 AND status = $3 FOR UPDATE',
      [requestId, hospitalId, 'pending']
    );

    if (requestResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ 
        success: false, 
        message: 'Request not found or already processed' 
      });
    }

    const request = requestResult.rows[0];

    // Map resource type to database column
    let resourceField = '';
    if (request.resource_type === 'general_bed') {
      resourceField = 'general_beds_available';
    } else if (request.resource_type === 'icu_bed') {
      resourceField = 'icu_beds_available';
    } else if (request.resource_type === 'ventilator') {
      resourceField = 'ventilators_available';
    } else if (request.resource_type === 'oxygen_bed') {
      resourceField = 'oxygen_supported_beds_available';
    }

    const requestedQuantity = Number(request.quantity ?? 1);
    if (!resourceField || !Number.isSafeInteger(requestedQuantity) || requestedQuantity < 1 || requestedQuantity > 1000) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'This request has an invalid resource type or quantity.' });
    }

    // DECREASE the available resource count
    if (resourceField) {
      const checkResult = await client.query(
        `SELECT ${resourceField} as available FROM hospital_resources WHERE hospital_id = $1 FOR UPDATE`,
        [hospitalId]
      );

      if (checkResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ 
          success: false, 
          message: 'Hospital resources not found' 
        });
      }

      const currentAvailable = checkResult.rows[0].available || 0;
      if (currentAvailable < requestedQuantity) {
        await client.query('ROLLBACK');
        return res.status(400).json({ 
          success: false, 
          message: `Insufficient resources. Available: ${currentAvailable}, Requested: ${requestedQuantity}` 
        });
      }

      // Decrease the resource count
      const decremented = await client.query(
        `UPDATE hospital_resources 
         SET ${resourceField} = ${resourceField} - $1,
             updated_at = CURRENT_TIMESTAMP
         WHERE hospital_id = $2 AND ${resourceField} >= $1`,
        [requestedQuantity, hospitalId]
      );
      if (!decremented.rowCount) {
        await client.query('ROLLBACK');
        return res.status(409).json({ success: false, message: 'Resource availability changed. Review the request and try again.' });
      }
      
      console.log(`Decreased ${resourceField} by ${requestedQuantity}`);
    }

    // Update request status to fulfilled
    const result = await client.query(
      `UPDATE resource_requests 
       SET status = 'fulfilled', fulfilled_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [requestId]
    );

    await client.query('COMMIT');

    await emitHospitalResourceState(req, result.rows[0].hospital_id);

    await notifyPatientRequest({ req, request: result.rows[0], type: 'resource_accepted', title: 'Resource request accepted', message: `Your ${request.resource_type.replace('_', ' ')} request has been accepted.` });

    console.log(`Resource request ${requestId} fulfilled successfully`);

    res.json({
      success: true,
      message: 'Resource request fulfilled successfully. Resource allocated to patient.',
      data: result.rows[0],
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Fulfill resource request error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  } finally {
    client.release();
  }
};

exports.rejectResourceRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    const userId = req.user.id;

    console.log(`Rejecting resource request: ${requestId}`);

    const hospitalResult = await pool.query(
      'SELECT id FROM hospitals WHERE user_id = $1',
      [userId]
    );

    if (hospitalResult.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Hospital not found' 
      });
    }

    const hospitalId = hospitalResult.rows[0].id;

    // Check if request exists and is pending
    const requestResult = await pool.query(
      'SELECT * FROM resource_requests WHERE id = $1 AND hospital_id = $2 AND status = $3',
      [requestId, hospitalId, 'pending']
    );

    if (requestResult.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Request not found or already processed' 
      });
    }

    // Update the request status
    const result = await pool.query(
      `UPDATE resource_requests 
       SET status = 'rejected', rejected_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [requestId]
    );

    console.log(`Resource request ${requestId} rejected`);
    await notifyPatientRequest({ req, request: result.rows[0], type: 'resource_rejected', title: 'Resource request rejected', message: `Your ${result.rows[0].resource_type.replace('_', ' ')} request was rejected.` });

    res.json({
      success: true,
      message: 'Resource request rejected',
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Reject resource request error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  }
};

// ========== FREE RESOURCE (DISCHARGE PATIENT) ==========
exports.freeResource = async (req, res) => {
  const client = await pool.connect();
  try {
    const userId = req.user.id;
    const { resource_type, quantity = 1 } = req.body || {};
    const count = Number(quantity);
    if (!Number.isSafeInteger(count) || count < 1 || count > 1000) {
      return res.status(400).json({ success: false, message: 'Quantity must be a whole number from 1 to 1000.' });
    }

    const hospitalResult = await client.query(
      'SELECT id FROM hospitals WHERE user_id = $1',
      [userId]
    );
    if (!hospitalResult.rowCount) return res.status(404).json({ success: false, message: 'Hospital not found' });

    const hospitalId = hospitalResult.rows[0].id;
    const fields = {
      bed: ['general_beds_available', 'general_beds_total'],
      general_bed: ['general_beds_available', 'general_beds_total'],
      icu: ['icu_beds_available', 'icu_beds_total'],
      icu_bed: ['icu_beds_available', 'icu_beds_total'],
      ventilator: ['ventilators_available', 'ventilators_total'],
      oxygen: ['oxygen_supported_beds_available', 'oxygen_supported_beds_total'],
      oxygen_bed: ['oxygen_supported_beds_available', 'oxygen_supported_beds_total'],
    };
    const [availableField, totalField] = fields[resource_type] || [];
    if (!availableField) return res.status(400).json({ success: false, message: 'Invalid resource type.' });

    await client.query('BEGIN');
    const current = await client.query(`SELECT ${availableField} AS available, ${totalField} AS total
      FROM hospital_resources WHERE hospital_id=$1 FOR UPDATE`, [hospitalId]);
    if (!current.rowCount) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'Hospital resources not found.' });
    }
    if (Number(current.rows[0].available || 0) + count > Number(current.rows[0].total || 0)) {
      await client.query('ROLLBACK');
      return res.status(409).json({ success: false, message: 'Freed quantity would exceed the configured resource total.' });
    }
    const result = await client.query(`UPDATE hospital_resources SET ${availableField}=${availableField}+$1,
      updated_at=CURRENT_TIMESTAMP WHERE hospital_id=$2 AND ${availableField}+$1 <= ${totalField} RETURNING *`, [count, hospitalId]);
    if (!result.rowCount) {
      await client.query('ROLLBACK');
      return res.status(409).json({ success: false, message: 'Resource availability changed. Refresh and try again.' });
    }
    await client.query('COMMIT');
    await emitHospitalResourceState(req, hospitalId);
    return res.json({
      success: true,
      message: `${count} ${resource_type}(s) freed successfully. Resource is now available.`,
      data: result.rows[0],
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Free resource error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  } finally { client.release(); }
};

// ==================== BLOOD REQUESTS ====================

exports.requestBlood = async (req, res) => {
  try {
    const userId = req.user.id;
    const { 
      hospital_id, 
      blood_group, 
      units_required,
      patient_name,
      hospital_address 
    } = req.body;

    const hospitalId = Number(hospital_id);
    const bloodGroup = normalizeBloodGroup(blood_group);
    const units = Number(units_required ?? 1);
    if (!Number.isSafeInteger(hospitalId) || hospitalId < 1 || !bloodGroup ||
        !Number.isSafeInteger(units) || units < 1 || units > 1000) {
      return res.status(400).json({ success: false, message: 'Select a valid hospital and blood group, and request between 1 and 1000 units.' });
    }
    const hospital = await pool.query('SELECT id FROM hospitals WHERE id=$1', [hospitalId]);
    if (!hospital.rowCount) return res.status(404).json({ success: false, message: 'Hospital not found.' });

    const patientResult = await pool.query(
      'SELECT id FROM patients WHERE user_id = $1',
      [userId]
    );

    let patientId = null;
    if (patientResult.rows.length > 0) {
      patientId = patientResult.rows[0].id;
    }

    const result = await pool.query(
      `INSERT INTO blood_requests (
        patient_id, user_id, hospital_id, blood_group, units_required,
        patient_name, hospital_address, status, request_date
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', CURRENT_TIMESTAMP)
      RETURNING *`,
      [
        patientId, userId, hospitalId, bloodGroup, units,
        patient_name || 'Patient', hospital_address || ''
      ]
    );

    // The notification record is persisted before Socket.IO delivery. Failure
    // to notify must not invalidate the patient's already-created request.
    try {
      await notifyHospital({ io: req.app.get('io'), hospitalId: result.rows[0].hospital_id, type: 'blood_request', priority: 'high', relatedType: 'blood_request', relatedId: result.rows[0].id, patientId: result.rows[0].patient_id, title: 'NEW BLOOD REQUEST', message: `${blood_group} blood request requires review.` });
    } catch (notificationError) {
      console.error('Blood request notification failed:', notificationError.message);
    }

    res.status(201).json({
      success: true,
      message: 'Blood request submitted successfully',
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Request blood error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  }
};

exports.getMyBloodRequests = async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(
      `SELECT b.*, h.name as hospital_name
       FROM blood_requests b
       LEFT JOIN hospitals h ON b.hospital_id = h.id
       WHERE b.user_id = $1
       ORDER BY b.request_date DESC`,
      [userId]
    );

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error('Get my blood requests error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  }
};

exports.getHospitalBloodRequests = async (req, res) => {
  try {
    const userId = req.user.id;

    console.log('Getting blood requests for user:', userId);

    const hospitalResult = await pool.query(
      'SELECT id FROM hospitals WHERE user_id = $1',
      [userId]
    );

    if (hospitalResult.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Hospital not found' 
      });
    }

    const hospitalId = hospitalResult.rows[0].id;
    console.log('Hospital ID:', hospitalId);

    const result = await pool.query(
      `SELECT b.*, u.name as patient_name, u.phone as patient_phone
       FROM blood_requests b
       LEFT JOIN users u ON b.user_id = u.id
       WHERE b.hospital_id = $1
       ORDER BY b.request_date DESC
       LIMIT 100`,
      [hospitalId]
    );

    console.log(`Found ${result.rows.length} blood requests for hospital ${hospitalId}`);

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error('Get hospital blood requests error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  }
};

exports.fulfillBloodRequest = async (req, res) => {
  const { requestId } = req.params;
  const userId = req.user.id;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    console.log(`Fulfilling blood request: ${requestId}`);

    const hospitalResult = await client.query(
      'SELECT id FROM hospitals WHERE user_id = $1',
      [userId]
    );

    if (hospitalResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ 
        success: false, 
        message: 'Hospital not found' 
      });
    }

    const hospitalId = hospitalResult.rows[0].id;

    const requestIdNumber = Number(requestId);
    if (!Number.isSafeInteger(requestIdNumber) || requestIdNumber < 1) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'Invalid blood request ID.' });
    }
    const requestResult = await client.query(
      'SELECT * FROM blood_requests WHERE id = $1 AND hospital_id = $2 AND status = $3 FOR UPDATE',
      [requestIdNumber, hospitalId, 'pending']
    );

    if (requestResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ 
        success: false, 
        message: 'Blood request not found or already processed' 
      });
    }

    const request = requestResult.rows[0];

    // Check if enough blood is available
    // Conditional decrement protects against concurrent requests consuming the
    // same stock after an earlier availability check.
    const stockResult = await client.query(
      `UPDATE blood_bank 
       SET units_available = units_available - $1,
           last_updated = CURRENT_TIMESTAMP
       WHERE hospital_id = $2 AND blood_group = $3 AND units_available >= $1
         AND (expiry_date IS NULL OR expiry_date >= CURRENT_DATE)
       RETURNING id, units_available`,
      [request.units_required, hospitalId, request.blood_group]
    );
    if (!stockResult.rowCount) {
      await client.query('ROLLBACK');
      return res.status(409).json({ success: false, message: `Insufficient ${request.blood_group} blood inventory to fulfill this request.` });
    }
    await client.query(
      `INSERT INTO blood_inventory_transactions
         (hospital_id, blood_bank_id, blood_group, transaction_type, units, reference_type, reference_id, created_by)
       VALUES ($1, $2, $3, 'ISSUED', $4, 'BLOOD_REQUEST', $5, $6)`,
      [hospitalId, stockResult.rows[0].id, request.blood_group, request.units_required, request.id, userId]
    );

    // Update request status
    const result = await client.query(
      `UPDATE blood_requests 
       SET status = 'fulfilled', fulfilled_date = CURRENT_TIMESTAMP
       WHERE id = $1 AND hospital_id = $2 AND status = 'pending'
       RETURNING *`,
      [requestIdNumber, hospitalId]
    );
    if (!result.rowCount) {
      await client.query('ROLLBACK');
      return res.status(409).json({ success: false, message: 'This blood request has already been processed.' });
    }

    await client.query('COMMIT');

    const io = req.app?.get?.('io');
    if (io) {
      try {
        const inventory = await pool.query(`SELECT blood_group,units_available FROM blood_bank
          WHERE hospital_id=$1 AND (expiry_date IS NULL OR expiry_date >= CURRENT_DATE)`, [hospitalId]);
        io.to(`hospital_${hospitalId}`).emit('blood-stock-changed', { hospitalId, inventory: inventory.rows });
        io.emit('global-blood-stock-changed', { hospitalId, inventory: inventory.rows });
      } catch (notificationError) {
        console.error('Blood fulfillment inventory event failed:', notificationError.message);
      }
    }

    try {
      await notifyPatientRequest({ req, request: result.rows[0], type: 'blood_accepted', title: 'Blood request accepted', message: `Your ${request.blood_group} blood request has been accepted.` });
    } catch (notificationError) {
      console.error('Blood fulfillment notification failed:', notificationError.message);
    }

    console.log(`Blood request ${requestId} fulfilled successfully`);

    res.json({
      success: true,
      message: 'Blood request fulfilled successfully',
      data: result.rows[0],
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Fulfill blood request error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  } finally {
    client.release();
  }
};

exports.rejectBloodRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    const userId = req.user.id;

    console.log(`Rejecting blood request: ${requestId}`);

    const hospitalResult = await pool.query(
      'SELECT id FROM hospitals WHERE user_id = $1',
      [userId]
    );

    if (hospitalResult.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Hospital not found' 
      });
    }

    const hospitalId = hospitalResult.rows[0].id;

    const result = await pool.query(
      `UPDATE blood_requests 
       SET status = 'rejected', rejected_date = CURRENT_TIMESTAMP
       WHERE id = $1 AND hospital_id = $2 AND status = 'pending'
       RETURNING *`,
      [requestId, hospitalId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Blood request not found or already processed' 
      });
    }

    console.log(`Blood request ${requestId} rejected`);
    try {
      await notifyPatientRequest({ req, request: result.rows[0], type: 'blood_rejected', title: 'Blood request rejected', message: `Your ${result.rows[0].blood_group} blood request was rejected.` });
    } catch (notificationError) {
      console.error('Blood rejection notification failed:', notificationError.message);
    }

    res.json({
      success: true,
      message: 'Blood request rejected',
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Reject blood request error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  }
};

// ==================== ADDITIONAL HELPER METHODS ====================

exports.getAvailableResources = async (req, res) => {
  try {
    const { hospital_id } = req.params;

    const result = await pool.query(
      `SELECT 
        COALESCE(general_beds_total, 0) as general_beds_total,
        COALESCE(general_beds_available, 0) as general_beds_available,
        COALESCE(icu_beds_total, 0) as icu_beds_total,
        COALESCE(icu_beds_available, 0) as icu_beds_available,
        COALESCE(ventilators_total, 0) as ventilators_total,
        COALESCE(ventilators_available, 0) as ventilators_available,
        COALESCE(oxygen_supported_beds_total, 0) as oxygen_beds_total,
        COALESCE(oxygen_supported_beds_available, 0) as oxygen_beds_available
       FROM hospital_resources 
       WHERE hospital_id = $1`,
      [hospital_id]
    );

    if (result.rows.length === 0) {
      return res.json({
        success: true,
        data: {
          general_beds_total: 0,
          general_beds_available: 0,
          icu_beds_total: 0,
          icu_beds_available: 0,
          ventilators_total: 0,
          ventilators_available: 0,
          oxygen_beds_total: 0,
          oxygen_beds_available: 0,
        }
      });
    }

    res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Get available resources error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  }
};
