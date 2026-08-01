// src/controllers/donationCampaignController.js
const { pool } = require('../config/database');

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
    const campaignResult = await pool.query(
      'SELECT id, status FROM blood_donation_campaigns WHERE id = $1',
      [campaign_id]
    );

    if (campaignResult.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Campaign not found' 
      });
    }

    if (campaignResult.rows[0].status !== 'approved' && campaignResult.rows[0].status !== 'active') {
      return res.status(400).json({ 
        success: false, 
        message: 'This campaign is not accepting registrations' 
      });
    }

    // Get patient id
    const patientResult = await pool.query(
      'SELECT id FROM patients WHERE user_id = $1',
      [userId]
    );

    let patientId = null;
    if (patientResult.rows.length > 0) {
      patientId = patientResult.rows[0].id;
    }

    // Check if already registered
    const checkResult = await pool.query(
      'SELECT id, status FROM blood_donation_registrations WHERE campaign_id = $1 AND user_id = $2',
      [campaign_id, userId]
    );

    if (checkResult.rows.length > 0) {
      const existingStatus = checkResult.rows[0].status;
      if (existingStatus === 'registered' || existingStatus === 'checked_in' || existingStatus === 'donated') {
        return res.status(400).json({
          success: false,
          message: `You are already ${existingStatus} for this campaign`
        });
      }
    }

    const result = await pool.query(
      `INSERT INTO blood_donation_registrations (
        campaign_id, user_id, patient_id, donor_name, donor_phone, donor_email,
        blood_group, age, weight, last_donation_date, medical_conditions, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'registered')
      RETURNING *`,
      [
        campaign_id, userId, patientId, donor_name, donor_phone, donor_email,
        blood_group, age, weight, last_donation_date, medical_conditions
      ]
    );

    // Update registered donors count
    await pool.query(
      `UPDATE blood_donation_campaigns 
       SET registered_donors = registered_donors + 1 
       WHERE id = $1`,
      [campaign_id]
    );

    res.status(201).json({
      success: true,
      message: 'Successfully registered for blood donation camp',
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Register for campaign error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  }
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
// In donationCampaignController.js
exports.recordDonation = async (req, res) => {
  try {
    const { registration_id, blood_group, units_donated } = req.body;
    const hospitalId = req.user?.hospital_id || req.body.hospital_id;

    console.log('📝 Recording donation:', { registration_id, blood_group, units_donated });
    console.log('🏥 Hospital ID:', hospitalId);

    // Validate input
    if (!registration_id && !hospitalId) {
      return res.status(400).json({
        success: false,
        message: 'Registration ID or Hospital ID is required'
      });
    }

    let campaignId, campaignHospitalId, campaignStatus;

    // If registration_id is provided, get campaign info from registration
    if (registration_id) {
      // FIXED: Use proper column reference
      const registrationResult = await pool.query(
        `SELECT r.campaign_id, r.hospital_id, r.status 
         FROM campaign_registrations r 
         WHERE r.id = $1`,
        [registration_id]
      );

      if (registrationResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Registration not found'
        });
      }

      const registration = registrationResult.rows[0];
      campaignId = registration.campaign_id;
      campaignHospitalId = registration.hospital_id;
      campaignStatus = registration.status;
    } else {
      // Use the provided campaign_id from request body
      campaignId = req.body.campaign_id;
      campaignHospitalId = hospitalId;
      campaignStatus = 'active';
    }

    // Check if campaign is active
    const campaignCheck = await pool.query(
      'SELECT status FROM campaigns WHERE id = $1',
      [campaignId]
    );

    if (campaignCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Campaign not found'
      });
    }

    if (campaignCheck.rows[0].status !== 'active') {
      return res.status(400).json({
        success: false,
        message: 'Campaign is not active'
      });
    }

    // Insert donation record
    const result = await pool.query(
      `INSERT INTO donations (
        campaign_id, hospital_id, donor_name, donor_phone, donor_email,
        blood_group, units_donated, donation_date, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), 'completed')
      RETURNING *`,
      [
        campaignId,
        campaignHospitalId || hospitalId,
        req.body.donor_name || 'Unknown',
        req.body.donor_phone || null,
        req.body.donor_email || null,
        blood_group,
        units_donated || 1
      ]
    );

    const donation = result.rows[0];

    // Update blood bank
    await updateBloodBank(campaignHospitalId || hospitalId, blood_group, units_donated || 1);

    // Update campaign donor count
    await pool.query(
      `UPDATE campaigns 
       SET registered_donors = registered_donors + 1 
       WHERE id = $1`,
      [campaignId]
    );

    // Update registration status if registration_id was provided
    if (registration_id) {
      await pool.query(
        `UPDATE campaign_registrations 
         SET status = 'donated' 
         WHERE id = $1`,
        [registration_id]
      );
    }

    console.log('✅ Donation recorded successfully');

    res.status(201).json({
      success: true,
      message: 'Donation recorded successfully',
      data: donation
    });

  } catch (error) {
    console.error('❌ Record donation error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// Helper function to update blood bank
async function updateBloodBank(hospitalId, bloodGroup, units) {
  try {
    // Check if blood group exists
    const checkResult = await pool.query(
      'SELECT id, units_available FROM blood_bank WHERE hospital_id = $1 AND blood_group = $2',
      [hospitalId, bloodGroup]
    );

    if (checkResult.rows.length > 0) {
      // Update existing
      const current = checkResult.rows[0];
      await pool.query(
        'UPDATE blood_bank SET units_available = $1, updated_at = NOW() WHERE id = $2',
        [current.units_available + units, current.id]
      );
      console.log(`✅ Blood bank updated: ${bloodGroup} +${units} units`);
    } else {
      // Insert new
      await pool.query(
        'INSERT INTO blood_bank (hospital_id, blood_group, units_available, minimum_threshold) VALUES ($1, $2, $3, $4)',
        [hospitalId, bloodGroup, units, 10]
      );
      console.log(`✅ New blood group added: ${bloodGroup} (${units} units)`);
    }
  } catch (error) {
    console.error('❌ Error updating blood bank:', error);
  }
}
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