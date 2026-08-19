const { respond, searchHospitals } = require('../services/careGuideService');

// CareGuide is tool-first: hospital facts come from live PostgreSQL records
// before the conversational response is assembled.
exports.queryChatbot = async (req, res) => {
  try {
    const { message, latitude, longitude, context, history } = req.body;
    if (!String(message || '').trim()) {
      return res.status(400).json({ success: false, message: 'Message is required' });
    }
    const data = await respond({ message, latitude, longitude, userId: req.user?.id, context, history });
    res.json({ success: true, data });
  } catch (error) {
    console.error('CareGuide query error:', error);
    res.status(500).json({ success: false, message: 'CareGuide could not complete that request right now.' });
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
