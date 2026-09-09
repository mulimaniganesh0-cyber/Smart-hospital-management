// src/app.js
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const path = require('path');
const dotenv = require('dotenv');

// Always resolve the backend environment file relative to this module. This
// keeps `node backend/server.js` (run from the repository root) and `npm run
// dev` (run from backend/) on the same configuration.
const envPath = path.resolve(__dirname, '../.env');
const dotenvResult = dotenv.config({ path: envPath });
process.env.CAREGUIDE_ENV_PATH = envPath;
if (dotenvResult.error) {
  console.warn(`[Config] Failed to load dotenv file at ${envPath}: ${dotenvResult.error.message}`);
}

const authRoutes = require('./routes/authRoutes');
const hospitalRoutes = require('./routes/hospitalRoutes');
const patientRoutes = require('./routes/patientRoutes');
const appointmentRoutes = require('./routes/appointmentRoutes');
const emergencyRoutes = require('./routes/emergencyRoutes');
const bloodBankRoutes = require('./routes/bloodBankRoutes');
const ambulanceRoutes = require('./routes/ambulanceRoutes');
const adminRoutes = require('./routes/adminRoutes');
const resourceRoutes = require('./routes/resourceRoutes');
const reportRoutes = require('./routes/reportRoutes');
const donationCampaignRoutes = require('./routes/donationCampaignRoutes');
const roleRoutes = require('./routes/roleRoutes');
const chatbotRoutes = require('./routes/chatbotRoutes');
const medicalRoutes = require('./routes/medicalRoutes');
const specialtyRoutes = require('./routes/specialtyRoutes');
const doctorRoutes = require('./routes/doctorRoutes');
const reviewRoutes = require('./routes/reviewRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const queueRoutes = require('./routes/queueRoutes');
const { pool } = require('./config/database');
const { getOllamaHealth } = require('./services/ollamaService');

const app = express();

const allowedOrigins = (process.env.ALLOWED_ORIGINS || process.env.FRONTEND_URL || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

// ==================== CORS CONFIGURATION ====================
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) {
      return callback(null, true);
    }

    // Local development allows localhost and 127.0.0.1 on any port
    if (process.env.NODE_ENV !== 'production') {
      if (allowedOrigins.length === 0 || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
        return callback(null, true);
      }
    }

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    callback(new Error('Origin is not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: [
    'Content-Type', 
    'Authorization', 
    'X-Requested-With', 
    'Accept', 
    'Origin',
    'X-HTTP-Method-Override',
    'Access-Control-Allow-Origin',
    'Access-Control-Allow-Headers',
    'Access-Control-Allow-Credentials'
  ],
  exposedHeaders: ['Authorization', 'Content-Length'],
  preflightContinue: false,
  optionsSuccessStatus: 204,
};

// Apply CORS middleware first
app.use(cors(corsOptions));

// ==================== OTHER MIDDLEWARE ====================
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: { policy: "unsafe-none" },
  contentSecurityPolicy: false,
}));

app.use(compression());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 100 : 10000,
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again later.'
  },
});
app.use('/api/', limiter);

// Body parsing
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Request logging
app.use((req, res, next) => {
  const startTime = Date.now();
  const requestId = Math.random().toString(36).substring(7);
  
  console.log(`${new Date().toISOString()} - [${requestId}] ${req.method} ${req.url}`);
  console.log(`  Origin: ${req.headers.origin || 'No origin'}`);
  
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    console.log(`  [${requestId}] Response: ${res.statusCode} - ${duration}ms`);
  });
  
  next();
});

// ==================== ROUTES ====================
app.use('/api/auth', authRoutes);
app.use('/api/hospitals', hospitalRoutes);
app.use('/api/specialties', specialtyRoutes);
app.use('/api/patients', patientRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/emergency', emergencyRoutes);
app.use('/api/blood-bank', bloodBankRoutes);
app.use('/api/ambulance', ambulanceRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/resources', resourceRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/campaigns', donationCampaignRoutes);
app.use('/api/roles', roleRoutes);
app.use('/api/chatbot', chatbotRoutes);
// CareGuide's explicit integration namespace. Kept alongside /api/chatbot so
// deployed mobile clients using the original endpoint continue to work.
app.use('/api/careguide', chatbotRoutes);
app.use('/api/medical', medicalRoutes);
app.use('/api/doctors', doctorRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/queues', queueRoutes);
app.use('/api', reviewRoutes);


// Health check endpoint
app.get('/api/health', async (req, res) => {
  let database = false;
  try {
    await pool.query({ text: 'SELECT 1', query_timeout: 2_000 });
    database = true;
  } catch (error) {
    console.warn(`[Health] database unavailable: ${error.message}`);
  }
  const ollama = await getOllamaHealth();
  res.status(database ? 200 : 503).json({
    status: database && ollama.available ? 'ok' : 'degraded',
    database,
    ollama: ollama.available,
    ollamaModel: ollama.model,
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    uptime: process.uptime(),
    version: '1.0.0'
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'Smart Hospital Resource Management API',
    version: '1.0.0',
    endpoints: {
      health: '/api/health',
      auth: '/api/auth',
      hospitals: '/api/hospitals',
      patients: '/api/patients',
      appointments: '/api/appointments',
      emergency: '/api/emergency',
      bloodBank: '/api/blood-bank',
      ambulance: '/api/ambulance',
      admin: '/api/admin',
      resources: '/api/resources',
      queues: '/api/queues',
      chatbot: '/api/chatbot'
    }
  });
});

// 404 handler
app.use((req, res) => {
  console.warn(`404 Not Found: ${req.method} ${req.url}`);
  res.status(404).json({
    success: false,
    message: 'Route not found',
    path: req.url,
    method: req.method
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err.stack);
  
  if (err.type === 'entity.too.large') {
    return res.status(413).json({
      success: false,
      message: 'Request entity too large'
    });
  }
  
  if (err.name === 'UnauthorizedError') {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized access'
    });
  }
  
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

module.exports = app;
