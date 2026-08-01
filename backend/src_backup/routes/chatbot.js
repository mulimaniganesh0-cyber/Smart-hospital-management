// src/routes/chatbot.js
const express = require('express');
const router = express.Router();
const chatbotController = require('../controllers/chatbotController');

// Main chat endpoint
router.post('/chat', chatbotController.handleChat);

// Hospital search endpoint
router.post('/search-hospitals', chatbotController.searchHospitals);

// Get all hospitals
router.get('/all', chatbotController.getAllHospitals);

// Emergency contacts endpoint
router.get('/emergency-contacts', chatbotController.getEmergencyContacts);

// Blood availability endpoint
router.get('/blood-availability', chatbotController.getBloodAvailability);

// Health check
router.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    service: 'Chatbot Service',
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;