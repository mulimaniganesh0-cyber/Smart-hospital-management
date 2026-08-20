const CAREGUIDE_SYSTEM_PROMPT = `You are CareGuide, an AI health assistant inside a Smart Hospital Management System.

Respond to the user's CURRENT message. Use conversation history only when it clarifies a reference such as "it" or "that"; switch topics immediately when the user introduces a new one. Understand typos, informal language, and incomplete sentences. Be warm and concise. Do not diagnose with certainty, prescribe medicine, fabricate medical facts, doctors, hospitals, availability, records, or test results. For symptoms, explain possible causes, safe next steps, and red flags. For emotional concerns, respond empathetically rather than forcing a symptom questionnaire. If database information is supplied, it is the only source of truth for doctor or hospital facts.

Return ONLY valid JSON in this shape:
{"intent":"short_snake_case_label","topic":"short_label","specialization":"specialty or null","needs_doctor_recommendation":false,"response":"patient-facing response"}`;

class AiServiceError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = 'AiServiceError';
    this.code = 'AI_SERVICE_UNAVAILABLE';
    this.cause = cause;
  }
}

function historyForModel(history) {
  if (!Array.isArray(history)) return [];
  return history
    .filter((item) => item && ['user', 'assistant'].includes(item.role) && typeof item.content === 'string')
    .slice(-12)
    .map(({ role, content }) => ({ role, content: content.slice(0, 4000) }));
}

function parseModelJson(content) {
  const source = String(content || '').trim().replace(/^```json\s*|\s*```$/g, '');
  const parsed = JSON.parse(source);
  if (!parsed || typeof parsed.response !== 'string' || !parsed.response.trim()) {
    throw new Error('AI response did not contain a patient-facing response');
  }
  return {
    intent: typeof parsed.intent === 'string' ? parsed.intent : 'general_conversation',
    topic: typeof parsed.topic === 'string' ? parsed.topic : 'general_health',
    specialization: typeof parsed.specialization === 'string' ? parsed.specialization : null,
    needsDoctorRecommendation: parsed.needs_doctor_recommendation === true,
    response: parsed.response.trim(),
  };
}

async function postJson(url, options) {
  let response;
  try {
    response = await fetch(url, options);
  } catch (error) {
    throw new AiServiceError('Unable to reach the configured AI provider.', error);
  }
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new AiServiceError(`AI provider returned HTTP ${response.status}${body ? `: ${body.slice(0, 300)}` : ''}`);
  }
  return response.json();
}

async function generateCareGuideReply({ message, history, databaseContext }) {
  const provider = (process.env.CHATBOT_PROVIDER || 'ollama').toLowerCase();
  const messages = [
    { role: 'system', content: CAREGUIDE_SYSTEM_PROMPT },
    ...historyForModel(history),
    { role: 'user', content: `Current user message:\n${message}\n\nVerified application context (may be empty):\n${JSON.stringify(databaseContext || {})}` },
  ];
  console.info(`[CareGuide] AI provider: ${provider}; history messages: ${messages.length - 2}`);
  console.info('[CareGuide] Sending request to AI...');

  let content;
  if (provider === 'openai') {
    if (!process.env.OPENAI_API_KEY) throw new AiServiceError('OPENAI_API_KEY is not configured.');
    const json = await postJson('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({ model: process.env.OPENAI_MODEL || 'gpt-4o-mini', messages, response_format: { type: 'json_object' } }),
    });
    content = json.choices?.[0]?.message?.content;
  } else if (provider === 'ollama') {
    const baseUrl = (process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').replace(/\/$/, '');
    const json = await postJson(`${baseUrl}/api/chat`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: process.env.OLLAMA_MODEL || 'llama3.2:3b', messages, stream: false, format: 'json' }),
    });
    content = json.message?.content;
  } else {
    throw new AiServiceError(`Unsupported CHATBOT_PROVIDER: ${provider}`);
  }

  try {
    const reply = parseModelJson(content);
    console.info(`[CareGuide] AI response received; intent: ${reply.intent}; specialty: ${reply.specialization || 'none'}`);
    return { ...reply, provider };
  } catch (error) {
    if (error instanceof AiServiceError) throw error;
    throw new AiServiceError('The AI provider returned an invalid response.', error);
  }
}

module.exports = { AiServiceError, generateCareGuideReply, CAREGUIDE_SYSTEM_PROMPT };
