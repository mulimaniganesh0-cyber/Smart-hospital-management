// src/controllers/appointmentController.js
const db = require('../config/database');

// Get all appointments for a hospital
exports.getHospitalAppointments = async (req, res) => {
    try {
        const hospitalId = req.params.hospitalId || req.user.hospitalId;
        
        const result = await db.query(`
            SELECT 
                a.*,
                u.name as patient_name,
                u.email as patient_email,
                u.phone as patient_phone,
                d.name as doctor_name,
                d.specialty as doctor_specialty
            FROM appointments a
            LEFT JOIN users u ON a.patient_id = u.id
            LEFT JOIN doctors d ON a.doctor_id = d.id
            WHERE a.hospital_id = $1
            ORDER BY a.appointment_date DESC, a.appointment_time DESC
        `, [hospitalId]);
        
        res.json({
            success: true,
            data: result.rows
        });
    } catch (error) {
        console.error('Get hospital appointments error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error',
            error: error.message
        });
    }
};

// Get appointments for a patient
exports.getPatientAppointments = async (req, res) => {
    try {
        const patientId = req.params.patientId || req.user.id;
        
        const result = await db.query(`
            SELECT 
                a.*,
                h.name as hospital_name,
                h.address as hospital_address,
                d.name as doctor_name,
                d.specialty as doctor_specialty
            FROM appointments a
            LEFT JOIN hospitals h ON a.hospital_id = h.id
            LEFT JOIN doctors d ON a.doctor_id = d.id
            WHERE a.patient_id = $1
            ORDER BY a.appointment_date DESC, a.appointment_time DESC
        `, [patientId]);
        
        res.json({
            success: true,
            data: result.rows
        });
    } catch (error) {
        console.error('Get patient appointments error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error',
            error: error.message
        });
    }
};

// Get appointment by ID
exports.getAppointmentById = async (req, res) => {
    try {
        const { id } = req.params;
        
        const result = await db.query(`
            SELECT 
                a.*,
                u.name as patient_name,
                u.email as patient_email,
                u.phone as patient_phone,
                h.name as hospital_name,
                h.address as hospital_address,
                d.name as doctor_name,
                d.specialty as doctor_specialty
            FROM appointments a
            LEFT JOIN users u ON a.patient_id = u.id
            LEFT JOIN hospitals h ON a.hospital_id = h.id
            LEFT JOIN doctors d ON a.doctor_id = d.id
            WHERE a.id = $1
        `, [id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Appointment not found'
            });
        }
        
        res.json({
            success: true,
            data: result.rows[0]
        });
    } catch (error) {
        console.error('Get appointment by ID error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error',
            error: error.message
        });
    }
};

// Create new appointment
exports.createAppointment = async (req, res) => {
    try {
        const {
            patient_id,
            hospital_id,
            doctor_id,
            appointment_date,
            appointment_time,
            reason,
            appointment_type = 'general',
            priority = 'normal'
        } = req.body;
        
        // Validate required fields
        if (!patient_id || !hospital_id || !appointment_date || !appointment_time) {
            return res.status(400).json({
                success: false,
                message: 'Patient ID, Hospital ID, date, and time are required'
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
        
        // Check if patient exists
        const patientCheck = await db.query(
            'SELECT id, name FROM users WHERE id = $1 AND user_type = \'patient\'',
            [patient_id]
        );
        if (patientCheck.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Patient not found'
            });
        }
        
        // Create appointment
        const result = await db.query(`
            INSERT INTO appointments (
                patient_id,
                hospital_id,
                doctor_id,
                appointment_date,
                appointment_time,
                reason,
                appointment_type,
                priority,
                status,
                created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', NOW())
            RETURNING *
        `, [patient_id, hospital_id, doctor_id || null, appointment_date, appointment_time, reason || null, appointment_type, priority]);
        
        res.status(201).json({
            success: true,
            data: result.rows[0],
            message: 'Appointment created successfully'
        });
    } catch (error) {
        console.error('Create appointment error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error',
            error: error.message
        });
    }
};

// Update appointment
exports.updateAppointment = async (req, res) => {
    try {
        const { id } = req.params;
        const {
            appointment_date,
            appointment_time,
            doctor_id,
            reason,
            status,
            priority
        } = req.body;
        
        // Check if appointment exists
        const appointmentCheck = await db.query(
            'SELECT * FROM appointments WHERE id = $1',
            [id]
        );
        if (appointmentCheck.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Appointment not found'
            });
        }
        
        // Update appointment
        const result = await db.query(`
            UPDATE appointments 
            SET 
                appointment_date = COALESCE($1, appointment_date),
                appointment_time = COALESCE($2, appointment_time),
                doctor_id = COALESCE($3, doctor_id),
                reason = COALESCE($4, reason),
                status = COALESCE($5, status),
                priority = COALESCE($6, priority),
                updated_at = NOW()
            WHERE id = $7
            RETURNING *
        `, [appointment_date, appointment_time, doctor_id, reason, status, priority, id]);
        
        res.json({
            success: true,
            data: result.rows[0],
            message: 'Appointment updated successfully'
        });
    } catch (error) {
        console.error('Update appointment error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error',
            error: error.message
        });
    }
};

// Cancel appointment
exports.cancelAppointment = async (req, res) => {
    try {
        const { id } = req.params;
        
        const result = await db.query(
            'UPDATE appointments SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
            ['cancelled', id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Appointment not found'
            });
        }
        
        res.json({
            success: true,
            data: result.rows[0],
            message: 'Appointment cancelled successfully'
        });
    } catch (error) {
        console.error('Cancel appointment error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error',
            error: error.message
        });
    }
};

