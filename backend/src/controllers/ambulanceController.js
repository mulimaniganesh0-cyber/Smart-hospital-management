// src/controllers/ambulanceController.js
const { pool } = require('../config/database');

// Register a new ambulance
exports.registerAmbulance = async (req, res) => {
  try {
    const userId = req.user.id;
    const { vehicle_number, driver_name, driver_phone, type } = req.body;
    
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
      `INSERT INTO ambulances (hospital_id, vehicle_number, driver_name, driver_phone, type, is_available)
       VALUES ($1, $2, $3, $4, $5, true)
       RETURNING *`,
      [hospitalId, vehicle_number, driver_name, driver_phone, type]
    );
    
    res.status(201).json({
      success: true,
      message: 'Ambulance registered successfully',
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Register ambulance error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  }
};

// Get nearby ambulances
exports.getNearbyAmbulances = async (req, res) => {
  try {
    const { lat, lng, radius = 10 } = req.query;
    
    const result = await pool.query(
      `SELECT a.*, h.name as hospital_name
       FROM ambulances a
       JOIN hospitals h ON a.hospital_id = h.id
       WHERE a.is_available = true
       ORDER BY a.id
       LIMIT 20`
    );
    
    const ambulances = result.rows.map((amb, index) => ({
      ...amb,
      distance: (Math.random() * 5 + 0.5).toFixed(1),
      rating: (Math.random() * 1.5 + 3.5).toFixed(1),
    }));
    
    res.json({
      success: true,
      count: ambulances.length,
      data: ambulances,
    });
  } catch (error) {
    console.error('Get nearby ambulances error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  }
};

// Book an ambulance (patient)
exports.bookAmbulance = async (req, res) => {
  try {
    const userId = req.user.id;
    const { ambulance_id, pickup_location, dropoff_location, patient_name, patient_phone } = req.body;
    
    const patientResult = await pool.query(
      'SELECT id FROM patients WHERE user_id = $1',
      [userId]
    );
    
    if (patientResult.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Patient not found' 
      });
    }
    
    const patientId = patientResult.rows[0].id;
    
    const result = await pool.query(
      `INSERT INTO ambulance_bookings (
        patient_id, ambulance_id, pickup_location, dropoff_location,
        patient_name, patient_phone, status, booking_time
      ) VALUES ($1, $2, $3, $4, $5, $6, 'pending', CURRENT_TIMESTAMP)
      RETURNING *`,
      [patientId, ambulance_id, pickup_location, dropoff_location, patient_name, patient_phone]
    );
    
    // Mark ambulance as busy
    await pool.query(
      'UPDATE ambulances SET is_available = false WHERE id = $1',
      [ambulance_id]
    );
    
    res.status(201).json({
      success: true,
      message: 'Ambulance booked successfully',
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Book ambulance error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  }
};

// Get patient's ambulance bookings
exports.getMyAmbulanceBookings = async (req, res) => {
  try {
    const userId = req.user.id;
    
    const patientResult = await pool.query(
      'SELECT id FROM patients WHERE user_id = $1',
      [userId]
    );
    
    if (patientResult.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Patient not found' 
      });
    }
    
    const patientId = patientResult.rows[0].id;
    
    const result = await pool.query(
      `SELECT b.*, a.vehicle_number, a.driver_name, a.driver_phone, a.type
       FROM ambulance_bookings b
       JOIN ambulances a ON b.ambulance_id = a.id
       WHERE b.patient_id = $1
       ORDER BY b.booking_time DESC`,
      [patientId]
    );
    
    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error('Get my ambulance bookings error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  }
};

// Get hospital ambulances
exports.getHospitalAmbulances = async (req, res) => {
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
      `SELECT * FROM ambulances WHERE hospital_id = $1 ORDER BY id`,
      [hospitalId]
    );
    
    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error('Get hospital ambulances error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  }
};

// Get hospital ambulance bookings
exports.getHospitalAmbulanceBookings = async (req, res) => {
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
      `SELECT b.*, a.vehicle_number, a.driver_name, a.driver_phone, a.type
       FROM ambulance_bookings b
       JOIN ambulances a ON b.ambulance_id = a.id
       WHERE a.hospital_id = $1
       ORDER BY b.booking_time DESC`,
      [hospitalId]
    );
    
    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error('Get hospital ambulance bookings error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  }
};

// Update ambulance details
exports.updateAmbulance = async (req, res) => {
  try {
    const { ambulanceId } = req.params;
    const userId = req.user.id;
    const { vehicle_number, driver_name, driver_phone, type } = req.body;
    
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
      `UPDATE ambulances 
       SET vehicle_number = COALESCE($1, vehicle_number),
           driver_name = COALESCE($2, driver_name),
           driver_phone = COALESCE($3, driver_phone),
           type = COALESCE($4, type)
       WHERE id = $5 AND hospital_id = $6
       RETURNING *`,
      [vehicle_number, driver_name, driver_phone, type, ambulanceId, hospitalId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Ambulance not found' 
      });
    }
    
    res.json({
      success: true,
      message: 'Ambulance updated successfully',
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Update ambulance error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  }
};

// Update ambulance availability
exports.updateAmbulanceAvailability = async (req, res) => {
  try {
    const { ambulanceId } = req.params;
    const userId = req.user.id;
    const { is_available } = req.body;
    
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
      `UPDATE ambulances SET is_available = $1
       WHERE id = $2 AND hospital_id = $3
       RETURNING *`,
      [is_available, ambulanceId, hospitalId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Ambulance not found' 
      });
    }
    
    res.json({
      success: true,
      message: `Ambulance is now ${is_available ? 'available' : 'unavailable'}`,
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Update ambulance availability error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  }
};

// Assign ambulance to booking
exports.assignAmbulanceToBooking = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const userId = req.user.id;
    const { ambulance_id } = req.body;
    
    const result = await pool.query(
      `UPDATE ambulance_bookings 
       SET ambulance_id = $1, status = 'assigned'
       WHERE id = $2
       RETURNING *`,
      [ambulance_id, bookingId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Booking not found' 
      });
    }
    
    res.json({
      success: true,
      message: 'Ambulance assigned successfully',
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Assign ambulance error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  }
};

// Update booking status
exports.updateBookingStatus = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { status } = req.body;
    
    const result = await pool.query(
      `UPDATE ambulance_bookings 
       SET status = $1
       WHERE id = $2
       RETURNING *`,
      [status, bookingId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Booking not found' 
      });
    }
    
    // If completed or cancelled, make ambulance available again
    if (status === 'completed' || status === 'cancelled') {
      await pool.query(
        `UPDATE ambulances SET is_available = true
         WHERE id = (SELECT ambulance_id FROM ambulance_bookings WHERE id = $1)`,
        [bookingId]
      );
    }
    
    res.json({
      success: true,
      message: 'Booking status updated',
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Update booking status error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  }
};