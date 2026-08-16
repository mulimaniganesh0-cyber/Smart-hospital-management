// src/routes/chatbotRoutes.js
const express = require('express');
const router = express.Router();
const chatbotController = require('../controllers/chatbotController');
const { protect } = require('../middleware/auth');

// Chatbot query endpoint (authenticated)
router.post('/query', protect, chatbotController.queryChatbot);
router.get('/hospitals/search', protect, chatbotController.searchHospitals);

module.exports = router;
