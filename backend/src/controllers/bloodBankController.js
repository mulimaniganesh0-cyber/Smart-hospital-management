// src/controllers/bloodBankController.js
const { pool } = require('../config/database');
const {
  BLOOD_GROUPS,
  normalizeBloodGroup,
  getHospitalBloodStock,
  getVisibleHospitalBloodStock,
} = require('../services/bloodInventoryService');

async function emitBloodInventoryChanged(req, hospitalId) {
  try {
    const io = req.app?.get('io');
    if (!io) return;
    const inventory = await getHospitalBloodStock(hospitalId);
    const event = { hospitalId, bloodStock: inventory.bloodStock };
    io.to(`hospital_${hospitalId}`).emit('blood-stock-changed', event);
    io.emit('global-blood-stock-changed', event);
  } catch (error) {
    // A realtime failure must never make a committed PostgreSQL stock update
    // look like it failed to the hospital user.
    console.error('Blood inventory realtime notification failed:', error.message);
  }
}

// ==================== PUBLIC ROUTES ====================

exports.getAllBloodBanks = async (req, res) => {
  try {
    const { city } = req.query;
    const grouped = {};
    const allBanks = [];
    const hospitals = await getVisibleHospitalBloodStock(city);
    hospitals.forEach((hospital) => {
      hospital.bloodStock.forEach((stock) => {
        const row = {
          hospital_id: hospital.id,
          hospital_name: hospital.name,
          address: hospital.address,
          city: hospital.city,
          phone: hospital.phone,
          ...stock,
        };
        allBanks.push(row);
        if (!grouped[stock.blood_group]) {
          grouped[stock.blood_group] = [];
        }
        grouped[stock.blood_group].push(row);
      });
    });
    
    res.json({
      success: true,
      data: grouped,
      all_banks: allBanks,
    });
  } catch (error) {
    console.error('Get all blood banks error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  }
};

exports.getBloodAvailability = async (req, res) => {
  try {
    const inventory = await getHospitalBloodStock(req.params.hospitalId);
    res.json({
      success: true,
      hospitalId: inventory.hospital.id,
      bloodStock: inventory.bloodStock,
      // `data` is retained for existing Flutter callers.
      data: inventory.bloodStock,
    });
  } catch (error) {
    console.error('Get blood availability error:', error);
    res.status(error.code === 'INVALID_HOSPITAL_ID' ? 400 : error.code === 'HOSPITAL_NOT_FOUND' ? 404 : 500).json({
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  }
};

// ==================== BLOOD REQUEST (PATIENT) ====================

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

    console.log('Blood request:', { userId, hospital_id, blood_group, units_required });

    const bloodCheck = await pool.query(
      'SELECT units_available FROM blood_bank WHERE hospital_id = $1 AND blood_group = $2',
      [hospital_id, blood_group]
    );
    
    if (bloodCheck.rows.length > 0) {
      const available = bloodCheck.rows[0].units_available || 0;
      if (available < (units_required || 1)) {
        return res.status(400).json({
          success: false,
          message: `Not enough ${blood_group} blood available. Available: ${available}, Requested: ${units_required || 1}`
        });
      }
    }

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
        patientId, userId, hospital_id, blood_group, units_required || 1,
        patient_name || 'Patient', hospital_address || ''
      ]
    );


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

// ==================== UPDATE BLOOD STOCK ====================

exports.updateBloodStock = async (req, res) => {
  let client;
  try {
    const userId = req.user.id;
    const bloodGroup = normalizeBloodGroup(req.body.blood_group ?? req.body.bloodGroup);
    const units = Number(req.body.units);
    const expiryDate = req.body.expiry_date ?? req.body.expiryDate;
    const dateMatch = typeof expiryDate === 'string'
      ? expiryDate.match(/^(\d{4})-(\d{2})-(\d{2})$/)
      : null;
    const parsedDate = dateMatch ? new Date(`${expiryDate}T00:00:00.000Z`) : null;
    const isCalendarDate = !!parsedDate &&
      !Number.isNaN(parsedDate.getTime()) &&
      parsedDate.toISOString().slice(0, 10) === expiryDate;

    if (!bloodGroup || !Number.isSafeInteger(units) || units < 0) {
      return res.status(400).json({
        success: false,
        message: 'A valid blood group and non-negative whole unit count are required.',
      });
    }
    if (!isCalendarDate) {
      return res.status(400).json({
        success: false,
        message: 'Expiry date must be a valid date in YYYY-MM-DD format.',
      });
    }

    client = await pool.connect();
    await client.query('BEGIN');
    const hospitalResult = await client.query(
      'SELECT id FROM hospitals WHERE user_id = $1 FOR UPDATE',
      [userId],
    );
    if (!hospitalResult.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Hospital not found.' });
    }
    const hospitalId = hospitalResult.rows[0].id;
    const expiryCheck = await client.query(
      'SELECT $1::date >= CURRENT_DATE AS is_valid',
      [expiryDate],
    );
    if (!expiryCheck.rows[0]?.is_valid) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'Expiry date must be today or a future date.',
      });
    }

    const parent = await client.query(
      `SELECT id FROM blood_bank
       WHERE hospital_id = $1 AND blood_group = $2 FOR UPDATE`,
      [hospitalId, bloodGroup],
    );
    if (!parent.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Blood group stock was not found.' });
    }
    const bloodBankId = parent.rows[0].id;
    const batches = await client.query(
      `SELECT id, units_available FROM blood_inventory_batches
       WHERE blood_bank_id = $1 AND hospital_id = $2 AND blood_group = $3
       ORDER BY id FOR UPDATE`,
      [bloodBankId, hospitalId, bloodGroup],
    );
    const requestedBatchId = req.body.batch_id ?? req.body.batchId;
    let batch;
    if (requestedBatchId != null) {
      batch = batches.rows.find((row) => String(row.id) === String(requestedBatchId));
    } else if (batches.rows.length === 1) {
      batch = batches.rows[0];
    } else if (batches.rows.length > 1) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'Select a specific stock batch to edit.' });
    }
    if (!batch) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Blood stock batch was not found.' });
    }
    const previousUnits = Number(batch.units_available);
    const updatedBatch = await client.query(
      `UPDATE blood_inventory_batches
       SET units_available = $1, expiry_date = $2::date, updated_at = CURRENT_TIMESTAMP
       WHERE id = $3 AND blood_bank_id = $4 AND hospital_id = $5 AND blood_group = $6
       RETURNING *`,
      [units, expiryDate, batch.id, bloodBankId, hospitalId, bloodGroup],
    );
    if (updatedBatch.rowCount !== 1) {
      throw new Error('The selected blood stock batch could not be updated.');
    }
    const totals = await client.query(
      `SELECT COALESCE(SUM(units_available) FILTER (WHERE expiry_date IS NULL OR expiry_date >= CURRENT_DATE), 0) AS units,
              MIN(expiry_date) FILTER (WHERE expiry_date IS NULL OR expiry_date >= CURRENT_DATE) AS expiry_date
       FROM blood_inventory_batches WHERE blood_bank_id = $1`,
      [bloodBankId],
    );
    await client.query(
      `UPDATE blood_bank SET units_available = $1, expiry_date = $2,
         last_updated = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $3 AND hospital_id = $4`,
      [totals.rows[0].units, totals.rows[0].expiry_date, bloodBankId, hospitalId],
    );
    const change = Math.abs(units - previousUnits);
    if (change > 0) {
      await client.query(
        `INSERT INTO blood_inventory_transactions
           (hospital_id, blood_bank_id, blood_group, transaction_type, units, reference_type, created_by)
         VALUES ($1, $2, $3, 'ADJUSTMENT', $4, $5, $6)`,
        [
          hospitalId,
            bloodBankId,
          bloodGroup,
          change,
          units >= previousUnits ? 'MANUAL_ADJUSTMENT_IN' : 'MANUAL_ADJUSTMENT_OUT',
          userId,
        ],
      );
    }
    await client.query('COMMIT');
    await emitBloodInventoryChanged(req, hospitalId);
    res.json({
      success: true,
      message: 'Blood stock updated successfully',
      data: { ...updatedBatch.rows[0], group_units_available: totals.rows[0].units },
    });
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    console.error('Update blood stock error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  } finally {
    client?.release();
  }
};

