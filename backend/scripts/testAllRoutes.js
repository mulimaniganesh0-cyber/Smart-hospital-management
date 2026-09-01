// backend/scripts/testAllRoutes.js
const jwt = require('jsonwebtoken');
const http = require('http');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const { pool } = require('../src/config/database');

const PORT = 5001;
const JWT_SECRET = process.env.JWT_SECRET || 'SmartHospitalManagementJWTSecret2026_ChangeThisToYourOwnLongRandomSecret';

// Generate test tokens for different roles
const patientToken = jwt.sign({ id: 1, role: 'patient', email: 'test_patient@example.com' }, JWT_SECRET, { expiresIn: '1h' });
const hospitalToken = jwt.sign({ id: 2, role: 'hospital', email: 'test_hospital@example.com' }, JWT_SECRET, { expiresIn: '1h' });
const adminToken = jwt.sign({ id: 3, role: 'admin', email: 'test_admin@example.com' }, JWT_SECRET, { expiresIn: '1h' });
const doctorToken = jwt.sign({ id: 4, role: 'doctor', email: 'test_doctor@example.com' }, JWT_SECRET, { expiresIn: '1h' });

function makeRequest(method, endpoint, token = null, body = null) {
  return new Promise((resolve) => {
    const dataString = body ? JSON.stringify(body) : null;
    const headers = {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (dataString) headers['Content-Length'] = Buffer.byteLength(dataString);

    const options = {
      hostname: 'localhost',
      port: PORT,
      path: endpoint,
      method: method,
      headers: headers,
      timeout: 10000,
    };

    const req = http.request(options, (res) => {
      let responseBody = '';
      res.on('data', (chunk) => responseBody += chunk);
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(responseBody);
        } catch (e) {
          json = responseBody;
        }
        resolve({
          status: res.statusCode,
          body: json,
        });
      });
    });

    req.on('error', (err) => {
      resolve({ status: 0, error: err.message });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ status: 408, error: 'Request Timeout' });
    });

    if (dataString) req.write(dataString);
    req.end();
  });
}

