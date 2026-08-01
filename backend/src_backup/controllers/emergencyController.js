// src/controllers/emergencyController.js
const db = require('../config/database');

// Create emergency request
exports.createEmergency = async (req, res) => {
    try {
        const {
            patient_id,
            hospital_id,
            emergency_type,
            severity,
            description,
            latitude,
            longitude,
            patient_condition,
            ambulance_needed = true
        } = req.body;

        // Validate required fields
        if (!patient_id || !emergency_type || !severity) {
            return res.status(400).json({
                success: false,
                message: 'Patient ID, emergency type, and severity are required'
            });
        }

        // Check if patient exists
        const patientCheck = await db.query(
            'SELECT id, name, phone FROM users WHERE id = $1 AND user_type = $2',
            [patient_id, 'patient']
        );
        if (patientCheck.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Patient not found'
            });
        }

        // Create emergency record
        const result = await db.query(`
            INSERT INTO emergencies (
                patient_id,
                hospital_id,
                emergency_type,
                severity,
                description,
                latitude,
                longitude,
                patient_condition,
                ambulance_needed,
                status,
                created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending', NOW())
            RETURNING *
        `, [patient_id, hospital_id || null, emergency_type, severity, description || null, 
            latitude || null, longitude || null, patient_condition || null, ambulance_needed]);

        // If hospital is specified, notify them
        if (hospital_id) {
            // You can add socket.io notification here
            console.log(`🚨 Emergency created for hospital ${hospital_id}`);
        }

        res.status(201).json({
            success: true,
            data: result.rows[0],
            message: 'Emergency request created successfully'
        });
    } catch (error) {
        console.error('Create emergency error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error',
            error: error.message
        });
    }
};

// Get emergency by ID
exports.getEmergencyById = async (req, res) => {
    try {
        const { id } = req.params;

        const result = await db.query(`
            SELECT 
                e.*,
                u.name as patient_name,
                u.phone as patient_phone,
                u.email as patient_email,
                h.name as hospital_name,
                h.address as hospital_address,
                h.phone as hospital_phone
            FROM emergencies e
            LEFT JOIN users u ON e.patient_id = u.id
            LEFT JOIN hospitals h ON e.hospital_id = h.id
            WHERE e.id = $1
        `, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Emergency not found'
            });
        }

        res.json({
            success: true,
            data: result.rows[0]
        });
    } catch (error) {
        console.error('Get emergency by ID error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error',
            error: error.message
        });
    }
};

// Get emergencies for a hospital
exports.getHospitalEmergencies = async (req, res) => {
    try {
        const hospitalId = req.params.hospitalId || req.user.hospitalId;

        const result = await db.query(`
            SELECT 
                e.*,
                u.name as patient_name,
                u.phone as patient_phone,
                u.email as patient_email
            FROM emergencies e
            LEFT JOIN users u ON e.patient_id = u.id
            WHERE e.hospital_id = $1
            ORDER BY e.created_at DESC
        `, [hospitalId]);

        res.json({
            success: true,
            data: result.rows
        });
    } catch (error) {
        console.error('Get hospital emergencies error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error',
            error: error.message
        });
    }
};

// Get emergencies for a patient
exports.getPatientEmergencies = async (req, res) => {
    try {
        const patientId = req.params.patientId || req.user.id;

        const result = await db.query(`
            SELECT 
                e.*,
                h.name as hospital_name,
                h.address as hospital_address,
                h.phone as hospital_phone
            FROM emergencies e
            LEFT JOIN hospitals h ON e.hospital_id = h.id
            WHERE e.patient_id = $1
            ORDER BY e.created_at DESC
        `, [patientId]);

        res.json({
            success: true,
            data: result.rows
        });
    } catch (error) {
        console.error('Get patient emergencies error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error',
            error: error.message
        });
    }
};

