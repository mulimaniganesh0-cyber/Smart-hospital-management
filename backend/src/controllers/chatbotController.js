// src/controllers/chatbotController.js
const { pool } = require('../config/database');

/**
 * CareGuide AI Chatbot Controller
 * Provides intelligent responses with live database queries
 * and appropriate health disclaimers.
 */

const HEALTH_DISCLAIMER = '\n\n⚠️ **Disclaimer:** This information is for guidance only and does not replace professional medical advice. Please consult a qualified healthcare professional for diagnosis and treatment.';

// Intent detection patterns
const INTENTS = {
  HOSPITAL_SEARCH: /hospital|nearby|find hospital|closest hospital/i,
  BED_AVAILABILITY: /bed|beds|available bed|icu|ventilator|oxygen/i,
  BLOOD_BANK: /blood|blood bank|blood group|donate blood|blood availability/i,
  APPOINTMENT: /appointment|book|schedule|doctor|consultation/i,
  EMERGENCY: /emergency|urgent|sos|108|ambulance|accident/i,
  SYMPTOM: /symptom|pain|fever|headache|cough|cold|nausea|dizzy|chest pain|breathing|vomit/i,
  MEDICINE: /medicine|drug|tablet|prescription|pharmacy/i,
  INSURANCE: /insurance|claim|coverage|cashless/i,
  GREETING: /^(hi|hello|hey|good morning|good evening|good afternoon|namaste)/i,
  THANKS: /thank|thanks|thx|appreciate/i,
  HELP: /help|support|guide|what can you do/i,
};

const CAREGUIDE_INSTRUCTIONS = `You are CareGuide, the compassionate AI assistant in a Smart Hospital app.
Help users understand hospital services, appointments, emergency steps, blood-bank services, and general health questions in clear, natural language. Keep responses concise and practical.

Safety rules:
- Do not diagnose, prescribe medication, or give dosage instructions.
- For chest pain, breathing difficulty, severe bleeding, loss of consciousness, stroke symptoms, or an immediate danger, tell the user to call local emergency services (108/112 in India) now.
- Explain that health information is educational and encourage professional care for diagnosis or treatment.
- Never invent hospital availability, appointment status, or blood stock. Direct users to the relevant app screen when live data is required.`;

function extractResponseText(response) {
  if (typeof response.output_text === 'string' && response.output_text.trim()) {
    return response.output_text.trim();
  }

  return (response.output || [])
    .filter((item) => item.type === 'message')
    .flatMap((item) => item.content || [])
    .filter((part) => part.type === 'output_text' || part.type === 'text')
    .map((part) => part.text || '')
    .join('\n')
    .trim();
}

function getConversationHistory(history) {
  return Array.isArray(history)
    ? history
        .filter((item) => item && ['user', 'assistant'].includes(item.role) && typeof item.content === 'string')
        .slice(-12)
        .map((item) => ({ role: item.role, content: item.content.slice(0, 4000) }))
    : [];
}

async function generateOllamaResponse({ message, history }) {
  const baseUrl = (process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').replace(/\/$/, '');
  const ollamaResponse = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(60000),
    body: JSON.stringify({
      model: process.env.OLLAMA_MODEL || 'llama3.2:3b',
      messages: [
        { role: 'system', content: CAREGUIDE_INSTRUCTIONS },
        ...getConversationHistory(history),
        { role: 'user', content: message },
      ],
      stream: false,
      options: { temperature: 0.6 },
    }),
  });

  if (!ollamaResponse.ok) {
    const detail = await ollamaResponse.text();
    throw new Error(`Ollama request failed (${ollamaResponse.status}): ${detail.slice(0, 300)}`);
  }

  const responseBody = await ollamaResponse.json();
  return responseBody.message?.content?.trim() || null;
}

async function generateOpenAiResponse({ message, history, userId }) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  const priorMessages = getConversationHistory(history);

  const aiResponse = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || 'gpt-5.6-terra',
      instructions: CAREGUIDE_INSTRUCTIONS,
      input: [...priorMessages, { role: 'user', content: message }],
      max_output_tokens: 700,
      safety_identifier: userId ? `hospital-user-${userId}` : undefined,
    }),
  });

  if (!aiResponse.ok) {
    const detail = await aiResponse.text();
    throw new Error(`OpenAI request failed (${aiResponse.status}): ${detail.slice(0, 300)}`);
  }

  const responseBody = await aiResponse.json();
  return extractResponseText(responseBody) || null;
}