async function runAudit() {
  console.log('====================================================');
  console.log('🚀 COMPREHENSIVE ROUTE VERIFICATION & AUDIT');
  console.log('====================================================\n');

  // Get real test hospital from DB if available
  let testHospitalId = 1;
  try {
    const hRes = await pool.query('SELECT id FROM hospitals LIMIT 1');
    if (hRes.rows.length > 0) testHospitalId = hRes.rows[0].id;
  } catch (e) {}

  const routesToTest = [
    // Health & Root
    { group: 'Core', method: 'GET', path: '/api/health', token: null, expected: [200] },
    { group: 'Core', method: 'GET', path: '/', token: null, expected: [200] },

    // Auth Routes
    { group: 'Auth', method: 'POST', path: '/api/auth/login', token: null, body: { email: 'fake@example.com', password: 'fake' }, expected: [400, 401] },
    { group: 'Auth', method: 'GET', path: '/api/auth/me', token: null, expected: [401] },
    { group: 'Auth', method: 'GET', path: '/api/auth/me', token: patientToken, expected: [200, 404] },

    // Hospitals
    { group: 'Hospitals', method: 'GET', path: '/api/hospitals', token: null, expected: [200] },
    { group: 'Hospitals', method: 'GET', path: `/api/hospitals/${testHospitalId}`, token: null, expected: [200, 404] },
    { group: 'Hospitals', method: 'GET', path: '/api/hospitals/nearby?lat=12.9716&lng=77.5946', token: null, expected: [200] },
    { group: 'Hospitals', method: 'GET', path: '/api/hospitals/cities', token: null, expected: [200] },

    // Specialties
    { group: 'Specialties', method: 'GET', path: '/api/specialties', token: null, expected: [200] },

    // Doctors
    { group: 'Doctors', method: 'GET', path: '/api/doctors', token: null, expected: [200] },
    { group: 'Doctors', method: 'GET', path: '/api/doctors/specialties', token: null, expected: [200] },

    // Blood Bank
    { group: 'Blood Bank', method: 'GET', path: '/api/blood-bank/all', token: null, expected: [200] },
    { group: 'Blood Bank', method: 'GET', path: `/api/blood-bank/${testHospitalId}`, token: null, expected: [200] },
    { group: 'Blood Bank', method: 'GET', path: '/api/blood-bank/stock/expiry', token: null, expected: [401] },
    { group: 'Blood Bank', method: 'GET', path: '/api/blood-bank/stock/expiry', token: hospitalToken, expected: [200, 404] },
    { group: 'Blood Bank', method: 'GET', path: '/api/blood-bank/stock', token: hospitalToken, expected: [200, 404] },
    { group: 'Blood Bank', method: 'GET', path: '/api/blood-bank/requests/hospital', token: hospitalToken, expected: [200, 404] },
    { group: 'Blood Bank', method: 'GET', path: '/api/blood-bank/my-requests', token: patientToken, expected: [200] },
    { group: 'Blood Bank', method: 'GET', path: '/api/blood-bank/analytics', token: hospitalToken, expected: [200, 404] },
    { group: 'Blood Bank', method: 'GET', path: '/api/blood-bank/donation-history', token: hospitalToken, expected: [200, 404] },
    { group: 'Blood Bank', method: 'GET', path: '/api/blood-bank/notifications', token: hospitalToken, expected: [200, 404] },

    // Ambulance
    { group: 'Ambulance', method: 'GET', path: '/api/ambulance/all', token: null, expected: [200] },
    { group: 'Ambulance', method: 'GET', path: '/api/ambulance/my-requests', token: patientToken, expected: [200] },
    { group: 'Ambulance', method: 'GET', path: '/api/ambulance/hospital-requests', token: hospitalToken, expected: [200, 404] },

    // Appointments
    { group: 'Appointments', method: 'GET', path: '/api/appointments/my-appointments', token: patientToken, expected: [200] },
    { group: 'Appointments', method: 'GET', path: '/api/appointments/hospital-appointments', token: hospitalToken, expected: [200, 404] },

    // Emergency
    { group: 'Emergency', method: 'GET', path: '/api/emergency/hospital-alerts', token: hospitalToken, expected: [200, 404] },
    { group: 'Emergency', method: 'GET', path: '/api/emergency/my-requests', token: patientToken, expected: [200] },

    // Resources
    { group: 'Resources', method: 'GET', path: `/api/resources/hospital/${testHospitalId}/resources`, token: null, expected: [200, 404] },
    { group: 'Resources', method: 'GET', path: '/api/resources/my-requests', token: patientToken, expected: [200] },
    { group: 'Resources', method: 'GET', path: '/api/resources/hospital-requests', token: hospitalToken, expected: [200, 404] },

    // Donation Campaigns
    { group: 'Campaigns', method: 'GET', path: '/api/campaigns', token: null, expected: [200] },
    { group: 'Campaigns', method: 'GET', path: '/api/campaigns/my-campaigns', token: hospitalToken, expected: [200, 404] },

    // Roles
    { group: 'Roles', method: 'GET', path: '/api/roles/hospitals', token: null, expected: [200] },

    // Medical Records
    { group: 'Medical', method: 'GET', path: '/api/medical/onboarding-status', token: patientToken, expected: [200] },
    { group: 'Medical', method: 'GET', path: '/api/medical/profile', token: patientToken, expected: [200, 404] },

    // Reviews
    { group: 'Reviews', method: 'GET', path: `/api/hospitals/${testHospitalId}/reviews`, token: null, expected: [200] },

    // Chatbot / CareGuide
    { group: 'Chatbot', method: 'POST', path: '/api/chatbot/query', token: null, body: { message: 'hello' }, expected: [200] },
    { group: 'CareGuide', method: 'POST', path: '/api/careguide/query', token: null, body: { message: 'hello' }, expected: [200] },

    // Admin
    { group: 'Admin', method: 'GET', path: '/api/admin/stats', token: adminToken, expected: [200] },
    { group: 'Admin', method: 'GET', path: '/api/admin/hospitals/pending', token: adminToken, expected: [200] },
    { group: 'Admin', method: 'GET', path: '/api/admin/users', token: adminToken, expected: [200] },

    // Reports
    { group: 'Reports', method: 'GET', path: '/api/reports/dashboard-stats', token: hospitalToken, expected: [200, 404] },
    { group: 'Reports', method: 'GET', path: '/api/reports/admin/overview', token: adminToken, expected: [200] },
  ];

  let passed = 0;
  let failed = 0;
  const resultsByGroup = {};

  for (const r of routesToTest) {
    const res = await makeRequest(r.method, r.path, r.token, r.body);
    const isOk = r.expected.includes(res.status);

    if (!resultsByGroup[r.group]) resultsByGroup[r.group] = [];
    resultsByGroup[r.group].push({
      method: r.method,
      path: r.path,
      status: res.status,
      expected: r.expected,
      isOk: isOk,
      error: res.error || (isOk ? null : JSON.stringify(res.body)),
    });

    if (isOk) {
      passed++;
    } else {
      failed++;
    }
  }

  // Print results
  for (const [group, tests] of Object.entries(resultsByGroup)) {
    console.log(`\n📁 Module: ${group}`);
    tests.forEach((t) => {
      const icon = t.isOk ? '✅' : '❌';
      console.log(`  ${icon} [${t.method}] ${t.path} -> Status ${t.status} (Expected: ${t.expected.join('/')}) ${t.error ? 'ERR: ' + t.error.slice(0, 100) : ''}`);
    });
  }

  console.log('\n====================================================');
  console.log(`📊 TOTAL SUMMARY: ${passed} PASSED, ${failed} FAILED (Total: ${routesToTest.length})`);
  console.log('====================================================\n');

  pool.end();
  process.exit(failed > 0 ? 1 : 0);
}

runAudit().catch((err) => {
  console.error('Audit failed:', err);
  pool.end();
  process.exit(1);
});
