const CAREGUIDE_SYSTEM_PROMPT = `You are CareGuide, an AI health assistant inside a Smart Hospital Management System.

Respond to the user's CURRENT message. Use conversation history only when it clarifies a reference such as "it" or "that"; switch topics immediately when the user introduces a new one. Understand typos, informal language, incomplete sentences, and mixed English/Kannada/Hindi input. Be warm and concise. Do not diagnose with certainty, prescribe medicine, fabricate medical facts, doctors, hospitals, availability, records, or test results. For symptoms, explain possible causes, safe next steps, and red flags. For emotional concerns, respond empathetically rather than forcing a symptom questionnaire. If database information is supplied, it is the only source of truth for doctor or hospital facts.

The user communication language is supplied in the current user message context. Respond entirely and naturally in that language: English (en), Kannada (kn), or Hindi (hi). This includes medical explanations, questions, and safety guidance. Do not switch to English merely for medical terms; an English term in parentheses is permitted only when it aids understanding. Preserve entity IDs and official data; use provided display values for localized presentation.

DATABASE_CONTEXT is authoritative whenever it contains hospitals, doctors, availability, ratings, distances, appointments, or resources. Use only those records. Never invent, guess, rename, or add a hospital, doctor, distance, availability, rating, department, specialty, service, or appointment slot. If a requested fact is absent from DATABASE_CONTEXT, say it is not available.

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

async function generateCareGuideReply({ message, history, databaseContext, language = 'en' }) {
  const provider = 'openai';
  const messages = [
    { role: 'system', content: CAREGUIDE_SYSTEM_PROMPT },
    ...historyForModel(history),
    { role: 'user', content: `Selected communication language: ${language}\nCurrent user message:\n${message}\n\nVerified application context (may be empty):\n${JSON.stringify(databaseContext || {})}` },
  ];

  console.info(`[CareGuide] AI provider: ${provider}; history messages: ${messages.length - 2}`);
  console.info('[CareGuide] Sending request to OpenAI...');

  if (!process.env.OPENAI_API_KEY) throw new AiServiceError('OPENAI_API_KEY is not configured.');

  const OPENAI_BASE = (process.env.OPENAI_API_BASE || 'https://api.openai.com/v1').replace(/\/$/, '');
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const temperature = Number(process.env.OPENAI_TEMPERATURE || 0.2);
  const maxTokens = Number(process.env.OPENAI_MAX_TOKENS || 1200);
  const enableModeration = String(process.env.OPENAI_ENABLE_MODERATION || 'false').toLowerCase() === 'true';

  const authHeader = `Bearer ${process.env.OPENAI_API_KEY}`;

  // Optional moderation
  if (enableModeration) {
    try {
      const mod = await postJson(`${OPENAI_BASE}/moderations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: authHeader },
        body: JSON.stringify({ model: 'omni-moderation-latest', input: message }),
      });
      if (Array.isArray(mod.results) && mod.results[0]?.flagged) {
        throw new AiServiceError('User input flagged by moderation.');
      }
    } catch (err) {
      console.warn('[CareGuide] Moderation check failed, continuing:', err?.message || err);
    }
  }

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const maxAttempts = Number(process.env.OPENAI_MAX_RETRIES || 3);
  let attempt = 0;
  let lastErr = null;
  let content = null;

  while (attempt < maxAttempts) {
    try {
      const payload = {
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
        n: 1
      };

      const json = await postJson(`${OPENAI_BASE}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: authHeader,
        },
        body: JSON.stringify(payload),
      });

      if (json.usage) {
        console.info(`[CareGuide] OpenAI usage: prompt_tokens=${json.usage.prompt_tokens}, completion_tokens=${json.usage.completion_tokens}, total_tokens=${json.usage.total_tokens}`);
      }

      content = json.choices?.[0]?.message?.content;
      break;
    } catch (err) {
      lastErr = err;
      attempt++;
      const status = err && err.message && err.message.match(/HTTP (\d{3})/)?.[1];
      if (status && Number(status) >= 400 && Number(status) < 500 && Number(status) !== 429) {
        throw err;
      }
      const backoffMs = Math.min(1000 * Math.pow(2, attempt), 20000);
      console.warn(`[CareGuide] OpenAI request failed (attempt ${attempt}/${maxAttempts}): ${err}. Retrying in ${backoffMs}ms`);
      await sleep(backoffMs);
    }
  }

  if (!content && lastErr) {
    throw new AiServiceError('AI provider returned an error after retries', lastErr);
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