async function generateAiResponse(args) {
  const provider = (process.env.CHATBOT_PROVIDER || 'ollama').toLowerCase();
  if (provider === 'openai') return generateOpenAiResponse(args);
  if (provider === 'ollama') return generateOllamaResponse(args);
  throw new Error(`Unsupported CHATBOT_PROVIDER: ${provider}`);
}

exports.queryChatbot = async (req, res) => {
  try {
    const { message, latitude, longitude, history } = req.body;
    const userId = req.user?.id;

    if (!message || message.trim().length === 0) {
      return res.status(400).json({ success: false, message: 'Message is required' });
    }

    const query = message.toLowerCase().trim();
    let response = '';
    let hospitalData = null;
    let bloodData = null;

    // Use a real conversational model whenever an API key is configured.
    // The existing deterministic flows below remain a useful offline fallback.
    try {
      const aiResponse = await generateAiResponse({ message: message.trim(), history, userId });
      if (aiResponse) {
        return res.json({ success: true, data: { response: aiResponse, type: 'ai' } });
      }
    } catch (aiError) {
      console.error('CareGuide AI unavailable:', aiError.message);
      return res.status(503).json({
        success: false,
        code: 'ai_unavailable',
        message: 'CareGuide AI is temporarily unavailable. Start Ollama and make sure the configured model has been downloaded, then try again.',
      });
    }

    // ========== GREETING ==========
    if (INTENTS.GREETING.test(query)) {
      response = "Hello! 👋 I'm CareGuide, your Smart Hospital assistant. I can help you with:\n\n"
        + "🏥 Find nearby hospitals & bed availability\n"
        + "🩸 Blood bank information\n"
        + "📅 Appointment booking guidance\n"
        + "🚑 Emergency assistance\n"
        + "💊 General health guidance\n\n"
        + "How can I help you today?";
      return res.json({ success: true, data: { response, type: 'greeting' } });
    }

    // ========== THANKS ==========
    if (INTENTS.THANKS.test(query)) {
      response = "You're welcome! 😊 I'm glad I could help. Stay healthy and don't hesitate to ask if you need anything else! 🏥";
      return res.json({ success: true, data: { response, type: 'thanks' } });
    }

    // ========== HELP ==========
    if (INTENTS.HELP.test(query)) {
      response = "I can help you with:\n\n"
        + "📍 **\"Find nearby hospitals\"** — I'll search for hospitals near you\n"
        + "🛏️ **\"Check bed availability\"** — Real-time bed, ICU, ventilator status\n"
        + "🩸 **\"Blood availability\"** — Check blood group stock across hospitals\n"
        + "📅 **\"Book appointment\"** — Step-by-step booking guide\n"
        + "🚑 **\"Emergency help\"** — Immediate emergency guidance\n"
        + "🤒 **\"I have fever\"** — General symptom guidance\n\n"
        + "Just type your question naturally!";
      return res.json({ success: true, data: { response, type: 'help' } });
    }

    // ========== EMERGENCY ==========
    if (INTENTS.EMERGENCY.test(query)) {
      // Find nearest hospitals with emergency services
      let emergencyHospitals = [];
      try {
        const result = await pool.query(
          `SELECT h.name, h.phone, h.address, h.city,
                  hr.general_beds_available, hr.icu_beds_available
           FROM hospitals h
           LEFT JOIN hospital_resources hr ON h.id = hr.hospital_id
           WHERE h.emergency_services = true AND h.is_verified = true
           LIMIT 3`
        );
        emergencyHospitals = result.rows;
      } catch (e) {
        console.log('Emergency hospital query error:', e.message);
      }

      response = "🚨 **EMERGENCY ASSISTANCE** 🚨\n\n"
        + "**Immediate Steps:**\n"
        + "1. 📞 Call **108** (National Ambulance) or **112** (Emergency)\n"
        + "2. 🆘 Use the **SOS Button** in the app for instant help\n"
        + "3. Stay calm and provide your exact location\n\n";

      if (emergencyHospitals.length > 0) {
        response += "**Nearby Emergency Hospitals:**\n";
        emergencyHospitals.forEach((h, i) => {
          response += `${i + 1}. 🏥 **${h.name}** — ${h.address || h.city}\n`;
          response += `   📞 ${h.phone || 'N/A'} | Beds: ${h.general_beds_available || '?'} | ICU: ${h.icu_beds_available || '?'}\n`;
        });
      }

      response += HEALTH_DISCLAIMER;
      return res.json({ success: true, data: { response, type: 'emergency', hospitals: emergencyHospitals } });
    }

    // ========== HOSPITAL SEARCH ==========
    if (INTENTS.HOSPITAL_SEARCH.test(query)) {
      try {
        const result = await pool.query(
          `SELECT h.id, h.name, h.address, h.city, h.phone, h.rating,
                  h.emergency_services, h.is_verified,
                  hr.general_beds_available, hr.general_beds_total,
                  hr.icu_beds_available, hr.icu_beds_total,
                  hr.ventilators_available
           FROM hospitals h
           LEFT JOIN hospital_resources hr ON h.id = hr.hospital_id
           WHERE h.is_verified = true
           ORDER BY h.rating DESC
           LIMIT 5`
        );
        hospitalData = result.rows;
      } catch (e) {
        console.log('Hospital search error:', e.message);
      }

      if (hospitalData && hospitalData.length > 0) {
        response = "🏥 **Top Hospitals Found:**\n\n";
        hospitalData.forEach((h, i) => {
          response += `**${i + 1}. ${h.name}** ⭐ ${h.rating || 'N/A'}\n`;
          response += `   📍 ${h.address || h.city || 'N/A'}\n`;
          response += `   🛏️ Beds: ${h.general_beds_available || 0}/${h.general_beds_total || 0}`;
          response += ` | ICU: ${h.icu_beds_available || 0}/${h.icu_beds_total || 0}\n`;
          if (h.emergency_services) response += `   🚑 24/7 Emergency Available\n`;
          response += '\n';
        });
        response += "Use the **Nearby Hospitals** tab for more details and navigation.";
      } else {
        response = "I couldn't find hospitals right now. Please use the **Nearby Hospitals** tab to browse available facilities.";
      }

      return res.json({ success: true, data: { response, type: 'hospital', hospitals: hospitalData } });
    }

    // ========== BED AVAILABILITY ==========
    if (INTENTS.BED_AVAILABILITY.test(query)) {
      try {
        const result = await pool.query(
          `SELECT h.name,
                  hr.general_beds_available, hr.general_beds_total,
                  hr.icu_beds_available, hr.icu_beds_total,
                  hr.ventilators_available, hr.ventilators_total,
                  hr.oxygen_supported_beds_available
           FROM hospitals h
           JOIN hospital_resources hr ON h.id = hr.hospital_id
           WHERE h.is_verified = true AND (hr.general_beds_available > 0 OR hr.icu_beds_available > 0)
           ORDER BY hr.general_beds_available DESC
           LIMIT 5`
        );
        hospitalData = result.rows;
      } catch (e) {
        console.log('Bed availability query error:', e.message);
      }

      if (hospitalData && hospitalData.length > 0) {
        response = "🛏️ **Real-Time Bed Availability:**\n\n";
        hospitalData.forEach((h, i) => {
          response += `**${i + 1}. ${h.name}**\n`;
          response += `   • General Beds: ${h.general_beds_available}/${h.general_beds_total}\n`;
          response += `   • ICU Beds: ${h.icu_beds_available}/${h.icu_beds_total}\n`;
          response += `   • Ventilators: ${h.ventilators_available}/${h.ventilators_total}\n`;
          if (h.oxygen_supported_beds_available > 0) {
            response += `   • O₂ Beds: ${h.oxygen_supported_beds_available}\n`;
          }
          response += '\n';
        });
        response += "📊 Data is updated in real-time.";
      } else {
        response = "Currently unable to fetch bed availability. Please check the **Nearby Hospitals** screen for live data.";
      }

      return res.json({ success: true, data: { response, type: 'beds', hospitals: hospitalData } });
    }

    // ========== BLOOD BANK ==========
    if (INTENTS.BLOOD_BANK.test(query)) {
      try {
        const result = await pool.query(
          `SELECT bb.blood_group, SUM(bb.units_available) as total_units,
                  COUNT(DISTINCT bb.hospital_id) as hospital_count
           FROM blood_bank bb
           JOIN hospitals h ON bb.hospital_id = h.id
           WHERE h.is_verified = true AND bb.units_available > 0
           GROUP BY bb.blood_group
           ORDER BY bb.blood_group`
        );
        bloodData = result.rows;
      } catch (e) {
        console.log('Blood bank query error:', e.message);
      }

      if (bloodData && bloodData.length > 0) {
        response = "🩸 **Blood Availability Across All Hospitals:**\n\n";
        response += "| Blood Group | Units Available | Hospitals |\n";
        response += "|---|---|---|\n";
        bloodData.forEach(b => {
          const status = b.total_units > 20 ? '🟢' : b.total_units > 5 ? '🟡' : '🔴';
          response += `| ${status} ${b.blood_group} | ${b.total_units} units | ${b.hospital_count} |\n`;
        });
        response += "\n**Need blood urgently?** Use the Blood Bank tab to request blood from a specific hospital.";
      } else {
        response = "Blood bank data is currently unavailable. Please check the **Blood Bank** section for live stock information.";
      }

      return res.json({ success: true, data: { response, type: 'blood', blood: bloodData } });
    }

    // ========== APPOINTMENT ==========
    if (INTENTS.APPOINTMENT.test(query)) {
      response = "📅 **How to Book an Appointment:**\n\n"
        + "1. Go to the **Nearby Hospitals** tab\n"
        + "2. Select a hospital\n"
        + "3. View available doctors and specialties\n"
        + "4. Tap **Book Appointment**\n"
        + "5. Choose your preferred date and time\n"
        + "6. Confirm your booking\n\n"
        + "💡 **Tip:** You can also check doctor availability before booking!\n"
        + "📱 Your appointments appear in the **Dashboard** section.";
      return res.json({ success: true, data: { response, type: 'appointment' } });
    }

    // ========== SYMPTOM GUIDANCE ==========
    if (INTENTS.SYMPTOM.test(query)) {
      response = "🩺 **Health Guidance:**\n\n"
        + "Based on your query, here are some general recommendations:\n\n"
        + "• 🌡️ **Fever/Cold:** Rest, stay hydrated, take paracetamol if needed\n"
        + "• 🤕 **Headache:** Rest in a dark room, stay hydrated\n"
        + "• 😰 **Chest Pain:** Seek immediate medical attention — use SOS button\n"
        + "• 🤢 **Nausea/Vomiting:** Small sips of water, avoid heavy food\n"
        + "• 😵 **Dizziness:** Sit down safely, drink water, avoid sudden movements\n"
        + "• 😮‍💨 **Breathing Difficulty:** Use SOS button or call 108 immediately\n\n"
        + "**When to see a doctor:**\n"
        + "• Symptoms persist for more than 2-3 days\n"
        + "• High fever (>102°F / 39°C)\n"
        + "• Severe pain or difficulty breathing\n"
        + "• Any sudden or worsening symptoms"
        + HEALTH_DISCLAIMER;
      return res.json({ success: true, data: { response, type: 'symptom' } });
    }

    // ========== MEDICINE ==========
    if (INTENTS.MEDICINE.test(query)) {
      response = "💊 **Medicine & Pharmacy Information:**\n\n"
        + "Our system primarily focuses on hospital resources. For medicines:\n\n"
        + "• Check with the hospital pharmacy during your visit\n"
        + "• Ask your doctor for a prescription\n"
        + "• Many hospitals have in-house pharmacies\n\n"
        + "⚠️ Never self-medicate. Always consult a doctor before taking any medication."
        + HEALTH_DISCLAIMER;
      return res.json({ success: true, data: { response, type: 'medicine' } });
    }

    // ========== INSURANCE ==========
    if (INTENTS.INSURANCE.test(query)) {
      response = "🛡️ **Insurance & Claims:**\n\n"
        + "Insurance information depends on your provider and hospital. General tips:\n\n"
        + "• Check if your hospital is on your insurer's network\n"
        + "• Carry your insurance card during hospital visits\n"
        + "• Contact the hospital's TPA/insurance desk for cashless treatment\n"
        + "• Keep all bills and prescriptions for reimbursement claims\n\n"
        + "📞 Contact your insurance company's helpline for specific queries.";
      return res.json({ success: true, data: { response, type: 'insurance' } });
    }

    // ========== DEFAULT / UNKNOWN ==========
    response = "I appreciate your question! While I may not have a specific answer for that, I can help you with:\n\n"
      + "🏥 **Hospital search** — \"Find nearby hospitals\"\n"
      + "🛏️ **Bed availability** — \"Check ICU beds\"\n"
      + "🩸 **Blood bank** — \"Blood availability\"\n"
      + "📅 **Appointments** — \"Book an appointment\"\n"
      + "🚑 **Emergencies** — \"Emergency help\"\n"
      + "🤒 **Symptoms** — \"I have a headache\"\n\n"
      + "Try rephrasing your question or type **help** for more options!";

    res.json({ success: true, data: { response, type: 'default' } });
  } catch (error) {
    console.error('Chatbot query error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};
