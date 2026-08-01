// src/controllers/campaignController.js
const { pool } = require('../config/database');

// ==================== CREATE CAMPAIGN ====================
exports.createCampaign = async (req, res) => {
    try {
        const userId = req.user.id;
        const {
            title,
            description,
            location,
            city,
            start_date,
            end_date,
            contact_person,
            contact_phone
        } = req.body;

        console.log('Creating campaign:', { title, location, city, start_date });

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
            `INSERT INTO campaigns (
                hospital_id, title, description, location, city,
                start_date, end_date, contact_person, contact_number, status,
                created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            RETURNING *`,
            [hospitalId, title, description, location || '', city || '', start_date, end_date, contact_person || '', contact_phone || '']
        );

        res.status(201).json({
            success: true,
            message: 'Campaign created successfully',
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

// ==================== GET HOSPITAL CAMPAIGNS ====================
exports.getHospitalCampaigns = async (req, res) => {
    try {
        const userId = req.user.id;

        console.log('Getting campaigns for user:', userId);

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
            `SELECT c.*,
                (SELECT COUNT(*) FROM donation_registrations WHERE campaign_id = c.id AND status = 'completed') as registered_donors,
                (SELECT COALESCE(SUM(units_donated), 0) FROM donation_registrations WHERE campaign_id = c.id AND status = 'completed') as total_units
            FROM campaigns c
            WHERE c.hospital_id = $1
            ORDER BY c.created_at DESC`,
            [hospitalId]
        );

        console.log(`Found ${result.rows.length} campaigns`);

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

// ==================== GET CAMPAIGN DETAILS WITH DONORS ====================
exports.getCampaignDetails = async (req, res) => {
    try {
        const { campaignId } = req.params;
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

        // Check if campaign exists
        const campaignCheck = await pool.query(
            'SELECT * FROM campaigns WHERE id = $1 AND hospital_id = $2',
            [campaignId, hospitalId]
        );

        if (campaignCheck.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Campaign not found'
            });
        }

        // Get campaign details with donor count
        const campaignResult = await pool.query(
            `SELECT c.*,
                (SELECT COUNT(*) FROM donation_registrations WHERE campaign_id = c.id AND status = 'completed') as registered_donors,
                (SELECT COALESCE(SUM(units_donated), 0) FROM donation_registrations WHERE campaign_id = c.id AND status = 'completed') as total_units
            FROM campaigns c
            WHERE c.id = $1`,
            [campaignId]
        );

        // Get registered donors with their details
        const donorsResult = await pool.query(
            `SELECT dr.*,
                COALESCE(u.name, dr.donor_name) as donor_name,
                COALESCE(u.email, dr.donor_email) as donor_email,
                dr.donation_date,
                db.batch_number,
                db.expiry_date,
                db.status as batch_status
            FROM donation_registrations dr
            LEFT JOIN users u ON dr.user_id = u.id
            LEFT JOIN donation_batches db ON dr.id = db.registration_id
            WHERE dr.campaign_id = $1 AND dr.status = 'completed'
            ORDER BY dr.donation_date DESC`,
            [campaignId]
        );

        // Get blood bank summary for this campaign
        const bloodSummary = await pool.query(
            `SELECT blood_group, SUM(units_donated) as total_units, COUNT(*) as donor_count
            FROM donation_registrations
            WHERE campaign_id = $1 AND status = 'completed' AND blood_group IS NOT NULL
            GROUP BY blood_group
            ORDER BY blood_group`,
            [campaignId]
        );

        res.json({
            success: true,
            data: {
                campaign: campaignResult.rows[0],
                donors: donorsResult.rows,
                blood_summary: bloodSummary.rows,
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

// ==================== REGISTER DONOR (Connected to Blood Bank) ====================
exports.registerDonor = async (req, res) => {
    try {
        const userId = req.user.id;
        const {
            campaign_id,
            donor_name,
            donor_phone,
            donor_email,
            blood_group,
            units_donated,
            notes,
            is_registered_user,
            user_id: registeredUserId
        } = req.body;

        console.log('Registering donor:', { donor_name, blood_group, units_donated });

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

        // Check if campaign exists and is active
        const campaignCheck = await pool.query(
            'SELECT id, status FROM campaigns WHERE id = $1 AND hospital_id = $2',
            [campaign_id, hospitalId]
        );

        if (campaignCheck.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Campaign not found or unauthorized'
            });
        }

        const client = await pool.connect();

        try {
            await client.query('BEGIN');

            // Insert donation registration
            const result = await client.query(
                `INSERT INTO donation_registrations (
                    campaign_id, hospital_id, donor_name, donor_phone, donor_email,
                    blood_group, units_donated, donation_date, is_registered_user,
                    user_id, notes, status
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP, $8, $9, $10, 'completed')
                RETURNING *`,
                [
                    campaign_id,
                    hospitalId,
                    donor_name,
                    donor_phone || '',
                    donor_email || '',
                    blood_group || '',
                    units_donated || 1,
                    is_registered_user || false,
                    registeredUserId || null,
                    notes || ''
                ]
            );

            const registration = result.rows[0];

            // Generate batch number
            const batchNumber = `DON${Date.now().toString().slice(-6)}${blood_group}`;
            const expiryDate = new Date(Date.now() + 42 * 24 * 60 * 60 * 1000); // 42 days

            // Add to donation batches
            await client.query(
                `INSERT INTO donation_batches (
                    registration_id, batch_number, blood_group, units,
                    expiry_date, hospital_id, status
                ) VALUES ($1, $2, $3, $4, $5, $6, 'available')`,
                [
                    registration.id,
                    batchNumber,
                    blood_group,
                    units_donated || 1,
                    expiryDate,
                    hospitalId
                ]
            );

            // UPDATE BLOOD BANK - Add units to blood bank
            const checkStock = await client.query(
                'SELECT id, units_available FROM blood_bank WHERE hospital_id = $1 AND blood_group = $2',
                [hospitalId, blood_group]
            );

            if (checkStock.rows.length > 0) {
                // Update existing stock
                await client.query(
                    `UPDATE blood_bank 
                     SET units_available = units_available + $1, 
                         last_updated = CURRENT_TIMESTAMP
                     WHERE hospital_id = $2 AND blood_group = $3`,
                    [units_donated || 1, hospitalId, blood_group]
                );
                console.log(`✅ Updated blood stock: ${blood_group} +${units_donated} units`);
            } else {
                // Insert new stock
                await client.query(
                    `INSERT INTO blood_bank (
                        hospital_id, blood_group, units_available, 
                        last_updated, minimum_threshold
                    ) VALUES ($1, $2, $3, CURRENT_TIMESTAMP, 10)`,
                    [hospitalId, blood_group, units_donated || 1]
                );
                console.log(`✅ Inserted new blood stock: ${blood_group} ${units_donated} units`);
            }

            // Update campaign total units
            await client.query(
                `UPDATE campaigns 
                 SET updated_at = CURRENT_TIMESTAMP
                 WHERE id = $1`,
                [campaign_id]
            );

            await client.query('COMMIT');

            // Get updated blood bank summary
            const bloodBankSummary = await client.query(
                `SELECT blood_group, units_available 
                FROM blood_bank 
                WHERE hospital_id = $1 
                ORDER BY blood_group`,
                [hospitalId]
            );

            res.status(201).json({
                success: true,
                message: 'Donor registered successfully! Blood added to blood bank.',
                data: {
                    registration: registration,
                    batch_number: batchNumber,
                    blood_bank_updated: bloodBankSummary.rows,
                },
            });

        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Register donor error:', error);
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

        console.log('Updating campaign status:', { campaignId, status });

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
            `UPDATE campaigns 
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
            message: `Campaign ${status} successfully`,
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

// ==================== GET CAMPAIGN DONORS ====================
exports.getCampaignDonors = async (req, res) => {
    try {
        const { campaignId } = req.params;
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

        // Verify campaign belongs to hospital
        const campaignCheck = await pool.query(
            'SELECT id FROM campaigns WHERE id = $1 AND hospital_id = $2',
            [campaignId, hospitalId]
        );

        if (campaignCheck.rows.length === 0) {
            return res.status(403).json({
                success: false,
                message: 'Unauthorized to view this campaign\'s donors'
            });
        }

        const result = await pool.query(
            `SELECT dr.*,
                COALESCE(u.name, dr.donor_name) as donor_name,
                COALESCE(u.email, dr.donor_email) as donor_email,
                db.batch_number,
                db.expiry_date
            FROM donation_registrations dr
            LEFT JOIN users u ON dr.user_id = u.id
            LEFT JOIN donation_batches db ON dr.id = db.registration_id
            WHERE dr.campaign_id = $1 AND dr.status = 'completed'
            ORDER BY dr.donation_date DESC`,
            [campaignId]
        );

        res.json({
            success: true,
            data: result.rows,
        });
    } catch (error) {
        console.error('Get campaign donors error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error',
            error: error.message
        });
    }
};

// ==================== ADMIN STATS ====================
exports.getAdminCampaignStats = async (req, res) => {
    try {
        const stats = await pool.query(`
            SELECT 
                (SELECT COUNT(*) FROM campaigns) as total_campaigns,
                (SELECT COUNT(*) FROM campaigns WHERE status = 'active') as active_campaigns,
                (SELECT COUNT(*) FROM campaigns WHERE status = 'completed') as completed_campaigns,
                (SELECT COALESCE(SUM(units_donated), 0) FROM donation_registrations WHERE status = 'completed') as total_blood_collected,
                (SELECT COUNT(DISTINCT donor_name) FROM donation_registrations WHERE status = 'completed') as unique_donors
        `);

        const byBloodGroup = await pool.query(`
            SELECT blood_group, 
                COUNT(*) as donor_count, 
                SUM(units_donated) as total_units
            FROM donation_registrations
            WHERE status = 'completed' AND blood_group IS NOT NULL
            GROUP BY blood_group
            ORDER BY blood_group
        `);

        const monthlyStats = await pool.query(`
            SELECT 
                DATE_TRUNC('month', donation_date) as month,
                COUNT(*) as donations,
                SUM(units_donated) as total_units
            FROM donation_registrations
            WHERE status = 'completed'
            GROUP BY DATE_TRUNC('month', donation_date)
            ORDER BY month DESC
            LIMIT 12
        `);

        res.json({
            success: true,
            data: {
                stats: stats.rows[0],
                by_blood_group: byBloodGroup.rows,
                monthly_stats: monthlyStats.rows,
            },
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