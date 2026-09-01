require('dotenv').config();

const { answerWithRAG } = require('../src/services/ragService');

const questions = [
  'I am feeling dizzy',
  'What are the symptoms of fever?',
  'What causes headache?',
  'What should I do if I have a fever?',
];

async function main() {
  for (const question of questions) {
    console.info(`\n[SMOKE TEST] Question: ${question}`);
    const result = await answerWithRAG({ question });
    console.info(`[SMOKE TEST] Chunks: ${result.retrievedChunks}`);
    console.info(`[SMOKE TEST] Sources: ${result.sources.map((source) => `${source.title} (${source.score})`).join('; ')}`);
    console.info(`[SMOKE TEST] Answer: ${result.answer}`);
  }
}

main().catch((error) => {
  console.error('[SMOKE TEST] Failed:', error.message);
  process.exitCode = 1;
});