// Update emergency status
exports.updateEmergencyStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, assigned_ambulance_id, notes } = req.body;

        // Validate status
        const validStatuses = ['pending', 'assigned', 'in_transit', 'arrived', 'completed', 'cancelled'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid status'
            });
        }

        const result = await db.query(`
            UPDATE emergencies 
            SET 
                status = $1,
                assigned_ambulance_id = COALESCE($2, assigned_ambulance_id),
                notes = COALESCE($3, notes),
                updated_at = NOW(),
                responded_at = CASE WHEN $1 IN ('assigned', 'in_transit') AND responded_at IS NULL THEN NOW() ELSE responded_at END,
                arrived_at = CASE WHEN $1 = 'arrived' AND arrived_at IS NULL THEN NOW() ELSE arrived_at END,
                completed_at = CASE WHEN $1 = 'completed' AND completed_at IS NULL THEN NOW() ELSE completed_at END
            WHERE id = $4
            RETURNING *
        `, [status, assigned_ambulance_id, notes, id]);

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Emergency not found'
            });
        }

        // Notify patient about status update
        const emergency = result.rows[0];
        // You can add notification logic here

        res.json({
            success: true,
            data: emergency,
            message: `Emergency status updated to ${status}`
        });
    } catch (error) {
        console.error('Update emergency status error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error',
            error: error.message
        });
    }
};

// Assign emergency to hospital
exports.assignEmergency = async (req, res) => {
    try {
        const { id } = req.params;
        const { hospital_id, assigned_ambulance_id, notes } = req.body;

        if (!hospital_id) {
            return res.status(400).json({
                success: false,
                message: 'Hospital ID is required'
            });
        }

        // Check if hospital exists
        const hospitalCheck = await db.query(
            'SELECT id, name FROM hospitals WHERE id = $1 AND is_verified = true',
            [hospital_id]
        );
        if (hospitalCheck.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Hospital not found or not verified'
            });
        }

        const result = await db.query(`
            UPDATE emergencies 
            SET 
                hospital_id = $1,
                assigned_ambulance_id = COALESCE($2, assigned_ambulance_id),
                status = 'assigned',
                notes = COALESCE($3, notes),
                responded_at = NOW(),
                updated_at = NOW()
            WHERE id = $4
            RETURNING *
        `, [hospital_id, assigned_ambulance_id, notes, id]);

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Emergency not found'
            });
        }

        res.json({
            success: true,
            data: result.rows[0],
            message: 'Emergency assigned to hospital successfully'
        });
    } catch (error) {
        console.error('Assign emergency error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error',
            error: error.message
        });
    }
};

// Get nearby emergencies (for ambulance/hospital staff)
exports.getNearbyEmergencies = async (req, res) => {
    try {
        const { latitude, longitude, radius = 10 } = req.query;

        if (!latitude || !longitude) {
            return res.status(400).json({
                success: false,
                message: 'Latitude and longitude are required'
            });
        }

        const result = await db.query(`
            SELECT 
                e.*,
                u.name as patient_name,
                u.phone as patient_phone,
                (6371 * acos(
                    cos(radians($1)) * cos(radians(e.latitude)) *
                    cos(radians(e.longitude) - radians($2)) +
                    sin(radians($1)) * sin(radians(e.latitude))
                )) AS distance
            FROM emergencies e
            LEFT JOIN users u ON e.patient_id = u.id
            WHERE e.status = 'pending'
                AND e.latitude IS NOT NULL 
                AND e.longitude IS NOT NULL
                AND (6371 * acos(
                    cos(radians($1)) * cos(radians(e.latitude)) *
                    cos(radians(e.longitude) - radians($2)) +
                    sin(radians($1)) * sin(radians(e.latitude))
                )) < $3
            ORDER BY distance, e.severity DESC
            LIMIT 20
        `, [latitude, longitude, radius]);

        res.json({
            success: true,
            data: result.rows
        });
    } catch (error) {
        console.error('Get nearby emergencies error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error',
            error: error.message
        });
    }
};

