// src/controllers/donationCampaignController.js
const { pool } = require('../config/database');
const VALID_BLOOD_GROUPS = new Set(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']);

// ==================== CREATE CAMPAIGN ====================
exports.createCampaign = async (req, res) => {
  try {
    const userId = req.user.id;
    const { 
      campaign_name, description, location, city,
      start_date, end_date, start_time, end_time,
      target_donors, blood_groups_needed, contact_person, contact_phone
    } = req.body;

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
      `INSERT INTO blood_donation_campaigns (
        hospital_id, campaign_name, description, location, city,
        start_date, end_date, start_time, end_time,
        target_donors, blood_groups_needed, contact_person, contact_phone, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'pending')
      RETURNING *`,
      [
        hospitalId, campaign_name, description, location, city,
        start_date, end_date, start_time, end_time,
        target_donors || 50, blood_groups_needed || ['A+', 'A-', 'B+', 'B-', 'O+', 'O-'],
        contact_person, contact_phone
      ]
    );

    res.status(201).json({
      success: true,
      message: 'Blood donation campaign created successfully',
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Create campaign error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  }
};

// ==================== GET ALL CAMPAIGNS (PATIENT VIEW) ====================
// src/controllers/donationCampaignController.js - Update getAllCampaigns for Admin

// ==================== GET ALL CAMPAIGNS FOR ADMIN ====================
exports.getAllCampaigns = async (req, res) => {
  try {
    const { status, city, hospital_id } = req.query;
    
    let query = `
      SELECT c.*, h.name as hospital_name, h.phone as hospital_phone, 
             h.address as hospital_address, h.city as hospital_city,
             h.email as hospital_email
      FROM blood_donation_campaigns c
      JOIN hospitals h ON c.hospital_id = h.id
      WHERE 1=1
    `;
    
    const params = [];
    let paramIndex = 1;
    
    if (status && status !== 'all') {
      query += ` AND c.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }
    
    if (city) {
      query += ` AND c.city ILIKE $${paramIndex}`;
      params.push(`%${city}%`);
      paramIndex++;
    }
    
    if (hospital_id) {
      query += ` AND c.hospital_id = $${paramIndex}`;
      params.push(hospital_id);
      paramIndex++;
    }
    
    query += ` ORDER BY c.created_at DESC`;
    
    const result = await pool.query(query, params);
    
    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error('Get all campaigns error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  }
};

// ==================== ADMIN DASHBOARD STATS ====================
exports.getAdminCampaignStats = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        COUNT(*) as total_campaigns,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_campaigns,
        COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved_campaigns,
        COUNT(CASE WHEN status = 'active' THEN 1 END) as active_campaigns,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_campaigns,
        COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected_campaigns,
        SUM(target_donors) as total_target_donors,
        SUM(registered_donors) as total_registered_donors,
        SUM(total_blood_collected) as total_blood_collected
      FROM blood_donation_campaigns
    `);

    res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Get admin campaign stats error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  }
};

// ==================== GET HOSPITAL CAMPAIGNS ====================
// src/controllers/donationCampaignController.js - Update getHospitalCampaigns

exports.getHospitalCampaigns = async (req, res) => {
  try {
    const userId = req.user.id;
    console.log('Getting hospital campaigns for user:', userId);

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
      `SELECT * FROM blood_donation_campaigns 
       WHERE hospital_id = $1 
       ORDER BY created_at DESC`,
      [hospitalId]
    );

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error('Get hospital campaigns error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  }
};

// ==================== GET CAMPAIGN DETAILS ====================
exports.getCampaignDetails = async (req, res) => {
  try {
    const { campaignId } = req.params;

    const result = await pool.query(
      `SELECT c.*, h.name as hospital_name, h.phone as hospital_phone, h.address as hospital_address
       FROM blood_donation_campaigns c
       JOIN hospitals h ON c.hospital_id = h.id
       WHERE c.id = $1`,
      [campaignId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Campaign not found' 
      });
    }

    // Get registrations count by status
    const registrationsResult = await pool.query(
      `SELECT status, COUNT(*) as count 
       FROM blood_donation_registrations 
       WHERE campaign_id = $1 
       GROUP BY status`,
      [campaignId]
    );

    const registrations = {};
    registrationsResult.rows.forEach(row => {
      registrations[row.status] = parseInt(row.count);
    });

    res.json({
      success: true,
      data: {
        ...result.rows[0],
        registrations_summary: registrations,
      },
    });
  } catch (error) {
    console.error('Get campaign details error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  }
};

// ==================== PATIENT REGISTER FOR CAMPAIGN ====================
exports.registerForCampaign = async (req, res) => {
  const client = await pool.connect();
  try {
    const userId = req.user.id;
    const { 
      campaign_id, 
      donor_name, 
      donor_phone, 
      donor_email, 
      blood_group, 
      age, 
      weight, 
      last_donation_date, 
      medical_conditions 
    } = req.body;

    // Check if campaign exists and is active
    await client.query('BEGIN');
    const campaignResult = await client.query(
      'SELECT id, hospital_id, status, registered_donors, target_donors, maximum_donors, registration_deadline FROM blood_donation_campaigns WHERE id = $1 FOR UPDATE',
      [campaign_id]
    );

    if (campaignResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ 
        success: false, 
        message: 'Campaign not found' 
      });
    }

    if (campaignResult.rows[0].status !== 'approved' && campaignResult.rows[0].status !== 'active') {
      await client.query('ROLLBACK');
      return res.status(400).json({ 
        success: false, 
        message: 'This campaign is not accepting registrations' 
      });
    }
    const campaign = campaignResult.rows[0];
    if (campaign.registration_deadline && new Date(campaign.registration_deadline) < new Date()) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'The registration deadline has passed' });
    }
    const capacity = campaign.maximum_donors || campaign.target_donors;
    if (capacity && Number(campaign.registered_donors || 0) >= Number(capacity)) {
      await client.query('ROLLBACK');
      return res.status(409).json({ success: false, message: 'Registration is full' });
    }

    // Get patient id
    const patientResult = await client.query(
      'SELECT id FROM patients WHERE user_id = $1',
      [userId]
    );

    let patientId = null;
    if (patientResult.rows.length > 0) {
      patientId = patientResult.rows[0].id;
    }

    // Check if already registered
    const checkResult = await client.query(
      'SELECT id, status FROM blood_donation_registrations WHERE campaign_id = $1 AND user_id = $2',
      [campaign_id, userId]
    );

    if (checkResult.rows.length > 0) {
      const existingStatus = checkResult.rows[0].status;
      if (existingStatus === 'registered' || existingStatus === 'checked_in' || existingStatus === 'donated') {
        await client.query('ROLLBACK');
        return res.status(409).json({
          success: false,
          message: `You are already ${existingStatus} for this campaign`
        });
      }
    }

    const result = await client.query(
      `INSERT INTO blood_donation_registrations (
        campaign_id, hospital_id, user_id, patient_id, donor_name, donor_phone, donor_email,
        blood_group, age, weight, last_donation_date, medical_conditions, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'registered')
      RETURNING *`,
      [
        campaign_id, campaign.hospital_id, userId, patientId, donor_name, donor_phone, donor_email,
        blood_group, age, weight, last_donation_date, medical_conditions
      ]
    );

    // Update registered donors count
    await client.query(
      `UPDATE blood_donation_campaigns 
       SET registered_donors = registered_donors + 1 
       WHERE id = $1`,
      [campaign_id]
    );
    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      message: 'Successfully registered for blood donation camp',
      data: result.rows[0],
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Register for campaign error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  } finally { client.release(); }
};