// ==================== BLOOD EXPIRY MANAGEMENT ====================

exports.addBloodWithExpiry = async (req, res) => {
  let client;
  try {
    const userId = req.user.id;
    const { 
      blood_group: requestedBloodGroup,
      units, 
      expiry_date,
      donation_date,
      donor_name,
      donor_phone,
      batch_number
    } = req.body;
    const blood_group = normalizeBloodGroup(requestedBloodGroup);
    const unitCount = Number(units);
    const validDate = (value) => {
      if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
      const parsed = new Date(`${value}T00:00:00.000Z`);
      return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
    };
    if (!blood_group || !Number.isFinite(unitCount) || unitCount <= 0 || unitCount > 1000 || Math.round(unitCount * 100) !== unitCount * 100) {
      return res.status(400).json({ success: false, message: 'A valid blood group and a positive amount up to 1000 units are required.' });
    }
    if ((expiry_date && !validDate(expiry_date)) || (donation_date && !validDate(donation_date)) ||
        (donation_date && donation_date > new Date().toISOString().slice(0, 10)) ||
        (expiry_date && new Date(`${expiry_date}T00:00:00Z`) < new Date(new Date().toISOString().slice(0, 10)))) {
      return res.status(400).json({ success: false, message: 'Enter valid donation and future expiry dates.' });
    }
    if (batch_number != null && (typeof batch_number !== 'string' || batch_number.trim().length > 50)) {
      return res.status(400).json({ success: false, message: 'Batch number must be 50 characters or fewer.' });
    }
    if ((donor_name != null && (typeof donor_name !== 'string' || donor_name.trim().length > 255)) ||
        (donor_phone != null && (typeof donor_phone !== 'string' || donor_phone.trim().length > 30))) {
      return res.status(400).json({ success: false, message: 'Donor name or phone number is invalid.' });
    }

    const batchNum = batch_number?.trim() || `BATCH-${require('crypto').randomUUID()}`;
    client = await pool.connect();
    await client.query('BEGIN');
    const hospitalResult = await client.query('SELECT id FROM hospitals WHERE user_id = $1', [userId]);
    if (!hospitalResult.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Hospital not found.' });
    }
    const hospitalId = hospitalResult.rows[0].id;
    const parent = await client.query(
      `INSERT INTO blood_bank (
         hospital_id, blood_group, units_available, expiry_date, batch_number,
         donation_date, donor_name, donor_phone, last_updated, minimum_threshold
       ) VALUES ($1, $2, 0, NULL, $3, COALESCE($4::date, CURRENT_DATE), $5, $6, CURRENT_TIMESTAMP, 10)
       ON CONFLICT (hospital_id, blood_group)
       DO UPDATE SET last_updated = CURRENT_TIMESTAMP
       RETURNING *`,
      [hospitalId, blood_group, batchNum, donation_date || null,
       donor_name?.trim() || 'Unknown', donor_phone?.trim() || null]
    );
    const bloodBankId = parent.rows[0].id;
    const result = await client.query(
      `INSERT INTO blood_inventory_batches
         (blood_bank_id, hospital_id, blood_group, batch_number, units_available,
          expiry_date, donation_date, donor_name, donor_phone)
       VALUES ($1, $2, $3, $4, $5, $6::date, COALESCE($7::date, CURRENT_DATE), $8, $9)
       RETURNING *`,
      [bloodBankId, hospitalId, blood_group, batchNum, unitCount, expiry_date || null,
       donation_date || null, donor_name?.trim() || 'Unknown', donor_phone?.trim() || null]
    );
    const totals = await client.query(
      `SELECT COALESCE(SUM(units_available) FILTER (WHERE expiry_date IS NULL OR expiry_date >= CURRENT_DATE), 0) AS units,
              MIN(expiry_date) FILTER (WHERE expiry_date IS NULL OR expiry_date >= CURRENT_DATE) AS expiry_date
       FROM blood_inventory_batches WHERE blood_bank_id = $1`,
      [bloodBankId],
    );
    await client.query(
      `UPDATE blood_bank SET units_available = $1, expiry_date = $2,
         batch_number = $3, donation_date = $4::date, donor_name = $5,
         donor_phone = $6, last_updated = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $7 AND hospital_id = $8`,
      [totals.rows[0].units, totals.rows[0].expiry_date, batchNum, donation_date || null,
       donor_name?.trim() || 'Unknown', donor_phone?.trim() || null, bloodBankId, hospitalId],
    );
    await client.query(
      `INSERT INTO blood_inventory_transactions
         (hospital_id, blood_bank_id, blood_group, transaction_type, units, reference_type, created_by)
       VALUES ($1, $2, $3, 'DONATION', $4, 'DIRECT_STOCK_ADD', $5)`,
      [hospitalId, bloodBankId, blood_group, unitCount, userId]
    );
    await client.query('COMMIT');
    await emitBloodInventoryChanged(req, hospitalId);

    res.status(201).json({
      success: true,
      message: `${unitCount} unit(s) of ${blood_group} added to hospital stock.`,
      data: { ...result.rows[0], group_units_available: totals.rows[0].units },
    });
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    console.error('Add blood with expiry error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  } finally {
    client?.release();
  }
};

// ==================== BLOOD REQUEST MANAGEMENT (HOSPITAL & PATIENT) ====================

exports.getHospitalBloodRequests = async (req, res) => {
  try {
    const userId = req.user.id;

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
      `SELECT b.*, COALESCE(u.name, b.patient_name, 'Patient') as patient_name, u.phone as patient_phone
       FROM blood_requests b
       LEFT JOIN users u ON b.user_id = u.id
       WHERE b.hospital_id = $1
       ORDER BY b.request_date DESC
       LIMIT 100`,
      [hospitalId]
    );

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

exports.getMyBloodRequests = async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(
      `SELECT b.*, h.name as hospital_name, h.address as hospital_address_info, h.phone as hospital_phone
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

exports.approveBloodRequest = async (req, res) => {
  let client;
  try {
    const userId = req.user.id;
    const requestId = Number(req.params.requestId);
    if (!Number.isSafeInteger(requestId) || requestId < 1) return res.status(400).json({success:false,message:'Valid request ID is required'});
    client = await pool.connect();
    await client.query('BEGIN');
    const hospitalResult = await client.query('SELECT id FROM hospitals WHERE user_id = $1 FOR UPDATE', [userId]);
    if (!hospitalResult.rowCount) { await client.query('ROLLBACK'); return res.status(404).json({ success: false, message: 'Hospital not found' }); }
    const hospitalId = hospitalResult.rows[0].id;
    const request = await client.query(`SELECT * FROM blood_requests WHERE id=$1 AND hospital_id=$2 AND status='pending' FOR UPDATE`, [requestId, hospitalId]);
    if (!request.rowCount) { await client.query('ROLLBACK'); return res.status(404).json({ success: false, message: 'Pending request not found' }); }
    const bloodReq = request.rows[0];
    // The conditional decrement serializes competing approvals and cannot make stock negative.
    const stock = await client.query(`UPDATE blood_bank SET units_available=units_available-$1,last_updated=CURRENT_TIMESTAMP
      WHERE hospital_id=$2 AND blood_group=$3 AND units_available >= $1
        AND (expiry_date IS NULL OR expiry_date >= CURRENT_DATE) RETURNING units_available`, [bloodReq.units_required, hospitalId, bloodReq.blood_group]);
    if (!stock.rowCount) { await client.query('ROLLBACK'); return res.status(400).json({success:false,message:`Insufficient ${bloodReq.blood_group} stock for this request`}); }
    const result = await client.query(`UPDATE blood_requests SET status='approved',fulfilled_date=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP
      WHERE id=$1 AND hospital_id=$2 AND status='pending' RETURNING *`, [requestId, hospitalId]);
    if (!result.rowCount) { await client.query('ROLLBACK'); return res.status(409).json({success:false,message:'Request was already processed'}); }
    await client.query('COMMIT');
    await emitBloodInventoryChanged(req, hospitalId);
    res.json({ success: true, message: 'Blood request approved and stock deducted', data: result.rows[0] });
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    console.error('Approve blood request error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  } finally {
    client?.release();
  }
};

exports.fulfillBloodRequest = exports.approveBloodRequest;

exports.rejectBloodRequest = async (req, res) => {
  try {
    const userId = req.user.id;
    const { requestId } = req.params;
    const { reason } = req.body;

    const hospitalResult = await pool.query(
      'SELECT id FROM hospitals WHERE user_id = $1', [userId]
    );
    if (hospitalResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Hospital not found' });
    }
    const hospitalId = hospitalResult.rows[0].id;

    const result = await pool.query(
      "UPDATE blood_requests SET status = 'rejected', rejection_reason = $1, rejected_date = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND hospital_id = $3 AND status = 'pending' RETURNING *",
      [reason || 'No reason provided', requestId, hospitalId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Pending request not found' });
    }
    await emitBloodInventoryChanged(req, hospitalResult.rows[0].id);

    res.json({ success: true, message: 'Blood request rejected', data: result.rows[0] });
  } catch (error) {
    console.error('Reject blood request error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// ==================== EMERGENCY BLOOD REQUEST ====================

exports.emergencyBloodRequest = async (req, res) => {
  let client;
  try {
    const userId = req.user.id;
    const { blood_group: requestedGroup, units_required, patient_name, urgency_level } = req.body;
    const bloodGroup = normalizeBloodGroup(requestedGroup);
    const units = Number(units_required);
    if (!bloodGroup || !Number.isSafeInteger(units) || units < 1 || units > 100) {
      return res.status(400).json({ success: false, message: 'A valid blood group and request of 1 to 100 units are required.' });
    }

    client = await pool.connect();
    await client.query('BEGIN');
    const patientResult = await client.query('SELECT id FROM patients WHERE user_id = $1', [userId]);
    const patientId = patientResult.rows[0]?.id ?? null;
    const targetResult = await client.query(
      `SELECT bb.id, bb.hospital_id, bb.units_available, h.name AS hospital_name
       FROM blood_bank bb JOIN hospitals h ON h.id = bb.hospital_id
       WHERE bb.blood_group = $1 AND bb.units_available >= $2 AND h.is_verified = TRUE
         AND (bb.expiry_date IS NULL OR bb.expiry_date >= CURRENT_DATE)
       ORDER BY bb.units_available DESC, h.name
       LIMIT 1 FOR UPDATE OF bb SKIP LOCKED`,
      [bloodGroup, units]
    );
    if (!targetResult.rowCount) {
      await client.query('ROLLBACK');
      return res.status(409).json({ success: false, message: `No hospital currently has ${units} unexpired units of ${bloodGroup} available.` });
    }
    const targetHospital = targetResult.rows[0];
    const stockUpdate = await client.query(
      `UPDATE blood_bank SET units_available = units_available - $1,
         last_updated = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND units_available >= $1 RETURNING id`,
      [units, targetHospital.id]
    );
    if (!stockUpdate.rowCount) {
      await client.query('ROLLBACK');
      return res.status(409).json({ success: false, message: 'Blood inventory changed. Please retry.' });
    }
    const result = await client.query(
      `INSERT INTO blood_requests (
        patient_id, user_id, hospital_id, blood_group, units_required,
        patient_name, status, urgency_level, request_date
      ) VALUES ($1, $2, $3, $4, $5, $6, 'approved', $7, CURRENT_TIMESTAMP)
      RETURNING *`,
      [patientId, userId, targetHospital.hospital_id, bloodGroup, units,
       typeof patient_name === 'string' ? patient_name.trim().slice(0, 255) : 'Emergency Patient', urgency_level || 'critical']
    );
    await client.query(
      `INSERT INTO blood_inventory_transactions
         (hospital_id, blood_bank_id, blood_group, transaction_type, units, reference_type, reference_id, created_by)
       VALUES ($1, $2, $3, 'ISSUED', $4, 'EMERGENCY_BLOOD_REQUEST', $5, $6)`,
      [targetHospital.hospital_id, targetHospital.id, bloodGroup, units, result.rows[0].id, userId]
    );
    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      message: `Emergency blood request approved. ${units} units of ${bloodGroup} allocated from ${targetHospital.hospital_name}.`,
      data: result.rows[0],
    });
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    console.error('Emergency blood request error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  } finally {
    client?.release();
  }
};

// ==================== INTER-HOSPITAL BLOOD TRANSFER ====================

exports.transferBlood = async (req, res) => {
  let client;
  try {
    const userId = req.user.id;
    const targetHospitalId = Number(req.body.target_hospital_id);
    const bloodGroup = normalizeBloodGroup(req.body.blood_group);
    const units = Number(req.body.units);
    if (!Number.isSafeInteger(targetHospitalId) || targetHospitalId < 1 || !bloodGroup || !Number.isSafeInteger(units) || units < 1 || units > 1000) {
      return res.status(400).json({ success: false, message: 'Select a valid target hospital and blood group, and transfer between 1 and 1000 units.' });
    }

    client = await pool.connect();
    await client.query('BEGIN');
    const sourceResult = await client.query('SELECT id, name FROM hospitals WHERE user_id = $1', [userId]);
    if (!sourceResult.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Source hospital not found.' });
    }
    const sourceHospitalId = sourceResult.rows[0].id;
    if (sourceHospitalId === targetHospitalId) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'Cannot transfer stock to the same hospital.' });
    }
    const target = await client.query('SELECT id FROM hospitals WHERE id=$1', [targetHospitalId]);
    if (!target.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Target hospital not found.' });
    }
    const debit = await client.query(
      `UPDATE blood_bank SET units_available=units_available-$1,
         last_updated=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP
       WHERE hospital_id=$2 AND blood_group=$3 AND units_available >= $1
         AND (expiry_date IS NULL OR expiry_date >= CURRENT_DATE)
       RETURNING id, expiry_date, batch_number`,
      [units, sourceHospitalId, bloodGroup]
    );
    if (!debit.rowCount) {
      await client.query('ROLLBACK');
      return res.status(409).json({ success: false, message: `Insufficient unexpired ${bloodGroup} stock to transfer.` });
    }
    const credit = await client.query(
      `INSERT INTO blood_bank (hospital_id, blood_group, units_available, expiry_date, batch_number, last_updated, minimum_threshold)
       VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, 10)
       ON CONFLICT (hospital_id, blood_group)
       DO UPDATE SET units_available = blood_bank.units_available + $3,
         expiry_date = CASE
           WHEN blood_bank.units_available <= 0 OR blood_bank.expiry_date < CURRENT_DATE THEN EXCLUDED.expiry_date
           WHEN EXCLUDED.expiry_date IS NULL THEN blood_bank.expiry_date
           WHEN blood_bank.expiry_date IS NULL THEN EXCLUDED.expiry_date
           ELSE LEAST(blood_bank.expiry_date, EXCLUDED.expiry_date)
         END,
         batch_number = EXCLUDED.batch_number,
         last_updated = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       RETURNING id`,
      [targetHospitalId, bloodGroup, units, debit.rows[0].expiry_date, debit.rows[0].batch_number]
    );
    await client.query(
      `INSERT INTO blood_inventory_transactions
         (hospital_id, blood_bank_id, blood_group, transaction_type, units, reference_type, created_by)
       VALUES ($1, $2, $3, 'ADJUSTMENT', $4, 'TRANSFER_OUT', $5),
              ($6, $7, $3, 'ADJUSTMENT', $4, 'TRANSFER_IN', $5)`,
      [sourceHospitalId, debit.rows[0].id, bloodGroup, units, userId, targetHospitalId, credit.rows[0].id]
    );
    await client.query('COMMIT');
    await Promise.all([sourceHospitalId, targetHospitalId].map((id) => emitBloodInventoryChanged(req, id)));
    res.json({
      success: true,
      message: `${units} units of ${bloodGroup} transferred successfully.`,
      data: { source: sourceHospitalId, target: targetHospitalId, blood_group: bloodGroup, units },
    });
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    console.error('Transfer blood error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  } finally {
    client?.release();
  }
};

// ==================== BLOOD BANK ANALYTICS ====================

exports.getBloodBankAnalytics = async (req, res) => {
  try {
    const userId = req.user.id;

    const hospitalResult = await pool.query('SELECT id FROM hospitals WHERE user_id = $1', [userId]);
    if (hospitalResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Hospital not found' });
    }
    const hospitalId = hospitalResult.rows[0].id;

    // Stock by group
    const stockResult = await pool.query(
      `SELECT blood_group, COALESCE(SUM(units_available), 0) as total_units, minimum_threshold
       FROM blood_bank WHERE hospital_id = $1
       GROUP BY blood_group, minimum_threshold
       ORDER BY blood_group`,
      [hospitalId]
    );

    // Requests summary
    const requestsResult = await pool.query(
      `SELECT
         COUNT(*) as total_requests,
         COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
         COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved,
         COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected,
         COALESCE(SUM(units_required), 0) as total_units_requested
       FROM blood_requests WHERE hospital_id = $1`,
      [hospitalId]
    );

    // Low stock alerts
    const lowStockResult = await pool.query(
      `SELECT blood_group, units_available, minimum_threshold
       FROM blood_bank 
       WHERE hospital_id = $1 AND units_available < COALESCE(minimum_threshold, 10)
       ORDER BY units_available ASC`,
      [hospitalId]
    );

    // Expiring soon (next 7 days)
    const expiringResult = await pool.query(
      `SELECT blood_group, SUM(units_available) as units, MIN(expiry_date) as nearest_expiry
       FROM blood_bank
       WHERE hospital_id = $1 AND expiry_date IS NOT NULL
         AND expiry_date <= CURRENT_DATE + INTERVAL '7 days'
         AND expiry_date >= CURRENT_DATE AND units_available > 0
       GROUP BY blood_group`,
      [hospitalId]
    );

    res.json({
      success: true,
      data: {
        stock_by_group: stockResult.rows,
        requests_summary: requestsResult.rows[0],
        low_stock_alerts: lowStockResult.rows,
        expiring_soon: expiringResult.rows,
        all_blood_groups: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'],
      },
    });
  } catch (error) {
    console.error('Get blood bank analytics error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// ==================== BLOOD EXPIRY MANAGEMENT ====================

exports.getBloodExpiryNotifications = async (req, res) => {
  try {
    const userId = req.user.id;

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
      `SELECT * FROM blood_expiry_notifications 
       WHERE hospital_id = $1 
       ORDER BY created_at DESC 
       LIMIT 50`,
      [hospitalId]
    );

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error('Get blood expiry notifications error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  }
};

exports.markNotificationRead = async (req, res) => {
  try {
    const { notificationId } = req.params;
    const userId = req.user.id;

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
      `UPDATE blood_expiry_notifications 
       SET is_read = true 
       WHERE id = $1 AND hospital_id = $2
       RETURNING *`,
      [notificationId, hospitalId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Notification not found' 
      });
    }

    res.json({
      success: true,
      message: 'Notification marked as read',
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Mark notification read error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  }
};

exports.markAllNotificationsRead = async (req, res) => {
  try {
    const userId = req.user.id;

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

    await pool.query(
      `UPDATE blood_expiry_notifications 
       SET is_read = true 
       WHERE hospital_id = $1 AND is_read = false`,
      [hospitalId]
    );

    res.json({
      success: true,
      message: 'All notifications marked as read',
    });
  } catch (error) {
    console.error('Mark all notifications read error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  }
};

// ==================== BLOOD USAGE ====================

exports.useBloodUnits = async (req, res) => {
  let client;
  try {
    const userId = req.user.id;
    const { blood_group, units_required, used_for } = req.body;
    const bloodGroup = normalizeBloodGroup(blood_group);
    const units = Number(units_required);
    if (!bloodGroup || !Number.isFinite(units) || units <= 0 || units > 1000 || Math.round(units * 100) !== units * 100) {
      return res.status(400).json({ success: false, message: 'A valid blood group and positive amount up to 1000 units are required.' });
    }

    client = await pool.connect();
    await client.query('BEGIN');
    const hospitalResult = await client.query('SELECT id FROM hospitals WHERE user_id = $1', [userId]);
    if (!hospitalResult.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Hospital not found.' });
    }
    const hospitalId = hospitalResult.rows[0].id;
    const stockResult = await client.query(
      `UPDATE blood_bank SET units_available = units_available - $1,
         last_updated = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE hospital_id = $2 AND blood_group = $3 AND units_available >= $1
         AND (expiry_date IS NULL OR expiry_date >= CURRENT_DATE)
       RETURNING id, units_available`,
      [units, hospitalId, bloodGroup]
    );
    if (!stockResult.rowCount) {
      await client.query('ROLLBACK');
      return res.status(409).json({ success: false, message: `Insufficient unexpired ${bloodGroup} blood stock.` });
    }
    await client.query(
      `INSERT INTO blood_inventory_transactions
         (hospital_id, blood_bank_id, blood_group, transaction_type, units, reference_type, created_by)
       VALUES ($1, $2, $3, 'ISSUED', $4, 'STOCK_USAGE', $5)`,
      [hospitalId, stockResult.rows[0].id, bloodGroup, units, userId]
    );
    await client.query('COMMIT');
    await emitBloodInventoryChanged(req, hospitalId);
    const usedBatches = [{ units_used: units }];

    res.json({
      success: true,
      message: `${units_required} unit(s) of ${blood_group} blood used successfully`,
      data: {
        blood_group: bloodGroup,
        units_used: units,
        batches_used: usedBatches,
        used_for: used_for || 'Patient use',
      },
    });
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    console.error('Use blood units error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  } finally {
    client?.release();
  }
};

exports.checkBloodExpiry = async (req, res) => {
  try {
    const userId = req.user.id;

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

    const columnsCheck = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'blood_bank' 
      AND column_name = 'expiry_date'
    `);

    if (columnsCheck.rows.length === 0) {
      return res.json({
        success: true,
        message: 'Expiry tracking not enabled. Please run migration.',
        data: { critical: [], warning: [], notifications_created: 0 }
      });
    }

    const criticalResult = await pool.query(
      `SELECT blood_group, SUM(units_available) as total_units, 
              MIN(expiry_date) as nearest_expiry
       FROM blood_bank 
       WHERE hospital_id = $1 AND expiry_date <= CURRENT_DATE + INTERVAL '7 days' 
         AND expiry_date >= CURRENT_DATE AND units_available > 0
       GROUP BY blood_group`,
      [hospitalId]
    );

    const warningResult = await pool.query(
      `SELECT blood_group, SUM(units_available) as total_units, 
              MIN(expiry_date) as nearest_expiry
       FROM blood_bank 
       WHERE hospital_id = $1 AND expiry_date <= CURRENT_DATE + INTERVAL '30 days' 
         AND expiry_date > CURRENT_DATE + INTERVAL '7 days'
         AND units_available > 0
       GROUP BY blood_group`,
      [hospitalId]
    );

    let notificationsCreated = 0;

    try {
      for (const item of criticalResult.rows) {
        await pool.query(
          `INSERT INTO blood_expiry_notifications (
            hospital_id, blood_group, units_affected, 
            expiry_date, notification_type, message
          ) VALUES ($1, $2, $3, $4, 'critical', $5)`,
          [
            hospitalId,
            item.blood_group,
            item.total_units,
            item.nearest_expiry,
            `⚠️ CRITICAL: ${item.total_units} unit(s) of ${item.blood_group} blood expiring in 7 days!`
          ]
        );
        notificationsCreated++;
      }

      for (const item of warningResult.rows) {
        await pool.query(
          `INSERT INTO blood_expiry_notifications (
            hospital_id, blood_group, units_affected, 
            expiry_date, notification_type, message
          ) VALUES ($1, $2, $3, $4, 'warning', $5)`,
          [
            hospitalId,
            item.blood_group,
            item.total_units,
            item.nearest_expiry,
            `📋 ${item.total_units} unit(s) of ${item.blood_group} blood expiring in 30 days. Plan usage.`
          ]
        );
        notificationsCreated++;
      }
    } catch (err) {
      console.log('Notifications table not yet created, skipping notifications');
    }

    res.json({
      success: true,
      message: 'Blood expiry check completed',
      data: {
        critical: criticalResult.rows,
        warning: warningResult.rows,
        notifications_created: notificationsCreated,
      },
    });
  } catch (error) {
    console.error('Check blood expiry error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  }
};

exports.getDonationHistory = async (req, res) => {
  try {
    const userId = req.user.id;

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

    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT 1 
        FROM information_schema.tables 
        WHERE table_name = 'blood_donation_history'
      )
    `);
    
    if (!tableCheck.rows[0].exists) {
      return res.json({
        success: true,
        data: [],
        message: 'Donation history table not yet created. Please run migration.',
      });
    }

    const result = await pool.query(
      `SELECT * FROM blood_donation_history 
       WHERE hospital_id = $1 
       ORDER BY donation_date DESC 
       LIMIT 100`,
      [hospitalId]
    );

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error('Get donation history error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  }
};

exports.getBloodStockWithExpiry = async (req, res) => {
  try {
    const userId = req.user.id;

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

    // Both hospital and patient reads go through the same stock normalizer.
    // Expiry detail has a separate screen; it must not alter inventory totals.
    const inventory = await getHospitalBloodStock(hospitalId);
    const result = { rows: inventory.bloodStock };

    res.json({
      success: true,
      data: {
        blood_stock: result.rows,
        notifications: [],
        summary: _getBloodSummary(result.rows),
      },
      hospitalId,
      bloodStock: result.rows,
    });
  } catch (error) {
    console.error('Get blood stock with expiry error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  }
};

// ==================== DEBUG: GET ALL BLOOD BANK ====================

exports.debugGetAllBloodBank = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM blood_bank ORDER BY hospital_id, blood_group`
    );
    
    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error('Debug blood bank error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  }
};

exports.deleteBloodStock = async (req, res) => {
  try {
    const hospitalResult = await pool.query(
      'SELECT id FROM hospitals WHERE user_id = $1', [req.user.id]
    );
    if (hospitalResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Hospital not found' });
    }
    const result = await pool.query(
      'DELETE FROM blood_bank WHERE hospital_id = $1 AND blood_group = $2 RETURNING id',
      [hospitalResult.rows[0].id, req.params.bloodGroup]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Blood group not found' });
    }
    res.json({ success: true, message: 'Blood stock deleted successfully' });
  } catch (error) {
    console.error('Delete blood stock error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// ==================== HELPER FUNCTIONS ====================

const _getBloodSummary = (bloodStock) => {
  const summary = {
    total_units: 0,
    by_group: {},
    by_status: {
      good: 0,
      warning: 0,
      critical: 0,
      expired: 0,
    },
    expiring_soon: [],
  };

  if (!bloodStock || bloodStock.length === 0) {
    return summary;
  }

  bloodStock.forEach((item) => {
    const units = Number(item.units_available) || 0;
    summary.total_units += units;
    
    if (!summary.by_group[item.blood_group]) {
      summary.by_group[item.blood_group] = 0;
    }
    summary.by_group[item.blood_group] += units;

    const status = item.status || 'good';
    if (status === 'good') summary.by_status.good += units;
    else if (status === 'warning') summary.by_status.warning += units;
    else if (status === 'critical') summary.by_status.critical += units;
    else if (status === 'expired') summary.by_status.expired += units;

    const daysRemaining = item.days_remaining;
    if (daysRemaining !== null && daysRemaining !== undefined && daysRemaining >= 0 && daysRemaining <= 30) {
      summary.expiring_soon.push({
        blood_group: item.blood_group,
        units: units,
        days_remaining: Math.round(daysRemaining),
        expiry_date: item.expiry_date,
      });
    }
  });

  return summary;
};