// Get emergency statistics
exports.getEmergencyStats = async (req, res) => {
    try {
        const { hospitalId } = req.params;

        let query = `
            SELECT 
                COUNT(*) as total_emergencies,
                SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
                SUM(CASE WHEN status = 'assigned' THEN 1 ELSE 0 END) as assigned,
                SUM(CASE WHEN status = 'in_transit' THEN 1 ELSE 0 END) as in_transit,
                SUM(CASE WHEN status = 'arrived' THEN 1 ELSE 0 END) as arrived,
                SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
                SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled,
                SUM(CASE WHEN severity = 'critical' THEN 1 ELSE 0 END) as critical,
                SUM(CASE WHEN severity = 'high' THEN 1 ELSE 0 END) as high,
                SUM(CASE WHEN severity = 'medium' THEN 1 ELSE 0 END) as medium,
                SUM(CASE WHEN severity = 'low' THEN 1 ELSE 0 END) as low,
                AVG(CASE 
                    WHEN responded_at IS NOT NULL AND created_at IS NOT NULL 
                    THEN EXTRACT(EPOCH FROM (responded_at - created_at)) 
                END) as avg_response_time
            FROM emergencies
        `;

        const params = [];
        if (hospitalId) {
            query += ' WHERE hospital_id = $1';
            params.push(hospitalId);
        }

        const result = await db.query(query, params);

        res.json({
            success: true,
            data: result.rows[0]
        });
    } catch (error) {
        console.error('Get emergency stats error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error',
            error: error.message
        });
    }
};

// Get active emergencies
exports.getActiveEmergencies = async (req, res) => {
    try {
        const { hospitalId } = req.params;

        let query = `
            SELECT 
                e.*,
                u.name as patient_name,
                u.phone as patient_phone,
                h.name as hospital_name
            FROM emergencies e
            LEFT JOIN users u ON e.patient_id = u.id
            LEFT JOIN hospitals h ON e.hospital_id = h.id
            WHERE e.status IN ('pending', 'assigned', 'in_transit', 'arrived')
        `;

        const params = [];
        if (hospitalId) {
            query += ' AND e.hospital_id = $1';
            params.push(hospitalId);
        }

        query += ' ORDER BY e.severity DESC, e.created_at ASC';

        const result = await db.query(query, params);

        res.json({
            success: true,
            data: result.rows
        });
    } catch (error) {
        console.error('Get active emergencies error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error',
            error: error.message
        });
    }
};

// Cancel emergency
exports.cancelEmergency = async (req, res) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;

        const result = await db.query(`
            UPDATE emergencies 
            SET 
                status = 'cancelled',
                cancellation_reason = $1,
                cancelled_at = NOW(),
                updated_at = NOW()
            WHERE id = $2
            RETURNING *
        `, [reason || 'Cancelled by user', id]);

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Emergency not found'
            });
        }

        res.json({
            success: true,
            data: result.rows[0],
            message: 'Emergency cancelled successfully'
        });
    } catch (error) {
        console.error('Cancel emergency error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error',
            error: error.message
        });
    }
};

// Create emergency contacts
exports.getEmergencyContacts = async (req, res) => {
    try {
        const contacts = [
            {
                id: 1,
                name: 'Emergency Services (108)',
                phone: '108',
                type: 'emergency',
                description: 'National Emergency Number'
            },
            {
                id: 2,
                name: 'Ambulance Services',
                phone: '102',
                type: 'ambulance',
                description: 'Ambulance Services'
            },
            {
                id: 3,
                name: 'Police',
                phone: '100',
                type: 'police',
                description: 'Police Emergency'
            },
            {
                id: 4,
                name: 'Fire Department',
                phone: '101',
                type: 'fire',
                description: 'Fire Emergency'
            },
            {
                id: 5,
                name: 'Poison Control',
                phone: '011-12345678',
                type: 'medical',
                description: 'Poison Control Center'
            }
        ];

        res.json({
            success: true,
            data: contacts
        });
    } catch (error) {
        console.error('Get emergency contacts error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error',
            error: error.message
        });
    }
};

module.exports = exports;