// Confirm appointment
exports.confirmAppointment = async (req, res) => {
    try {
        const { id } = req.params;
        
        const result = await db.query(
            'UPDATE appointments SET status = $1, confirmed_at = NOW(), updated_at = NOW() WHERE id = $2 RETURNING *',
            ['confirmed', id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Appointment not found'
            });
        }
        
        res.json({
            success: true,
            data: result.rows[0],
            message: 'Appointment confirmed successfully'
        });
    } catch (error) {
        console.error('Confirm appointment error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error',
            error: error.message
        });
    }
};

// Complete appointment
exports.completeAppointment = async (req, res) => {
    try {
        const { id } = req.params;
        const { notes, prescription } = req.body;
        
        const result = await db.query(`
            UPDATE appointments 
            SET 
                status = 'completed',
                notes = COALESCE($1, notes),
                prescription = COALESCE($2, prescription),
                completed_at = NOW(),
                updated_at = NOW()
            WHERE id = $3
            RETURNING *
        `, [notes, prescription, id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Appointment not found'
            });
        }
        
        res.json({
            success: true,
            data: result.rows[0],
            message: 'Appointment completed successfully'
        });
    } catch (error) {
        console.error('Complete appointment error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error',
            error: error.message
        });
    }
};

// Get appointment statistics
exports.getAppointmentStats = async (req, res) => {
    try {
        const { hospitalId } = req.params;
        
        const result = await db.query(`
            SELECT 
                COUNT(*) as total_appointments,
                SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
                SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) as confirmed,
                SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
                SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled,
                SUM(CASE WHEN priority = 'emergency' THEN 1 ELSE 0 END) as emergency,
                SUM(CASE WHEN priority = 'high' THEN 1 ELSE 0 END) as high_priority,
                SUM(CASE WHEN priority = 'normal' THEN 1 ELSE 0 END) as normal_priority
            FROM appointments
            WHERE hospital_id = $1
        `, [hospitalId]);
        
        res.json({
            success: true,
            data: result.rows[0]
        });
    } catch (error) {
        console.error('Get appointment stats error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error',
            error: error.message
        });
    }
};

// Get today's appointments
exports.getTodayAppointments = async (req, res) => {
    try {
        const { hospitalId } = req.params;
        
        const result = await db.query(`
            SELECT 
                a.*,
                u.name as patient_name,
                u.email as patient_email,
                u.phone as patient_phone,
                d.name as doctor_name,
                d.specialty as doctor_specialty
            FROM appointments a
            LEFT JOIN users u ON a.patient_id = u.id
            LEFT JOIN doctors d ON a.doctor_id = d.id
            WHERE a.hospital_id = $1 
                AND a.appointment_date = CURRENT_DATE
                AND a.status NOT IN ('cancelled', 'completed')
            ORDER BY a.appointment_time ASC
        `, [hospitalId]);
        
        res.json({
            success: true,
            data: result.rows
        });
    } catch (error) {
        console.error('Get today appointments error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error',
            error: error.message
        });
    }
};

// Get appointments by date range
exports.getAppointmentsByDateRange = async (req, res) => {
    try {
        const { hospitalId } = req.params;
        const { startDate, endDate } = req.query;
        
        if (!startDate || !endDate) {
            return res.status(400).json({
                success: false,
                message: 'Start date and end date are required'
            });
        }
        
        const result = await db.query(`
            SELECT 
                a.*,
                u.name as patient_name,
                u.email as patient_email,
                u.phone as patient_phone,
                d.name as doctor_name,
                d.specialty as doctor_specialty
            FROM appointments a
            LEFT JOIN users u ON a.patient_id = u.id
            LEFT JOIN doctors d ON a.doctor_id = d.id
            WHERE a.hospital_id = $1 
                AND a.appointment_date BETWEEN $2 AND $3
                AND a.status NOT IN ('cancelled')
            ORDER BY a.appointment_date ASC, a.appointment_time ASC
        `, [hospitalId, startDate, endDate]);
        
        res.json({
            success: true,
            data: result.rows
        });
    } catch (error) {
        console.error('Get appointments by date range error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error',
            error: error.message
        });
    }
};

// Get available time slots for a doctor
exports.getAvailableSlots = async (req, res) => {
    try {
        const { doctorId, date } = req.query;
        
        if (!doctorId || !date) {
            return res.status(400).json({
                success: false,
                message: 'Doctor ID and date are required'
            });
        }
        
        // Get doctor's working hours
        const doctor = await db.query(
            'SELECT * FROM doctors WHERE id = $1',
            [doctorId]
        );
        
        if (doctor.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Doctor not found'
            });
        }
        
        // Get booked appointments for that day
        const booked = await db.query(
            `SELECT appointment_time 
             FROM appointments 
             WHERE doctor_id = $1 
                AND appointment_date = $2 
                AND status NOT IN ('cancelled', 'completed')`,
            [doctorId, date]
        );
        
        const bookedSlots = booked.rows.map(row => row.appointment_time);
        
        // Generate time slots (9 AM to 5 PM, 30 min intervals)
        const slots = [];
        const startHour = 9;
        const endHour = 17;
        
        for (let hour = startHour; hour < endHour; hour++) {
            for (let min = 0; min < 60; min += 30) {
                const time = `${hour.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;
                if (!bookedSlots.includes(time)) {
                    slots.push(time);
                }
            }
        }
        
        res.json({
            success: true,
            data: slots
        });
    } catch (error) {
        console.error('Get available slots error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error',
            error: error.message
        });
    }
};

module.exports = exports;