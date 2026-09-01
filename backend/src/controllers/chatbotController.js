const { respond, searchHospitals } = require('../services/careGuideService');
const { pool } = require('../config/database');

function objectOrEmpty(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function compactHistory(history) {
  return Array.isArray(history)
    ? history.filter((item) => item && typeof item.content === 'string' && ['user', 'assistant'].includes(item.role)).slice(-12)
    : [];
}

// CareGuide is tool-first: hospital facts come from live PostgreSQL records
// before the conversational response is assembled.
exports.queryChatbot = async (req, res) => {
  const startedAt = Date.now();
  try {
    const { message, latitude, longitude, context, history, conversationHistory, language, patientAge, conversationId } = req.body;
    // Keep diagnostic logs correlatable without recording patient messages.
    console.info(`[CHATBOT] Request received; requestId=${req.body.requestId || 'none'}; conversationId=${conversationId || 'none'}; hasLocation=${Number.isFinite(Number(latitude)) && Number.isFinite(Number(longitude))}; messageLength=${String(message || '').length}`);
    if (!String(message || '').trim()) {
      return res.status(400).json({ success: false, message: 'Message is required' });
    }
    let storedState = {};
    if (conversationId) {
      const existing = await pool.query('SELECT user_id, state FROM chatbot_conversations WHERE conversation_id = $1', [conversationId]);
      if (existing.rows[0]) {
        if (Number(existing.rows[0].user_id) !== Number(req.user?.id)) {
          return res.status(403).json({ success: false, type: 'error', error: 'CONVERSATION_ACCESS_DENIED', message: 'This conversation is not available for the current user.' });
        }
        storedState = objectOrEmpty(existing.rows[0].state);
      }
    }
    const requestHistory = compactHistory(conversationHistory || history);
    const effectiveContext = { ...objectOrEmpty(storedState.context), ...objectOrEmpty(context) };
    const effectiveHistory = requestHistory.length ? requestHistory : compactHistory(storedState.history);
    const data = await respond({ message, latitude, longitude, userId: req.user?.id, language, patientAge, conversationId, context: effectiveContext, history: effectiveHistory });
    if (conversationId) {
      const nextHistory = compactHistory([...effectiveHistory, { role: 'user', content: String(message).slice(0, 800) }, { role: 'assistant', content: String(data.response || '').slice(0, 1200) }]);
      await pool.query(`INSERT INTO chatbot_conversations (conversation_id, user_id, state, updated_at)
        VALUES ($1, $2, $3::jsonb, CURRENT_TIMESTAMP)
        ON CONFLICT (conversation_id) DO UPDATE SET state = EXCLUDED.state, updated_at = CURRENT_TIMESTAMP`,
      [conversationId, req.user?.id, JSON.stringify({ context: objectOrEmpty(data.context), history: nextHistory })]);
    }
    // Keep the legacy `data` envelope for Flutter while exposing a stable
    // top-level contract for other clients and easier diagnostics.
    res.json({ success: true, conversationId: conversationId || null, type: data.type, message: data.response, ...data, data, requestId: req.body.requestId || null });
    console.info(`[CHATBOT] HTTP response: ${Date.now() - startedAt}ms`);
  } catch (error) {
    console.error(`[CHATBOT ERROR] requestId=${req.body?.requestId || 'none'}; ${error.stack || error.message || error}`);
    const databaseError = /database|connect|postgres|relation|timeout/i.test(error.message || '');
    res.status(databaseError ? 503 : 500).json({ success: false, error: databaseError ? 'DATABASE_ERROR' : 'CHATBOT_ERROR', message: databaseError ? 'Hospital information is temporarily unavailable. Please try again shortly.' : 'CareGuide could not complete that request right now.' });
  }
};

// Structured endpoint for clients and future AI tool-calling. It shares the
// exact same database search service as the chat endpoint.
exports.searchHospitals = async (req, res) => {
  try {
    const { latitude, longitude, specialty, city, emergency, icu, bloodBank, ambulance, availableBeds, sort, limit } = req.query;
    const data = await searchHospitals({
      latitude, longitude, specialty, city,
      emergency: emergency === 'true', icu: icu === 'true', bloodBank: bloodBank === 'true',
      ambulance: ambulance === 'true', availableBeds: availableBeds === 'true', sort, limit,
    });
    res.json({ success: true, count: data.length, data });
  } catch (error) {
    console.error('CareGuide hospital search error:', error);
    res.status(500).json({ success: false, message: 'Unable to search hospital records.' });
  }
};
