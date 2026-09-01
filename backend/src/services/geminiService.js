class GeminiServiceError extends Error {
  constructor(message, { code = 'GEMINI_API_ERROR', cause, status, details } = {}) {
    super(message);
    this.name = 'GeminiServiceError';
    this.code = code;
    this.cause = cause;
    this.status = status;
    this.details = details;
  }
}

function isGeminiConfigured() {
  return Boolean(String(process.env.GEMINI_API_KEY || '').trim() && String(process.env.GEMINI_MODEL || '').trim());
}

async function generateMedicalAnswer({ message, history = [], language = 'en', patientEmotion = 'NEUTRAL_CALM' }) {
  if (!isGeminiConfigured()) {
    throw new GeminiServiceError('Gemini is not configured. Add GEMINI_API_KEY and GEMINI_MODEL to backend/.env, then restart the backend.', { code: 'GEMINI_CONFIGURATION_ERROR' });
  }
  const model = process.env.GEMINI_MODEL.trim();
  const languageName = { en: 'English', kn: 'Kannada', hi: 'Hindi' }[language] || 'English';
  const recentHistory = history.filter((item) => item && typeof item.content === 'string').slice(-8)
    .map((item) => `${item.role}: ${item.content.slice(0, 1200)}`).join('\n');
  const prompt = `You are CareGuide's warm, empathetic, and human-friendly medical assistant. Reply completely in ${languageName}.
Always adopt a gentle, reassuring bedside manner. Acknowledge any patient worry, anxiety, or pain with genuine care before sharing medical guidance.
Answer the CURRENT question, using history only to resolve a short reference. Do not diagnose with certainty, prescribe medication doses, or invent doctors, hospitals, availability, appointments, or database facts. Give safe, understandable, supportive medical information, self-care where appropriate, and urgent warning signs when necessary.

History:
${recentHistory}

Current question:
${message}`;
  let response;
  try {
    response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(process.env.GEMINI_API_KEY)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0.2, maxOutputTokens: 900 } }),
    });
  } catch (error) {
    throw new GeminiServiceError('Gemini network request failed.', { code: 'GEMINI_NETWORK_ERROR', cause: error });
  }
  if (!response.ok) {
    const details = await response.text().catch(() => '');
    const code = response.status === 401 || response.status === 403 ? 'GEMINI_AUTHENTICATION_ERROR'
      : response.status === 429 ? 'GEMINI_QUOTA_ERROR'
        : response.status === 400 || response.status === 404 ? 'GEMINI_INVALID_MODEL_ERROR'
          : 'GEMINI_API_ERROR';
    console.error(`[Gemini] Request failed: HTTP ${response.status}${details ? `: ${details.slice(0, 500)}` : ''}`);
    throw new GeminiServiceError(`Gemini request failed with HTTP ${response.status}.`, { code, status: response.status, details });
  }
  let body;
  try {
    body = await response.json();
  } catch (error) {
    throw new GeminiServiceError('Gemini returned an invalid JSON response.', { code: 'GEMINI_RESPONSE_PARSING_ERROR', cause: error });
  }
  const content = body.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('').trim();
  if (!content) throw new GeminiServiceError('Gemini returned no medical answer.', { code: 'GEMINI_RESPONSE_PARSING_ERROR' });
  console.info('[Gemini] Response received');
  return { source: 'gemini', available: true, content };
}

module.exports = { GeminiServiceError, isGeminiConfigured, generateMedicalAnswer };
