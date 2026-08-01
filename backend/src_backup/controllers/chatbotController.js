// src/controllers/chatbotController.js
const geminiService = require('../services/geminiService');
const hospitalSearchService = require('../services/hospitalSearchService');

class ChatbotController {
  async handleChat(req, res) {
    try {
      console.log('📨 Chat request received:', req.body);
      const { message, latitude, longitude, language = 'auto' } = req.body;

      if (!message) {
        return res.status(400).json({
          success: false,
          error: 'Message is required',
          response: 'Please provide a message to process.',
        });
      }

      // Detect language if set to auto
      let detectedLang = language;
      if (language === 'auto') {
        detectedLang = geminiService.detectLanguage(message);
      }

      console.log(`📝 Processing message: "${message}" (Language: ${detectedLang})`);

      // Process message with Gemini
      const intentData = await geminiService.processUserMessage(message, detectedLang);
      console.log(`🎯 Intent detected: ${intentData.intent}`);

      let hospitalData = [];
      let responseText = '';

      // Handle different intents
      switch (intentData.intent) {
        case 'emergency':
          const emergencyContacts = await hospitalSearchService.getEmergencyContacts();
          responseText = await geminiService.generateResponse(
            message,
            intentData,
            null,
            detectedLang
          );
          return res.json({
            success: true,
            response: responseText,
            intent: intentData.intent,
            language: detectedLang,
            emergency: true,
            contacts: emergencyContacts,
            urgency: 'high',
            action: 'call_108',
            timestamp: new Date().toISOString(),
          });

        case 'find_hospital':
          if (latitude && longitude) {
            try {
              hospitalData = await hospitalSearchService.searchHospitals(
                intentData.condition || '',
                parseFloat(latitude),
                parseFloat(longitude),
                parseInt(process.env.CHATBOT_RADIUS_KM) || 20
              );
              console.log(`🏥 Found ${hospitalData.length} hospitals`);
            } catch (searchError) {
              console.error('Hospital search error:', searchError);
              hospitalData = [];
            }
          }
          responseText = await geminiService.generateResponse(
            message,
            intentData,
            hospitalData,
            detectedLang
          );
          break;

        default:
          responseText = await geminiService.generateResponse(
            message,
            intentData,
            null,
            detectedLang
          );
      }

      // Format response
      const response = {
        success: true,
        response: responseText || 'I\'m here to help. Please tell me more about your health concern.',
        intent: intentData.intent || 'general_health',
        language: detectedLang,
        urgency: intentData.urgency || 'low',
        recommendations: hospitalData && hospitalData.length > 0 ? hospitalData.slice(0, 3).map(h => ({
          id: h.id,
          name: h.name || 'Unknown Hospital',
          address: h.address || 'Address not available',
          distance: h.distance_km !== undefined ? parseFloat(h.distance_km).toFixed(1) : '0.0',
          rating: parseFloat(h.rating || 4.0),
          specialty: h.specialties && Array.isArray(h.specialties) ? h.specialties[0] : (h.specialties || 'General'),
          availableBeds: parseInt(h.available_beds || 0),
          availableIcu: parseInt(h.available_icu || 0),
          availableVentilators: parseInt(h.available_ventilators || 0),
          availableOxygen: parseInt(h.available_oxygen || 0),
          bloodUnits: parseInt(h.blood_units || 0),
          isVerified: h.is_verified || false,
          phone: h.phone || '',
        })) : [],
        timestamp: new Date().toISOString(),
      };

      res.json(response);

    } catch (error) {
      console.error('❌ Chat error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to process chat message',
        response: 'Sorry, I encountered an error. Please try again later.',
        timestamp: new Date().toISOString(),
      });
    }
  }

  async searchHospitals(req, res) {
    try {
      const { condition, latitude, longitude, radius = 20 } = req.body;

      if (!latitude || !longitude) {
        return res.status(400).json({
          success: false,
          error: 'Location is required for hospital search',
        });
      }

      const hospitals = await hospitalSearchService.searchHospitals(
        condition || '',
        parseFloat(latitude),
        parseFloat(longitude),
        parseInt(radius)
      );

      res.json({
        success: true,
        count: hospitals.length,
        data: hospitals.map(h => ({
          id: h.id,
          name: h.name || 'Unknown Hospital',
          address: h.address || 'Address not available',
          distance: h.distance_km !== undefined ? parseFloat(h.distance_km).toFixed(1) : '0.0',
          rating: parseFloat(h.rating || 4.0),
          specialty: h.specialties && Array.isArray(h.specialties) ? h.specialties[0] : (h.specialties || 'General'),
          availableBeds: parseInt(h.available_beds || 0),
          availableIcu: parseInt(h.available_icu || 0),
          availableVentilators: parseInt(h.available_ventilators || 0),
          availableOxygen: parseInt(h.available_oxygen || 0),
          bloodUnits: parseInt(h.blood_units || 0),
          isVerified: h.is_verified || false,
          phone: h.phone || '',
        })),
        timestamp: new Date().toISOString(),
      });

    } catch (error) {
      console.error('❌ Search error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to search hospitals',
        timestamp: new Date().toISOString(),
      });
    }
  }

  async getEmergencyContacts(req, res) {
    try {
      const contacts = await hospitalSearchService.getEmergencyContacts();
      res.json({
        success: true,
        data: contacts,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('❌ Emergency contacts error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch emergency contacts',
      });
    }
  }

  async getBloodAvailability(req, res) {
    try {
      const bloodData = await hospitalSearchService.getBloodAvailability();
      res.json({
        success: true,
        data: bloodData,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('❌ Blood availability error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch blood availability',
      });
    }
  }

  // Get all hospitals
  async getAllHospitals(req, res) {
    try {
      const { verified } = req.query;
      const hospitals = await hospitalSearchService.getAllHospitals(verified === 'true');
      res.json({
        success: true,
        count: hospitals.length,
        data: hospitals,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('❌ Get all hospitals error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch hospitals',
        timestamp: new Date().toISOString(),
      });
    }
  }
}

module.exports = new ChatbotController();