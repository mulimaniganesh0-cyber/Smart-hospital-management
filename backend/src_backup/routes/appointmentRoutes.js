// src/routes/appointmentRoutes.js
const express = require('express');
const router = express.Router();
const appointmentController = require('../controllers/appointmentController');
const { authenticateToken, isPatient, isHospital } = require('../middleware/auth');

// Public routes (no authentication required)
// (None for appointments - all require authentication)

// Protected routes (authentication required)
router.use(authenticateToken);

// Get appointment stats
router.get('/stats/:hospitalId', appointmentController.getAppointmentStats);

// Get today's appointments
router.get('/today/:hospitalId', appointmentController.getTodayAppointments);

// Get appointments by date range
router.get('/date-range/:hospitalId', appointmentController.getAppointmentsByDateRange);

// Get available time slots
router.get('/available-slots', appointmentController.getAvailableSlots);

// Hospital routes
router.get('/hospital/:hospitalId', isHospital, appointmentController.getHospitalAppointments);

// Patient routes
router.get('/patient/:patientId', isPatient, appointmentController.getPatientAppointments);

// Get appointment by ID
router.get('/:id', appointmentController.getAppointmentById);

// Create appointment
router.post('/', appointmentController.createAppointment);

// Update appointment
router.put('/:id', appointmentController.updateAppointment);

// Cancel appointment
router.patch('/:id/cancel', appointmentController.cancelAppointment);

// Confirm appointment
router.patch('/:id/confirm', appointmentController.confirmAppointment);

// Complete appointment
router.patch('/:id/complete', appointmentController.completeAppointment);

module.exports = router;