// ==================== GET USER REGISTRATIONS ====================
// src/controllers/donationCampaignController.js - Fix getUserRegistrations

// ==================== GET USER REGISTRATIONS ====================
exports.getUserRegistrations = async (req, res) => {
  try {
    const userId = req.user.id;
    console.log('Getting registrations for user:', userId);

    const result = await pool.query(
      `SELECT r.*, c.campaign_name, c.location, c.start_date, c.end_date, 
              h.name as hospital_name
       FROM blood_donation_registrations r
       JOIN blood_donation_campaigns c ON r.campaign_id = c.id
       JOIN hospitals h ON c.hospital_id = h.id
       WHERE r.user_id = $1
       ORDER BY r.registration_date DESC`,
      [userId]
    );

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error('Get user registrations error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  }
};

// ==================== GET CAMPAIGN REGISTRATIONS (HOSPITAL) ====================
exports.getCampaignRegistrations = async (req, res) => {
  try {
    const { campaignId } = req.params;
    const userId = req.user.id;

    // Verify hospital owns this campaign
    const checkResult = await pool.query(
      `SELECT c.id FROM blood_donation_campaigns c
       JOIN hospitals h ON c.hospital_id = h.id
       WHERE c.id = $1 AND h.user_id = $2`,
      [campaignId, userId]
    );

    if (checkResult.rows.length === 0) {
      return res.status(403).json({ 
        success: false, 
        message: 'Unauthorized to view this campaign\'s registrations' 
      });
    }

    const result = await pool.query(
      `SELECT r.*, u.name as user_name, u.email as user_email
       FROM blood_donation_registrations r
       JOIN users u ON r.user_id = u.id
       WHERE r.campaign_id = $1
       ORDER BY r.registration_date DESC`,
      [campaignId]
    );

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error('Get campaign registrations error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  }
};

// ==================== RECORD BLOOD DONATION ====================
// src/controllers/donationCampaignController.js - Fix recordDonation

// ==================== RECORD BLOOD DONATION ====================
// src/controllers/donationCampaignController.js - Fix recordDonation

// ==================== RECORD BLOOD DONATION ====================
exports.recordDonation = async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const userId = req.user.id;
    const { 
      registration_id,
      blood_group,
      units_donated,
      donation_date,
      donation_time,
      collected_by,
      hemoglobin_level,
      blood_pressure,
      pulse_rate,
      temperature,
      notes
    } = req.body;

    const units = Number(units_donated);
    if (!VALID_BLOOD_GROUPS.has(blood_group) || !Number.isFinite(units) || units <= 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'Provide a valid blood group and a donation quantity greater than zero' });
    }

    console.log('📝 Recording donation:', { registration_id, blood_group, units_donated });

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
    console.log('🏥 Hospital ID:', hospitalId);

    // Get registration details
    const registrationResult = await client.query(
      `SELECT r.*, c.id AS campaign_id, c.hospital_id as campaign_hospital_id
       FROM blood_donation_registrations r
       JOIN blood_donation_campaigns c ON r.campaign_id = c.id
       WHERE r.id = $1 FOR UPDATE`,
      [registration_id]
    );

    if (registrationResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ 
        success: false, 
        message: 'Registration not found' 
      });
    }

    const registration = registrationResult.rows[0];
    const campaignId = registration.campaign_id;

    if (req.params.campaignId && Number(req.params.campaignId) !== Number(campaignId)) {
      await client.query('ROLLBACK');
      return res.status(403).json({ success: false, message: 'Registration does not belong to this campaign' });
    }

    // Verify hospital matches
    if (registration.campaign_hospital_id !== hospitalId) {
      await client.query('ROLLBACK');
      return res.status(403).json({ 
        success: false, 
        message: 'Unauthorized to record donation for this campaign' 
      });
    }

    const existingDonation = await client.query(
      'SELECT id FROM blood_donation_records WHERE registration_id = $1 FOR UPDATE',
      [registration_id]
    );
    if (existingDonation.rows.length > 0 || registration.donation_status === 'DONATED' || registration.status === 'donated') {
      await client.query('ROLLBACK');
      return res.status(409).json({ success: false, message: 'Donation has already been recorded for this registration' });
    }

    // Generate batch number
    const batchNumber = `DON${Date.now().toString().slice(-6)}${blood_group}`;
    const donationDateObj = donation_date ? new Date(donation_date) : new Date();
    const expiryDate = new Date(donationDateObj);
    expiryDate.setDate(expiryDate.getDate() + 42); // Blood expires in 42 days

    console.log('🩸 Donation details:', { batchNumber, expiryDate, blood_group, units_donated });

    // Insert donation record
    const recordResult = await client.query(
      `INSERT INTO blood_donation_records (
        registration_id, hospital_id, campaign_id,
        donor_name, donor_phone, blood_group, units_donated,
        donation_date, donation_time, batch_number, expiry_date,
        collected_by, hemoglobin_level, blood_pressure, pulse_rate, temperature, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      RETURNING *`,
      [
        registration_id, hospitalId, campaignId,
        registration.donor_name, registration.donor_phone, blood_group, units,
        donationDateObj, donation_time || '00:00:00', batchNumber, expiryDate,
        collected_by, hemoglobin_level, blood_pressure, pulse_rate, temperature, notes
      ]
    );

    console.log('✅ Donation record created:', recordResult.rows[0]);

    // Update registration status
    await client.query(
      `UPDATE blood_donation_registrations 
       SET status = 'donated', donation_status = 'DONATED', attendance_status = 'ATTENDED',
           donation_time = CURRENT_TIMESTAMP, units_donated = $1,
           check_in_time = COALESCE(check_in_time, CURRENT_TIMESTAMP), actual_donation_id = $2
       WHERE id = $3`,
      [units, recordResult.rows[0].id, registration_id]
    );

    // Update campaign total blood collected
    await client.query(
      `UPDATE blood_donation_campaigns 
       SET total_blood_collected = total_blood_collected + $1
       WHERE id = $2`,
      [units, campaignId]
    );

    // ========== ADD BLOOD TO HOSPITAL BLOOD BANK ==========
    console.log('🔄 Updating blood bank for hospital:', hospitalId);
    
    // Check if blood group exists in blood bank
    const bloodCheck = await client.query(
      `SELECT id, units_available FROM blood_bank 
       WHERE hospital_id = $1 AND blood_group = $2`,
      [hospitalId, blood_group]
    );

    let bloodResult;
    if (bloodCheck.rows.length > 0) {
      // Update existing blood group - ADD units
      bloodResult = await client.query(
        `UPDATE blood_bank 
         SET units_available = COALESCE(units_available, 0) + $1,
             expiry_date = COALESCE($2, expiry_date),
             last_updated = CURRENT_TIMESTAMP
         WHERE hospital_id = $3 AND blood_group = $4
         RETURNING *`,
        [units, expiryDate, hospitalId, blood_group]
      );
      console.log(`✅ Updated blood bank: ${blood_group} added ${units} units`);
    } else {
      // Insert new blood group
      bloodResult = await client.query(
        `INSERT INTO blood_bank (
          hospital_id, blood_group, units_available, 
          expiry_date, batch_number, donation_date, donor_name,
          last_updated, minimum_threshold
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP, 10)
        RETURNING *`,
        [hospitalId, blood_group, units, expiryDate, batchNumber, donationDateObj, registration.donor_name]
      );
      console.log(`✅ Added new blood group: ${blood_group} with ${units} units`);
    }

    // Also add to donation history for tracking
    await client.query(
      `INSERT INTO blood_donation_history (
        hospital_id, donor_name, donor_phone, blood_group, 
        units_donated, donation_date, expiry_date, batch_number, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active')`,
      [hospitalId, registration.donor_name, registration.donor_phone, 
       blood_group, units, donationDateObj, expiryDate, batchNumber]
    );

    await client.query(
      `INSERT INTO blood_inventory_transactions
        (hospital_id, blood_bank_id, blood_group, transaction_type, units, reference_type, reference_id, donor_id, campaign_id, donation_id, created_by)
       VALUES ($1, $2, $3, 'DONATION', $4, 'DONATION_CAMP', $5, $6, $7, $5, $8)`,
      [hospitalId, bloodResult.rows[0].id, blood_group, units, recordResult.rows[0].id, registration.user_id, campaignId, userId]
    );

    await client.query('COMMIT');

    // Fetch updated blood bank to return
    const updatedBloodBank = await client.query(
      `SELECT * FROM blood_bank WHERE hospital_id = $1 ORDER BY blood_group`,
      [hospitalId]
    );

    res.status(201).json({
      success: true,
      message: `Blood donation recorded successfully. ${units} unit(s) of ${blood_group} added to blood bank.`,
      data: {
        donation: recordResult.rows[0],
        blood_bank: bloodResult.rows[0],
        all_blood_bank: updatedBloodBank.rows,
        batch_number: batchNumber,
        expiry_date: expiryDate,
      },
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Record donation error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  } finally {
    client.release();
  }
};
// ==================== GET CAMPAIGN DONATION RECORDS ====================
exports.getCampaignDonationRecords = async (req, res) => {
  try {
    const { campaignId } = req.params;
    const userId = req.user.id;

    // Verify hospital owns this campaign
    const checkResult = await pool.query(
      `SELECT c.id FROM blood_donation_campaigns c
       JOIN hospitals h ON c.hospital_id = h.id
       WHERE c.id = $1 AND h.user_id = $2`,
      [campaignId, userId]
    );

    if (checkResult.rows.length === 0) {
      return res.status(403).json({ 
        success: false, 
        message: 'Unauthorized to view this campaign\'s donations' 
      });
    }

    const result = await pool.query(
      `SELECT r.*, reg.donor_name, reg.donor_phone
       FROM blood_donation_records r
       JOIN blood_donation_registrations reg ON r.registration_id = reg.id
       WHERE r.campaign_id = $1
       ORDER BY r.donation_date DESC, r.donation_time DESC`,
      [campaignId]
    );

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error('Get campaign donation records error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  }
};

// ==================== UPDATE CAMPAIGN STATUS ====================
exports.updateCampaignStatus = async (req, res) => {
  try {
    const { campaignId } = req.params;
    const { status } = req.body;
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
      `UPDATE blood_donation_campaigns 
       SET status = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND hospital_id = $3
       RETURNING *`,
      [status, campaignId, hospitalId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Campaign not found' 
      });
    }

    res.json({
      success: true,
      message: `Campaign status updated to ${status}`,
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Update campaign status error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  }
};

// ==================== ADMIN: APPROVE CAMPAIGN ====================
exports.approveCampaign = async (req, res) => {
  try {
    const { campaignId } = req.params;

    const result = await pool.query(
      `UPDATE blood_donation_campaigns 
       SET status = 'approved', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [campaignId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Campaign not found' 
      });
    }

    res.json({
      success: true,
      message: 'Campaign approved successfully',
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Approve campaign error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  }
};

// ==================== ADMIN: REJECT CAMPAIGN ====================
exports.rejectCampaign = async (req, res) => {
  try {
    const { campaignId } = req.params;
    const { reason } = req.body;

    const result = await pool.query(
      `UPDATE blood_donation_campaigns 
       SET status = 'rejected', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [campaignId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Campaign not found' 
      });
    }

    res.json({
      success: true,
      message: 'Campaign rejected',
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Reject campaign error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  }
};
