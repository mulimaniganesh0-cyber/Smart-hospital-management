// src/services/geminiService.js
let GoogleGenerativeAI;

try {
  GoogleGenerativeAI = require('@google/generative-ai').GoogleGenerativeAI;
} catch (error) {
  console.warn('⚠️ @google/generative-ai not installed. Using fallback mode.');
  GoogleGenerativeAI = null;
}

class GeminiService {
  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    this.isAvailable = false;
    this.modelName = 'gemini-1.5-flash';
    
    if (GoogleGenerativeAI && apiKey && apiKey !== 'your_gemini_api_key_here' && apiKey.length > 10) {
      try {
        this.genAI = new GoogleGenerativeAI(apiKey);
        this.model = this.genAI.getGenerativeModel({
          model: this.modelName,
          generationConfig: {
            temperature: parseFloat(process.env.CHATBOT_TEMPERATURE) || 0.7,
            maxOutputTokens: parseInt(process.env.CHATBOT_MAX_TOKENS) || 500,
            topP: 0.8,
            topK: 40,
          },
        });
        this.isAvailable = true;
        console.log(`🤖 Gemini AI service initialized successfully with model: ${this.modelName}`);
        console.log(`📊 Temperature: ${process.env.CHATBOT_TEMPERATURE || 0.7}, Max Tokens: ${process.env.CHATBOT_MAX_TOKENS || 500}`);
      } catch (error) {
        console.error('❌ Failed to initialize Gemini AI:', error.message);
        this.isAvailable = false;
      }
    } else {
      if (!GoogleGenerativeAI) {
        console.warn('⚠️ @google/generative-ai package not installed');
        console.warn('💡 Run: npm install @google/generative-ai');
      } else if (!apiKey) {
        console.warn('⚠️ GEMINI_API_KEY not found in environment variables');
        console.warn('💡 Add GEMINI_API_KEY=your_api_key to .env file');
      } else if (apiKey === 'your_gemini_api_key_here') {
        console.warn('⚠️ Please replace GEMINI_API_KEY with your actual API key');
        console.warn('💡 Get your API key from: https://makersuite.google.com/app/apikey');
      } else if (apiKey.length < 10) {
        console.warn('⚠️ GEMINI_API_KEY appears to be invalid (too short)');
      }
      console.log('🤖 Running in fallback mode (rule-based responses)');
    }
  }

  /**
   * Detect language from text using Unicode ranges
   */
  detectLanguage(text) {
    if (!text || text.trim().length === 0) return 'en';
    
    const languagePatterns = {
      kn: /[\u0C80-\u0CFF]/,
      hi: /[\u0900-\u097F]/,
      ta: /[\u0B80-\u0BFF]/,
      te: /[\u0C00-\u0C7F]/,
      ml: /[\u0D00-\u0D7F]/,
      mr: /[\u0900-\u097F]/,
      bn: /[\u0980-\u09FF]/,
      gu: /[\u0A80-\u0AFF]/,
      pa: /[\u0A00-\u0A7F]/,
      or: /[\u0B00-\u0B7F]/,
    };

    for (const [lang, pattern] of Object.entries(languagePatterns)) {
      if (pattern.test(text)) {
        return lang;
      }
    }
    return 'en';
  }

  /**
   * Get language name from language code
   */
  getLanguageName(code) {
    const languages = {
      kn: 'Kannada',
      hi: 'Hindi',
      ta: 'Tamil',
      te: 'Telugu',
      ml: 'Malayalam',
      mr: 'Marathi',
      bn: 'Bengali',
      gu: 'Gujarati',
      pa: 'Punjabi',
      or: 'Odia',
      en: 'English',
    };
    return languages[code] || 'English';
  }

  /**
   * Process user message using Gemini AI or fallback
   */
  async processUserMessage(message, language = 'auto') {
    if (!message || message.trim().length === 0) {
      return this.getFallbackIntent('empty message');
    }

    // Detect language if set to auto
    let detectedLang = language;
    if (language === 'auto') {
      detectedLang = this.detectLanguage(message);
    }

    if (!this.isAvailable) {
      return this.getFallbackIntent(message);
    }

    const prompt = `
      You are a healthcare assistant. Analyze the following user message and extract structured information.

      User message: "${message}"
      Detected language: ${this.getLanguageName(detectedLang)}

      Return a JSON response with the following structure:
      {
        "intent": "find_hospital" | "general_health" | "emergency" | "resource_query" | "appointment" | "ambulance" | "blood_donation",
        "condition": "extracted medical condition or symptom",
        "urgency": "high" | "medium" | "low",
        "resources_needed": ["bed", "icu", "ventilator", "blood", "specialist"],
        "specialty": "extracted specialty if mentioned",
        "query_type": "specific" | "general",
        "blood_group": "extracted blood group if mentioned (A+, A-, B+, B-, AB+, AB-, O+, O-)",
        "emergency_type": "accident" | "cardiac" | "stroke" | "trauma" | "general",
        "symptoms": ["extracted symptoms list"],
        "severity": 1-10,
        "needs_immediate": true/false
      }

      Rules:
      - If user mentions symptoms or illness, extract the condition and symptoms
      - If user mentions emergency keywords (heart attack, stroke, accident, severe pain), set urgency to "high"
      - If user asks for specific resources (bed, ICU, ventilator), list them
      - If user mentions a specialty (cardiologist, neurologist), extract it
      - If user asks for hospital recommendations, set intent to "find_hospital"
      - For general health questions, set intent to "general_health"
      - For emergency requests, set intent to "emergency"
      - For blood related queries, set intent to "blood_donation" or "resource_query"
      - For ambulance requests, set intent to "ambulance"
      - For appointment booking, set intent to "appointment"
      
      Be thorough and extract as much information as possible from the user's message.
    `;

    try {
      const result = await this.model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
      });

      const response = result.response.text();
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        // Ensure all fields exist
        return {
          intent: parsed.intent || 'general_health',
          condition: parsed.condition || null,
          urgency: parsed.urgency || 'low',
          resources_needed: parsed.resources_needed || [],
          specialty: parsed.specialty || null,
          query_type: parsed.query_type || 'general',
          blood_group: parsed.blood_group || null,
          emergency_type: parsed.emergency_type || null,
          symptoms: parsed.symptoms || [],
          severity: parsed.severity || 0,
          needs_immediate: parsed.needs_immediate || false,
          language: detectedLang,
        };
      }
      return this.getFallbackIntent(message);
    } catch (error) {
      console.error('Gemini processing error:', error.message);
      return this.getFallbackIntent(message);
    }
  }

  /**
   * Enhanced fallback intent detection using keyword matching
   */
  getFallbackIntent(message) {
    if (!message || message.trim().length === 0) {
      return {
        intent: 'general_health',
        condition: null,
        urgency: 'low',
        resources_needed: [],
        specialty: null,
        query_type: 'general',
        blood_group: null,
        emergency_type: null,
        symptoms: [],
        severity: 0,
        needs_immediate: false,
        language: 'en',
      };
    }

    const lowerMsg = message.toLowerCase();
    
    // Enhanced keyword detection
    const emergencyKeywords = [
      'emergency', 'accident', 'heart attack', 'stroke', 'bleeding', 
      'unconscious', 'severe', 'critical', 'chest pain', 'breathing',
      'not breathing', 'fainted', 'convulsions', 'seizure', 'trauma',
      'gunshot', 'stab', 'burn', 'fall', 'head injury'
    ];
    
    const hospitalKeywords = [
      'hospital', 'nearby', 'clinic', 'medical center', 'treatment', 
      'doctor', 'admit', 'emergency room', 'er', 'medic', 'healthcare',
      'closest', 'nearest', 'where', 'find'
    ];
    
    const appointmentKeywords = [
      'appointment', 'book', 'schedule', 'consult', 'visit', 'checkup',
      'doctor visit', 'specialist', 'consultation', 'meeting'
    ];
    
    const bloodKeywords = [
      'blood', 'blood group', 'donation', 'transfusion', 'blood bank',
      'blood type', 'donate', 'blood unit', 'a+', 'a-', 'b+', 'b-',
      'ab+', 'ab-', 'o+', 'o-', 'negative', 'positive'
    ];
    
    const ambulanceKeywords = [
      'ambulance', 'emergency vehicle', 'transport', 'pickup', 
      'emergency transport', 'need ambulance', 'call ambulance'
    ];
    
    const symptomKeywords = [
      'fever', 'headache', 'pain', 'cough', 'cold', 'flu', 'vomit',
      'nausea', 'dizziness', 'fatigue', 'sore throat', 'rash',
      'swelling', 'wound', 'injury', 'burn', 'bleeding'
    ];

    // Check for emergency first
    if (emergencyKeywords.some(k => lowerMsg.includes(k))) {
      return {
        intent: 'emergency',
        condition: this.extractCondition(lowerMsg, emergencyKeywords),
        urgency: 'high',
        resources_needed: ['emergency'],
        specialty: 'Emergency Medicine',
        query_type: 'specific',
        blood_group: null,
        emergency_type: this.detectEmergencyType(lowerMsg),
        symptoms: this.extractSymptoms(lowerMsg),
        severity: 8,
        needs_immediate: true,
        language: 'en',
      };
    }

    // Check for ambulance request
    if (ambulanceKeywords.some(k => lowerMsg.includes(k))) {
      return {
        intent: 'ambulance',
        condition: 'Ambulance requested',
        urgency: 'high',
        resources_needed: ['ambulance'],
        specialty: 'Emergency',
        query_type: 'specific',
        blood_group: null,
        emergency_type: 'general',
        symptoms: [],
        severity: 7,
        needs_immediate: true,
        language: 'en',
      };
    }

    // Check for blood related queries
    if (bloodKeywords.some(k => lowerMsg.includes(k))) {
      const bloodGroup = this.extractBloodGroup(lowerMsg);
      return {
        intent: 'resource_query',
        condition: bloodGroup ? `Blood donation for ${bloodGroup}` : 'Blood related query',
        urgency: 'medium',
        resources_needed: ['blood'],
        specialty: 'Blood Bank',
        query_type: 'specific',
        blood_group: bloodGroup,
        emergency_type: null,
        symptoms: [],
        severity: 5,
        needs_immediate: false,
        language: 'en',
      };
    }

    // Check for appointment
    if (appointmentKeywords.some(k => lowerMsg.includes(k))) {
      return {
        intent: 'appointment',
        condition: this.extractCondition(lowerMsg, appointmentKeywords),
        urgency: 'low',
        resources_needed: [],
        specialty: this.extractSpecialty(lowerMsg),
        query_type: 'specific',
        blood_group: null,
        emergency_type: null,
        symptoms: [],
        severity: 2,
        needs_immediate: false,
        language: 'en',
      };
    }

    // Check for hospital search
    if (hospitalKeywords.some(k => lowerMsg.includes(k))) {
      return {
        intent: 'find_hospital',
        condition: this.extractCondition(lowerMsg, hospitalKeywords),
        urgency: 'medium',
        resources_needed: [],
        specialty: this.extractSpecialty(lowerMsg),
        query_type: 'specific',
        blood_group: null,
        emergency_type: null,
        symptoms: [],
        severity: 4,
        needs_immediate: false,
        language: 'en',
      };
    }

    // Default: general health
    return {
      intent: 'general_health',
      condition: this.extractCondition(lowerMsg, symptomKeywords),
      urgency: 'low',
      resources_needed: [],
      specialty: null,
      query_type: 'general',
      blood_group: null,
      emergency_type: null,
      symptoms: this.extractSymptoms(lowerMsg),
      severity: this.estimateSeverity(lowerMsg),
      needs_immediate: false,
      language: 'en',
    };
  }

  /**
   * Helper method to extract condition from message
   */
  extractCondition(message, keywords) {
    for (const keyword of keywords) {
      if (message.includes(keyword)) {
        return keyword;
      }
    }
    return null;
  }

  /**
   * Helper method to extract symptoms from message
   */
  extractSymptoms(message) {
    const symptomKeywords = [
      'fever', 'headache', 'pain', 'cough', 'cold', 'flu', 'vomit',
      'nausea', 'dizziness', 'fatigue', 'sore throat', 'rash',
      'swelling', 'wound', 'injury', 'burn', 'bleeding', 'chest pain',
      'breathing', 'cramps', 'back pain', 'joint pain', 'muscle pain'
    ];
    return symptomKeywords.filter(s => message.includes(s));
  }

  /**
   * Helper method to extract blood group
   */
  extractBloodGroup(message) {
    const bloodGroups = ['a+', 'a-', 'b+', 'b-', 'ab+', 'ab-', 'o+', 'o-'];
    for (const group of bloodGroups) {
      if (message.includes(group)) {
        return group.toUpperCase();
      }
    }
    return null;
  }

  /**
   * Helper method to extract specialty
   */
  extractSpecialty(message) {
    const specialties = [
      'cardiologist', 'neurologist', 'orthopedic', 'pediatrician',
      'gynecologist', 'urologist', 'dermatologist', 'ophthalmologist',
      'ent', 'psychiatrist', 'oncologist', 'radiologist', 'surgeon'
    ];
    for (const specialty of specialties) {
      if (message.includes(specialty)) {
        return specialty.charAt(0).toUpperCase() + specialty.slice(1);
      }
    }
    return null;
  }

  /**
   * Helper method to detect emergency type
   */
  detectEmergencyType(message) {
    if (message.includes('heart') || message.includes('cardiac') || message.includes('chest pain')) {
      return 'cardiac';
    } else if (message.includes('stroke') || message.includes('brain') || message.includes('paralysis')) {
      return 'stroke';
    } else if (message.includes('accident') || message.includes('crash') || message.includes('fall')) {
      return 'accident';
    } else if (message.includes('injury') || message.includes('wound') || message.includes('bleeding')) {
      return 'trauma';
    }
    return 'general';
  }

  /**
   * Helper method to estimate severity
   */
  estimateSeverity(message) {
    const highSeverity = ['severe', 'critical', 'emergency', 'excruciating', 'unbearable'];
    const mediumSeverity = ['pain', 'fever', 'infection', 'injury'];
    
    if (highSeverity.some(k => message.includes(k))) return 8;
    if (mediumSeverity.some(k => message.includes(k))) return 5;
    return 3;
  }

  /**
   * Generate response using Gemini AI or fallback
   */
  async generateResponse(userMessage, intentData, hospitalData, language = 'en') {
    if (!this.isAvailable) {
      return this.getFallbackResponse(userMessage, intentData, hospitalData, language);
    }

    const languageName = this.getLanguageName(language);

    let contextPrompt = `
      You are a friendly healthcare assistant. Respond to the user in ${languageName} language.

      User message: "${userMessage}"
      Intent analysis: ${JSON.stringify(intentData)}
    `;

    if (hospitalData && hospitalData.length > 0) {
      const hospitalList = hospitalData.map((h, i) => `
        ${i + 1}. ${h.name}
        - Distance: ${parseFloat(h.distance_km || h.distance || 0).toFixed(1)} km
        - Specialty: ${h.specialties ? h.specialties[0] || 'General' : 'General'}
        - Available beds: ${h.available_beds || 0}
        - ICU beds: ${h.available_icu || 0}
        - Ventilators: ${h.available_ventilators || 0}
        - Rating: ${h.rating || 4.0}
        - Address: ${h.address || 'Address not available'}
        - Phone: ${h.phone || 'Not available'}
        - Emergency Services: ${h.emergency_services ? '✅ Available' : '❌ Not available'}
      `).join('\n');

      contextPrompt += `
        Available hospitals nearby:
        ${hospitalList}
        
        Based on the user's condition (${intentData.condition || 'not specified'}), 
        recommend the best matching hospital from the list above.
      `;
    } else if (intentData.intent === 'find_hospital') {
      contextPrompt += `
        No hospitals found nearby matching the criteria.
        Suggest the user to:
        1. Expand search radius
        2. Try different keywords
        3. Or call emergency services at 108
        4. Consider telemedicine consultation as alternative
      `;
    }

    if (intentData.intent === 'emergency') {
      contextPrompt += `
        🚨 URGENT: This appears to be an emergency situation.
        IMMEDIATE ACTION REQUIRED:
        1. Call 108 or local emergency number immediately
        2. Stay with the patient
        3. Provide first aid if trained
        4. Do not move the patient unless absolutely necessary
        5. Keep the patient calm and comfortable
        6. Do not give food or water to the patient
        7. If bleeding, apply pressure with clean cloth
        8. If unconscious, check breathing and pulse
      `;
    }

    if (intentData.intent === 'ambulance') {
      contextPrompt += `
        🚑 Ambulance request detected.
        Provide the following information to the emergency dispatcher:
        1. Your current location (address or GPS coordinates)
        2. Patient's condition
        3. Patient's age
        4. Is patient conscious?
        5. Is patient breathing?
        6. Any visible injuries?
        7. Any medical conditions?
      `;
    }

    contextPrompt += `
      Response guidelines:
      1. Be empathetic, professional, and helpful
      2. If recommending hospitals, provide specific details and actionable steps
      3. If emergency, urge to call 108 immediately with clear instructions
      4. Keep response concise (2-3 paragraphs maximum)
      5. Use bullet points for clarity when listing options
      6. Write in ${languageName} language
      7. Include relevant phone numbers and addresses
      8. If no hospitals found, suggest alternatives and next steps
      9. If blood donation, provide nearest blood bank details
      10. For appointments, suggest available slots if possible

      Generate a helpful response:
    `;

    try {
      const result = await this.model.generateContent({
        contents: [{ role: 'user', parts: [{ text: contextPrompt }] }],
      });

      return result.response.text();
    } catch (error) {
      console.error('Response generation error:', error.message);
      return this.getFallbackResponse(userMessage, intentData, hospitalData, language);
    }
  }

  /**
   * Enhanced fallback response for different intents and languages
   */
  getFallbackResponse(userMessage, intentData, hospitalData, language) {
    const languageName = this.getLanguageName(language);
    
    // Emergency response
    if (intentData.intent === 'emergency') {
      const responses = {
        kn: '🚨 ತುರ್ತು ಪರಿಸ್ಥಿತಿ! ದಯವಿಟ್ಟು ತಕ್ಷಣ 108 ಗೆ ಕರೆ ಮಾಡಿ. ಆಂಬ್ಯುಲೆನ್ಸ್ ಬರುವವರೆಗೆ ರೋಗಿಯ ಬಳಿ ಇರಿ. ರೋಗಿಯನ್ನು ಅಲುಗಾಡಿಸಬೇಡಿ.',
        hi: '🚨 आपातकालीन स्थिति! कृपया तुरंत 108 पर कॉल करें। एम्बुलेंस आने तक मरीज के पास रहें। मरीज को हिलाएं नहीं।',
        ta: '🚨 அவசர நிலை! தயவுசெய்து உடனடியாக 108 ஐ அழைக்கவும். ஆம்புலன்ஸ் வரும் வரை நோயாளியுடன் இருங்கள். நோயாளியை அசைக்க வேண்டாம்.',
        te: '🚨 అత్యవసర పరిస్థితి! దయచేసి వెంటనే 108 కి కాల్ చేయండి. అంబులెన్స్ వచ్చే వరకు రోగి దగ్గర ఉండండి. రోగిని కదిలించవద్దు.',
        ml: '🚨 അടിയന്തിര സാഹചര്യം! ദയവായി ഉടൻ 108 എന്ന നമ്പറിൽ വിളിക്കുക. ആംബുലൻസ് വരുന്നതുവരെ രോഗിയുടെ അടുത്ത് തുടരുക. രോഗിയെ ഇളക്കരുത്.',
        en: '🚨 Emergency situation! Please call 108 immediately. Stay with the patient until ambulance arrives. Do not move the patient.',
      };
      return responses[language] || responses.en;
    }

    // Ambulance response
    if (intentData.intent === 'ambulance') {
      const responses = {
        kn: '🚑 ಆಂಬ್ಯುಲೆನ್ಸ್ ಅಗತ್ಯವಿದೆ. ದಯವಿಟ್ಟು 108 ಗೆ ಕರೆ ಮಾಡಿ ಮತ್ತು ನಿಮ್ಮ ಸ್ಥಳವನ್ನು ತಿಳಿಸಿ. ನೀವು ನೀಡುವ ಮಾಹಿತಿಯು ಆಂಬ್ಯುಲೆನ್ಸ್ ತ್ವರಿತವಾಗಿ ತಲುಪಲು ಸಹಾಯ ಮಾಡುತ್ತದೆ.',
        hi: '🚑 एम्बुलेंस की आवश्यकता है। कृपया 108 पर कॉल करें और अपना स्थान बताएं। आपकी दी गई जानकारी एम्बुलेंस को जल्दी पहुंचने में मदद करेगी।',
        en: '🚑 Ambulance needed. Please call 108 and provide your location. The information you provide will help the ambulance reach quickly.',
      };
      return responses[language] || responses.en;
    }

    // Blood donation response
    if (intentData.intent === 'resource_query' && intentData.resources_needed.includes('blood')) {
      const bloodGroup = intentData.blood_group || 'any';
      const responses = {
        kn: `🩸 ${bloodGroup} ರಕ್ತದ ಅಗತ್ಯವಿದೆ. ಹತ್ತಿರದ ರಕ್ತದಾನ ಕೇಂದ್ರವನ್ನು ಸಂಪರ್ಕಿಸಿ ಅಥವಾ 108 ಗೆ ಕರೆ ಮಾಡಿ. ರಕ್ತದಾನ ಮಾಡುವ ಮೂಲಕ ಜೀವ ಉಳಿಸಿ.`,
        hi: `🩸 ${bloodGroup} रक्त की आवश्यकता है। नजदीकी रक्तदान केंद्र से संपर्क करें या 108 पर कॉल करें। रक्तदान करके जीवन बचाएं।`,
        en: `🩸 ${bloodGroup} blood needed. Contact your nearest blood bank or call 108. Save lives by donating blood.`,
      };
      return responses[language] || responses.en;
    }

    // Hospital recommendations
    if (intentData.intent === 'find_hospital' && hospitalData && hospitalData.length > 0) {
      const hospitals = hospitalData.slice(0, 3).map((h, i) => {
        const distance = parseFloat(h.distance_km || 0).toFixed(1);
        const beds = h.available_beds || 0;
        const specialty = h.specialties && Array.isArray(h.specialties) ? h.specialties[0] : 'General';
        return `${i + 1}. ${h.name} (${distance} km) - ${specialty} - ${beds} beds available`;
      }).join('\n');

      const responses = {
        kn: `🏥 ನಿಮ್ಮ ಹತ್ತಿರದ ಆಸ್ಪತ್ರೆಗಳು:\n${hospitals}\n\nಈ ಆಸ್ಪತ್ರೆಗಳಿಗೆ ಭೇಟಿ ನೀಡಿ ಅಥವಾ ಮುಂಚಿತವಾಗಿ ಫೋನ್ ಮಾಡಿ. ಅಗತ್ಯವಿದ್ದರೆ 108 ಗೆ ಕರೆ ಮಾಡಿ.`,
        hi: `🏥 आपके नजदीकी अस्पताल:\n${hospitals}\n\nइन अस्पतालों पर जाएं या पहले फोन करें। आवश्यक होने पर 108 पर कॉल करें।`,
        en: `🏥 Nearby hospitals:\n${hospitals}\n\nVisit these hospitals or call them in advance. Call 108 if needed.`,
      };
      return responses[language] || responses.en;
    }

    // No hospitals found
    if (intentData.intent === 'find_hospital') {
      const responses = {
        kn: '😕 ನಿಮ್ಮ ಹತ್ತಿರ ಯಾವುದೇ ಆಸ್ಪತ್ರೆಗಳು ಸಿಗಲಿಲ್ಲ. ದಯವಿಟ್ಟು ನಿಮ್ಮ ಹುಡುಕಾಟದ ತ್ರಿಜ್ಯವನ್ನು ವಿಸ್ತರಿಸಿ ಅಥವಾ 108 ಗೆ ಕರೆ ಮಾಡಿ.',
        hi: '😕 आपके पास कोई अस्पताल नहीं मिला। कृपया अपनी खोज त्रिज्या बढ़ाएं या 108 पर कॉल करें।',
        en: '😕 No hospitals found near you. Please expand your search radius or call 108.',
      };
      return responses[language] || responses.en;
    }

    // General health response
    const responses = {
      kn: '💡 ನಿಮ್ಮ ಆರೋಗ್ಯ ಸಮಸ್ಯೆಯನ್ನು ವಿವರವಾಗಿ ಹೇಳಿ. ನಾನು ನಿಮಗೆ ಸಹಾಯ ಮಾಡಲು ಪ್ರಯತ್ನಿಸುತ್ತೇನೆ. ಉದಾಹರಣೆಗೆ: "ನನಗೆ ಜ್ವರ ಮತ್ತು ತಲೆನೋವು ಇದೆ"',
      hi: '💡 अपनी स्वास्थ्य समस्या के बारे में विस्तार से बताएं। मैं आपकी मदद करने की कोशिश करूंगा। उदाहरण: "मुझे बुखार और सिरदर्द है"',
      ta: '💡 உங்கள் உடல்நலப் பிரச்சினையை விரிவாகக் கூறுங்கள். நான் உங்களுக்கு உதவ முயற்சிக்கிறேன். எடுத்துக்காட்டு: "எனக்கு காய்ச்சல் மற்றும் தலைவலி உள்ளது"',
      en: '💡 Tell me about your health concern. I\'ll try to help you. For example: "I have a fever and headache"',
    };
    return responses[language] || responses.en;
  }

  /**
   * Get the current status of the service
   */
  getStatus() {
    return {
      isAvailable: this.isAvailable,
      modelName: this.modelName,
      hasApiKey: !!process.env.GEMINI_API_KEY,
      apiKeyLength: process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.length : 0,
    };
  }
}

// Export a singleton instance
module.exports = new GeminiService();