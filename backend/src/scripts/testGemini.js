const path = require('path');
const dotenv = require('dotenv');

const envPath = path.resolve(__dirname, '../../.env');
const loaded = dotenv.config({ path: envPath });
const { generateMedicalAnswer, isGeminiConfigured, GeminiServiceError } = require('../services/geminiService');

async function main() {
  console.info('[Gemini Test] Started');
  console.info(`[Gemini Test] dotenv path: ${envPath}`);
  if (loaded.error) throw loaded.error;
  if (!isGeminiConfigured()) {
    console.error('[Gemini Test] Configuration error: GEMINI_API_KEY and GEMINI_MODEL must both be non-blank.');
    process.exitCode = 1;
    return;
  }
  console.info('[Gemini Test] Configuration detected');
  console.info(`[Gemini Test] Model initialized: ${process.env.GEMINI_MODEL}`);
  console.info('[Gemini Test] Request sent');
  try {
    const result = await generateMedicalAnswer({ message: 'What are common symptoms of fever?', language: 'en' });
    console.info('[Gemini Test] Response received');
    console.info(result.content);
  } catch (error) {
    if (error instanceof GeminiServiceError) {
      console.error(`[Gemini Test] ${error.code}${error.status ? ` (HTTP ${error.status})` : ''}: ${error.message}`);
      if (error.details) console.error(`[Gemini Test] Provider details: ${String(error.details).slice(0, 500)}`);
    } else {
      console.error('[Gemini Test] Unexpected error:', error);
    }
    process.exitCode = 1;
  }
}

main();
