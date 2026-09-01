class OllamaServiceError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = 'OllamaServiceError';
    this.code = 'OLLAMA_UNAVAILABLE';
    this.cause = cause;
  }
}

function isOllamaConfigured() { return Boolean(process.env.OLLAMA_BASE_URL && process.env.OLLAMA_MODEL); }

function ollamaBaseUrl() { return (process.env.OLLAMA_BASE_URL || 'http://localhost:11434').replace(/\/$/, ''); }

// A local 3B model may need a few seconds to load, but this remains bounded
// so an unavailable or stalled Ollama process never blocks a request forever.
const OLLAMA_TIMEOUT_MS = Number.parseInt(process.env.OLLAMA_TIMEOUT_MS || '45000', 10);
const OLLAMA_MAX_CONCURRENT = Math.max(1, Math.min(Number.parseInt(process.env.OLLAMA_MAX_CONCURRENT || '1', 10) || 1, 4));
let activeGenerations = 0;
const generationQueue = [];
let modelCheck = { available: null, checkedAt: 0 };

function runGeneration(task) {
  return new Promise((resolve, reject) => {
    const run = async () => {
      activeGenerations += 1;
      try { resolve(await task()); } catch (error) { reject(error); }
      finally {
        activeGenerations -= 1;
        const next = generationQueue.shift();
        if (next) next();
      }
    };
    if (activeGenerations < OLLAMA_MAX_CONCURRENT) run();
    else {
      console.info(`[OLLAMA] Generation queued; active=${activeGenerations}; limit=${OLLAMA_MAX_CONCURRENT}`);
      generationQueue.push(run);
    }
  });
}

async function ollamaFetch(path, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number.isFinite(OLLAMA_TIMEOUT_MS) && OLLAMA_TIMEOUT_MS > 0 ? OLLAMA_TIMEOUT_MS : 60000);
  try {
    return await fetch(`${ollamaBaseUrl()}${path}`, { ...options, signal: controller.signal });
  } catch (error) {
    if (error.name === 'AbortError') throw new OllamaServiceError('The local medical-answer service took too long to respond.', error);
    throw new OllamaServiceError('Ollama service is currently unavailable.', error);
  } finally {
    clearTimeout(timeout);
  }
}

async function assertConfiguredModelAvailable() {
  if (!isOllamaConfigured()) throw new OllamaServiceError('Ollama service is not configured. Set OLLAMA_BASE_URL and OLLAMA_MODEL.');
  // Avoid an /api/tags round trip before every medical response.  A short
  // cache still detects a stopped service promptly without slowing requests.
  if (modelCheck.available === true && Date.now() - modelCheck.checkedAt < 60_000) return;
  let response;
  try {
    response = await ollamaFetch('/api/tags');
  } catch (error) {
    if (error instanceof OllamaServiceError) throw error;
    throw new OllamaServiceError('Unable to verify the configured Ollama model.', error);
  }
  if (!response.ok) { modelCheck = { available: false, checkedAt: Date.now() }; throw new OllamaServiceError(`Unable to verify the configured Ollama model (HTTP ${response.status}).`); }
  const body = await response.json().catch((error) => { throw new OllamaServiceError('Ollama returned an invalid model list.', error); });
  const model = process.env.OLLAMA_MODEL;
  if (!Array.isArray(body.models) || !body.models.some((item) => item && item.name === model)) {
    modelCheck = { available: false, checkedAt: Date.now() };
    throw new OllamaServiceError(`Configured Ollama model "${model}" was not found. Run: ollama pull ${model}`);
  }
  modelCheck = { available: true, checkedAt: Date.now() };
}

