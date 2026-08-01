// src/controllers/reportController.js
const { pool } = require('../config/database');

// Generate Hospital Performance Report
exports.generateHospitalPerformanceReport = async (req, res) => {
  try {
    const userId = req.user.id;
    const { format = 'json' } = req.query;
    
    // Get all hospitals
    const hospitalsResult = await pool.query(`
      SELECT 
        h.id, h.name, h.address, h.city, h.phone, h.email,
        h.is_verified, h.verification_status, h.created_at,
        COALESCE(hr.general_beds_total, 0) as general_beds_total,
        COALESCE(hr.general_beds_available, 0) as general_beds_available,
        COALESCE(hr.icu_beds_total, 0) as icu_beds_total,
        COALESCE(hr.icu_beds_available, 0) as icu_beds_available,
        COALESCE(hr.ventilators_total, 0) as ventilators_total,
        COALESCE(hr.ventilators_available, 0) as ventilators_available,
        COALESCE(hr.oxygen_supported_beds_total, 0) as oxygen_beds_total,
        COALESCE(hr.oxygen_supported_beds_available, 0) as oxygen_beds_available,
        (SELECT COALESCE(SUM(units_available), 0) FROM blood_bank WHERE hospital_id = h.id) as blood_units,
        (SELECT COUNT(*) FROM doctors WHERE hospital_id = h.id) as total_doctors,
        (SELECT COUNT(*) FROM appointments WHERE hospital_id = h.id AND status = 'completed') as completed_appointments,
        (SELECT COUNT(*) FROM appointments WHERE hospital_id = h.id AND status = 'pending') as pending_appointments
      FROM hospitals h
      LEFT JOIN hospital_resources hr ON h.id = hr.hospital_id
      ORDER BY h.created_at DESC
    `);
    
    const hospitals = hospitalsResult.rows;
    
    // Get overall stats
    const statsResult = await pool.query(`
      SELECT 
        COUNT(*) as total_hospitals,
        SUM(CASE WHEN is_verified = true THEN 1 ELSE 0 END) as verified_hospitals,
        SUM(CASE WHEN verification_status = 'pending' THEN 1 ELSE 0 END) as pending_hospitals,
        COALESCE(SUM(hr.general_beds_total), 0) as total_beds,
        COALESCE(SUM(hr.general_beds_available), 0) as total_available_beds,
        COALESCE(SUM(hr.icu_beds_total), 0) as total_icu_beds,
        COALESCE(SUM(hr.icu_beds_available), 0) as total_available_icu,
        COALESCE(SUM(hr.ventilators_total), 0) as total_ventilators,
        COALESCE(SUM(hr.ventilators_available), 0) as total_available_ventilators,
        COALESCE(SUM(hr.oxygen_supported_beds_total), 0) as total_oxygen_beds,
        COALESCE(SUM(hr.oxygen_supported_beds_available), 0) as total_available_oxygen_beds,
        (SELECT COALESCE(SUM(units_available), 0) FROM blood_bank) as total_blood_units,
        (SELECT COUNT(*) FROM doctors) as total_doctors,
        (SELECT COUNT(*) FROM patients) as total_patients
      FROM hospitals h
      LEFT JOIN hospital_resources hr ON h.id = hr.hospital_id
    `);
    
    const stats = statsResult.rows[0];
    
    // Get monthly registrations
    const monthlyResult = await pool.query(`
      SELECT 
        DATE_TRUNC('month', created_at) as month,
        COUNT(*) as count
      FROM hospitals
      WHERE created_at > NOW() - INTERVAL '12 months'
      GROUP BY DATE_TRUNC('month', created_at)
      ORDER BY month DESC
    `);
    
    const monthlyData = monthlyResult.rows.map(row => ({
      month: row.month.toISOString().split('T')[0].substring(0, 7),
      count: parseInt(row.count)
    }));
    
    // Generate report
    const report = {
      title: 'Hospital Performance Report',
      generated_at: new Date().toISOString(),
      period: 'Monthly',
      summary: {
        total_hospitals: parseInt(stats.total_hospitals) || 0,
        verified_hospitals: parseInt(stats.verified_hospitals) || 0,
        pending_hospitals: parseInt(stats.pending_hospitals) || 0,
        total_patients: parseInt(stats.total_patients) || 0,
        total_doctors: parseInt(stats.total_doctors) || 0,
      },
      resources: {
        beds: {
          total: parseInt(stats.total_beds) || 0,
          available: parseInt(stats.total_available_beds) || 0,
          occupancy: stats.total_beds > 0 ? ((stats.total_beds - stats.total_available_beds) / stats.total_beds * 100).toFixed(1) : '0',
        },
        icu: {
          total: parseInt(stats.total_icu_beds) || 0,
          available: parseInt(stats.total_available_icu) || 0,
          occupancy: stats.total_icu_beds > 0 ? ((stats.total_icu_beds - stats.total_available_icu) / stats.total_icu_beds * 100).toFixed(1) : '0',
        },
        ventilators: {
          total: parseInt(stats.total_ventilators) || 0,
          available: parseInt(stats.total_available_ventilators) || 0,
        },
        oxygen_beds: {
          total: parseInt(stats.total_oxygen_beds) || 0,
          available: parseInt(stats.total_available_oxygen_beds) || 0,
        },
        blood_units: parseInt(stats.total_blood_units) || 0,
      },
      hospitals: hospitals.map(h => ({
        id: h.id,
        name: h.name,
        city: h.city,
        is_verified: h.is_verified,
        verification_status: h.verification_status,
        beds: {
          total: parseInt(h.general_beds_total) || 0,
          available: parseInt(h.general_beds_available) || 0,
        },
        icu: {
          total: parseInt(h.icu_beds_total) || 0,
          available: parseInt(h.icu_beds_available) || 0,
        },
        ventilators: {
          total: parseInt(h.ventilators_total) || 0,
          available: parseInt(h.ventilators_available) || 0,
        },
        blood_units: parseInt(h.blood_units) || 0,
        doctors: parseInt(h.total_doctors) || 0,
        appointments: {
          completed: parseInt(h.completed_appointments) || 0,
          pending: parseInt(h.pending_appointments) || 0,
        },
        created_at: h.created_at,
      })),
      monthly_registrations: monthlyData,
    };
    
    if (format === 'json') {
      res.json({
        success: true,
        data: report,
      });
    } else {
      // For CSV or other formats
      res.json({
        success: true,
        data: report,
      });
    }
  } catch (error) {
    console.error('Generate hospital performance report error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  }
};

// Generate Resource Utilization Report
exports.generateResourceReport = async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Get resource utilization across all hospitals
    const result = await pool.query(`
      SELECT 
        h.id as hospital_id,
        h.name as hospital_name,
        h.city,
        COALESCE(hr.general_beds_total, 0) as total_beds,
        COALESCE(hr.general_beds_available, 0) as available_beds,
        COALESCE(hr.icu_beds_total, 0) as total_icu,
        COALESCE(hr.icu_beds_available, 0) as available_icu,
        COALESCE(hr.ventilators_total, 0) as total_ventilators,
        COALESCE(hr.ventilators_available, 0) as available_ventilators,
        COALESCE(hr.oxygen_supported_beds_total, 0) as total_oxygen,
        COALESCE(hr.oxygen_supported_beds_available, 0) as available_oxygen,
        (SELECT COALESCE(SUM(units_available), 0) FROM blood_bank WHERE hospital_id = h.id) as blood_units,
        (SELECT COUNT(*) FROM patients p WHERE p.id IN (SELECT patient_id FROM appointments WHERE hospital_id = h.id)) as patient_count
      FROM hospitals h
      LEFT JOIN hospital_resources hr ON h.id = hr.hospital_id
      WHERE h.is_verified = true
      ORDER BY h.name
    `);
    
    const hospitals = result.rows;
    
    // Calculate totals
    let totalBeds = 0, totalAvailableBeds = 0;
    let totalIcu = 0, totalAvailableIcu = 0;
    let totalVentilators = 0, totalAvailableVentilators = 0;
    let totalOxygen = 0, totalAvailableOxygen = 0;
    let totalBlood = 0;
    
    hospitals.forEach(h => {
      totalBeds += parseInt(h.total_beds) || 0;
      totalAvailableBeds += parseInt(h.available_beds) || 0;
      totalIcu += parseInt(h.total_icu) || 0;
      totalAvailableIcu += parseInt(h.available_icu) || 0;
      totalVentilators += parseInt(h.total_ventilators) || 0;
      totalAvailableVentilators += parseInt(h.available_ventilators) || 0;
      totalOxygen += parseInt(h.total_oxygen) || 0;
      totalAvailableOxygen += parseInt(h.available_oxygen) || 0;
      totalBlood += parseInt(h.blood_units) || 0;
    });
    
    const report = {
      title: 'Resource Utilization Report',
      generated_at: new Date().toISOString(),
      period: 'Last 30 Days',
      summary: {
        total_beds: totalBeds,
        available_beds: totalAvailableBeds,
        bed_occupancy: totalBeds > 0 ? ((totalBeds - totalAvailableBeds) / totalBeds * 100).toFixed(1) : '0',
        total_icu: totalIcu,
        available_icu: totalAvailableIcu,
        icu_occupancy: totalIcu > 0 ? ((totalIcu - totalAvailableIcu) / totalIcu * 100).toFixed(1) : '0',
        total_ventilators: totalVentilators,
        available_ventilators: totalAvailableVentilators,
        total_oxygen_beds: totalOxygen,
        available_oxygen_beds: totalAvailableOxygen,
        total_blood_units: totalBlood,
      },
      hospitals: hospitals.map(h => ({
        id: h.hospital_id,
        name: h.hospital_name,
        city: h.city,
        beds: {
          total: parseInt(h.total_beds) || 0,
          available: parseInt(h.available_beds) || 0,
          occupancy: h.total_beds > 0 ? ((h.total_beds - h.available_beds) / h.total_beds * 100).toFixed(1) : '0',
        },
        icu: {
          total: parseInt(h.total_icu) || 0,
          available: parseInt(h.available_icu) || 0,
          occupancy: h.total_icu > 0 ? ((h.total_icu - h.available_icu) / h.total_icu * 100).toFixed(1) : '0',
        },
        ventilators: {
          total: parseInt(h.total_ventilators) || 0,
          available: parseInt(h.available_ventilators) || 0,
        },
        oxygen_beds: {
          total: parseInt(h.total_oxygen) || 0,
          available: parseInt(h.available_oxygen) || 0,
        },
        blood_units: parseInt(h.blood_units) || 0,
        patient_count: parseInt(h.patient_count) || 0,
      })),
    };
    
    res.json({
      success: true,
      data: report,
    });
  } catch (error) {
    console.error('Generate resource report error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  }
};

// Generate Emergency Response Report
exports.generateEmergencyReport = async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Get emergency statistics
    const result = await pool.query(`
      SELECT 
        COUNT(*) as total_emergencies,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'assigned' THEN 1 ELSE 0 END) as assigned,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN severity = 'High' THEN 1 ELSE 0 END) as high_severity,
        SUM(CASE WHEN severity = 'Medium' THEN 1 ELSE 0 END) as medium_severity,
        SUM(CASE WHEN severity = 'Low' THEN 1 ELSE 0 END) as low_severity,
        AVG(EXTRACT(EPOCH FROM (assigned_at - created_at))) as avg_response_time
      FROM emergency_requests
      WHERE created_at > NOW() - INTERVAL '30 days'
    `);
    
    const stats = result.rows[0];
    
    // Get emergency by type
    const typeResult = await pool.query(`
      SELECT 
        emergency_type,
        COUNT(*) as count
      FROM emergency_requests
      WHERE created_at > NOW() - INTERVAL '30 days'
      GROUP BY emergency_type
      ORDER BY count DESC
    `);
    
    const emergencyTypes = typeResult.rows.map(row => ({
      type: row.emergency_type || 'Other',
      count: parseInt(row.count),
    }));
    
    // Get daily emergencies
    const dailyResult = await pool.query(`
      SELECT 
        DATE_TRUNC('day', created_at) as day,
        COUNT(*) as count
      FROM emergency_requests
      WHERE created_at > NOW() - INTERVAL '30 days'
      GROUP BY DATE_TRUNC('day', created_at)
      ORDER BY day DESC
    `);
    
    const dailyData = dailyResult.rows.map(row => ({
      date: row.day.toISOString().split('T')[0],
      count: parseInt(row.count),
    }));
    
    const report = {
      title: 'Emergency Response Report',
      generated_at: new Date().toISOString(),
      period: 'Last 30 Days',
      summary: {
        total_emergencies: parseInt(stats.total_emergencies) || 0,
        pending: parseInt(stats.pending) || 0,
        assigned: parseInt(stats.assigned) || 0,
        completed: parseInt(stats.completed) || 0,
        high_severity: parseInt(stats.high_severity) || 0,
        medium_severity: parseInt(stats.medium_severity) || 0,
        low_severity: parseInt(stats.low_severity) || 0,
        avg_response_time: stats.avg_response_time ? `${Math.round(stats.avg_response_time)} seconds` : 'N/A',
      },
      emergency_types: emergencyTypes,
      daily_emergencies: dailyData,
    };
    
    res.json({
      success: true,
      data: report,
    });
  } catch (error) {
    console.error('Generate emergency report error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  }
};

// Generate User Registration Report
exports.generateUserReport = async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Get user registration statistics
    const result = await pool.query(`
      SELECT 
        COUNT(*) as total_users,
        SUM(CASE WHEN user_type = 'patient' THEN 1 ELSE 0 END) as patients,
        SUM(CASE WHEN user_type = 'hospital' THEN 1 ELSE 0 END) as hospitals,
        SUM(CASE WHEN user_type = 'admin' THEN 1 ELSE 0 END) as admins,
        SUM(CASE WHEN is_verified = true THEN 1 ELSE 0 END) as verified_users
      FROM users
    `);
    
    const stats = result.rows[0];
    
    // Get monthly registrations
    const monthlyResult = await pool.query(`
      SELECT 
        DATE_TRUNC('month', created_at) as month,
        user_type,
        COUNT(*) as count
      FROM users
      WHERE created_at > NOW() - INTERVAL '12 months'
      GROUP BY DATE_TRUNC('month', created_at), user_type
      ORDER BY month DESC, user_type
    `);
    
    const monthlyData = {};
    monthlyResult.rows.forEach(row => {
      const month = row.month.toISOString().split('T')[0].substring(0, 7);
      if (!monthlyData[month]) {
        monthlyData[month] = { month, patients: 0, hospitals: 0, admins: 0 };
      }
      monthlyData[month][row.user_type + 's'] = parseInt(row.count);
    });
    
    const monthlyRegistrations = Object.values(monthlyData);
    
    const report = {
      title: 'User Registration Report',
      generated_at: new Date().toISOString(),
      period: 'Monthly',
      summary: {
        total_users: parseInt(stats.total_users) || 0,
        patients: parseInt(stats.patients) || 0,
        hospitals: parseInt(stats.hospitals) || 0,
        admins: parseInt(stats.admins) || 0,
        verified_users: parseInt(stats.verified_users) || 0,
      },
      monthly_registrations: monthlyRegistrations,
    };
    
    res.json({
      success: true,
      data: report,
    });
  } catch (error) {
    console.error('Generate user report error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  }
};

// Download report as file
exports.downloadReport = async (req, res) => {
  try {
    const { reportType } = req.params;
    const { format = 'json' } = req.query;
    
    let reportData;
    
    // Generate the requested report
    switch (reportType) {
      case 'hospital-performance':
        reportData = await exports.generateHospitalPerformanceReport(req, res);
        break;
      case 'resource-utilization':
        reportData = await exports.generateResourceReport(req, res);
        break;
      case 'emergency-response':
        reportData = await exports.generateEmergencyReport(req, res);
        break;
      case 'user-registration':
        reportData = await exports.generateUserReport(req, res);
        break;
      default:
        return res.status(400).json({ success: false, message: 'Invalid report type' });
    }
    
    // If format is JSON, download as JSON file
    if (format === 'json') {
      const fileName = `${reportType}_${new Date().toISOString().split('T')[0]}.json`;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      return res.json(reportData);
    }
    
    res.json(reportData);
  } catch (error) {
    console.error('Download report error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  }
};