async function generateResponse({ prompt, temperature = 0.2 }) {
  return runGeneration(async () => {
    await assertConfiguredModelAvailable();
    const startedAt = Date.now();
    let response;
    try {
      console.info(`[OLLAMA] Generation started; model=${process.env.OLLAMA_MODEL}; active=${activeGenerations}/${OLLAMA_MAX_CONCURRENT}`);
      response = await ollamaFetch('/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: process.env.OLLAMA_MODEL, prompt, stream: false, keep_alive: process.env.OLLAMA_KEEP_ALIVE || '10m', options: { temperature, num_predict: Number.parseInt(process.env.OLLAMA_NUM_PREDICT || '180', 10), num_ctx: 4096 } }) });
    } catch (error) { modelCheck.available = false; if (error instanceof OllamaServiceError) throw error; throw new OllamaServiceError('Ollama service is currently unavailable.', error); }
    if (!response.ok) throw new OllamaServiceError(`Ollama generation failed (HTTP ${response.status}).`);
    const body = await response.json().catch((error) => { throw new OllamaServiceError('Ollama returned an invalid generation response.', error); });
    const content = String(body.response || '').trim();
    if (!content) throw new OllamaServiceError('Ollama returned an empty response.');
    console.info(`[OLLAMA] Generation completed: ${Date.now() - startedAt}ms`);
    return content;
  });
}

async function getOllamaHealth() {
  try { await assertConfiguredModelAvailable(); return { available: true, model: process.env.OLLAMA_MODEL }; }
  catch (error) { return { available: false, model: process.env.OLLAMA_MODEL || null, error: error.code || 'OLLAMA_UNAVAILABLE' }; }
}

async function extractMedicalRouting({ message, context = {} }) {
  if (!isOllamaConfigured()) throw new OllamaServiceError('Ollama service is not configured.');
  const prompt = `Return JSON only. You are an intent and medical-specialty extractor for a hospital app. Never provide hospital, doctor, availability, or appointment facts. Analyze this message and return {"specialty":string|null,"symptoms":string[],"needs_doctor":boolean,"needs_hospital":boolean,"emergency":boolean}. Use a broad medical specialty only when appropriate. Context: ${JSON.stringify(context)}. Current message: ${message}`;
  let response;
  try {
    console.info('[Ollama] Request sent');
    response = await fetch(`${ollamaBaseUrl()}/api/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: process.env.OLLAMA_MODEL, prompt, format: 'json', stream: false, options: { temperature: 0 } }) });
  } catch (error) { throw new OllamaServiceError('Ollama service is currently unavailable.', error); }
  if (!response.ok) throw new OllamaServiceError('Ollama service is currently unavailable.');
  const body = await response.json();
  try {
    const routing = JSON.parse(body.response || '{}');
    console.info('[Ollama] Response received');
    return { specialty: typeof routing.specialty === 'string' ? routing.specialty : null, symptoms: Array.isArray(routing.symptoms) ? routing.symptoms.filter((value) => typeof value === 'string').slice(0, 6) : [], emergency: routing.emergency === true };
  } catch (error) { throw new OllamaServiceError('Ollama returned an invalid routing response.', error); }
}

async function generateMedicalResponse({ question, retrievedContext, conversationHistory = [], language = 'en', additionalSafeContext = '', patientAge, ageBand, medicalIntent, patientEmotion = 'NEUTRAL_CALM' }) {
  const languageName = { en: 'English', kn: 'Kannada', hi: 'Hindi' }[language] || 'English';
  const history = conversationHistory.filter((item) => item && typeof item.content === 'string').slice(-8)
    .map((item) => `${item.role === 'assistant' ? 'CareGuide' : 'User'}: ${item.content.slice(0, 800)}`).join('\n');
  
  const toneInstruction = patientEmotion === 'ANXIOUS_SCARED'
    ? 'The patient feels anxious or scared. Speak with gentle reassurance, warm empathy, and calm comfort first before sharing medical points.'
    : patientEmotion === 'IN_PAIN'
      ? 'The patient is in physical pain or discomfort. Show genuine compassion for their pain first, then provide clear, easy-to-follow guidance.'
      : patientEmotion === 'CONFUSED_OVERWHELMED'
        ? 'The patient feels confused or overwhelmed. Use simple, supportive, reassuring language to break things down gently.'
        : patientEmotion === 'SAD_DISTRESSED'
          ? 'The patient feels sad or distressed. Express sincere warmth and care for their well-being.'
          : 'Speak in a warm, friendly, human, and caring tone as a supportive healthcare guide.';

  const prompt = `You are CareGuide, a warm, caring, human-friendly healthcare assistant. Reply entirely in ${languageName}.

TONE AND EMPATHY DIRECTIVE:
${toneInstruction}
Always sound human, empathetic, and reassuring—never cold, robotic, or like a transaction script.

Rules:
* Use ONLY the medical information in RETRIEVED MEDICAL CONTEXT. Do not invent facts that are absent from it.
* Respect the supplied patient age and age band.
* Do not diagnose with certainty, prescribe medication doses, invent diseases from one symptom, or invent hospitals, doctors, appointments, availability, or database facts.
* Give a warm, concise, understandable answer (up to 70 words or 3 short bullet points) and finish with a complete supportive sentence.
* ADDITIONAL SAFE CONTEXT contains answers already supplied by the patient. Treat it as known information: do not ask for it again. Give the final practical guidance now rather than another follow-up question.
* When supported by the retrieved context, clearly cover what the information suggests, safe self-care/prevention, urgent warning signs, and when to seek professional care.
* If the context is insufficient, gently explain that the available medical knowledge is insufficient and recommend consulting a healthcare professional.

PATIENT EMOTIONAL STATE: ${patientEmotion}
PATIENT AGE: ${patientAge ?? 'Not supplied'}
PATIENT AGE BAND: ${ageBand || 'Not supplied'}
MEDICAL INTENT: ${medicalIntent || 'Not supplied'}

RETRIEVED MEDICAL CONTEXT:
${retrievedContext || '(No relevant context was retrieved.)'}

CONVERSATION CONTEXT:
${history || '(No prior context.)'}

ADDITIONAL SAFE CONTEXT:
${additionalSafeContext || '(None.)'}

USER QUESTION:
${question}`;
  return generateResponse({ prompt, temperature: 0.25 });
}

async function generateHospitalResponse({ question, retrievedContext, conversationHistory = [], language = 'en', patientEmotion = 'NEUTRAL_CALM' }) {
  const languageName = { en: 'English', kn: 'Kannada', hi: 'Hindi' }[language] || 'English';
  const history = conversationHistory.filter((item) => item && typeof item.content === 'string').slice(-6)
    .map((item) => `${item.role === 'assistant' ? 'CareGuide' : 'User'}: ${item.content.slice(0, 500)}`).join('\n');

  const prompt = `You are CareGuide, a friendly and helpful hospital guide. Reply entirely in ${languageName}.

You must answer hospital-related questions ONLY using CONTEXT retrieved from the hospital database. The context is authoritative.

Tone: Speak in a warm, polite, human, and helpful manner.

Rules:
* Never invent or assume information.
* Never use pretrained knowledge for hospital facts.
* Do not fabricate hospital names, doctors, beds, ICU availability, specialties, prices, ratings, locations, phone numbers, or services.
* If the requested information is not explicitly present in CONTEXT, reply politely: "I couldn't find this information in the hospital directory."
* If multiple hospitals match, list only the matching hospitals and their supported details in a clean, friendly format.
* Keep the answer clear and reassuring.

CONTEXT:
${retrievedContext || '(No context retrieved.)'}

CONVERSATION CONTEXT:
${history || '(No prior context.)'}

USER QUESTION:
${question}`;
  return generateResponse({ prompt, temperature: 0 });
}

module.exports = { OllamaServiceError, isOllamaConfigured, assertConfiguredModelAvailable, getOllamaHealth, extractMedicalRouting, generateResponse, generateMedicalResponse, generateHospitalResponse };
