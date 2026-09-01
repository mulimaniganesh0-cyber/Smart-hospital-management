const assert = require('assert');
const { describe, it } = require('node:test');

// Set a dummy API key so the module doesn't abort on missing key
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test-key-for-ci';

const { generateCareGuideReply, AiServiceError } = require('../src/services/aiServiceOpenAI');

// Helper to create a successful fetch mock
function mockFetchSuccess(bodyObj) {
  return async function (url, options) {
    return {
      ok: true,
      json: async () => bodyObj,
      text: async () => JSON.stringify(bodyObj),
    };
  };
}

function mockFetchBadJson() {
  return async function (url, options) {
    return {
      ok: true,
      json: async () => { throw new Error('Invalid JSON'); },
      text: async () => 'not-json',
    };
  };
}

describe('aiServiceOpenAI - parse and retry behavior (mocked)', () => {
  it('parses a valid AI JSON response', async () => {
    const modelResponse = {
      choices: [{ message: { content: '{"intent":"greet","topic":"hello","specialization":null,"needs_doctor_recommendation":false,"response":"Hello patient"}' } }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
    };

    global.fetch = mockFetchSuccess(modelResponse);

    const result = await generateCareGuideReply({ message: 'Hi', history: [], databaseContext: {}, language: 'en' });
    assert.strictEqual(result.provider, 'openai');
    assert.strictEqual(result.intent, 'greet');
    assert.strictEqual(result.topic, 'hello');
    assert.strictEqual(result.response, 'Hello patient');
  });

  it('throws AiServiceError when model returns invalid JSON content', async () => {
    global.fetch = mockFetchBadJson();
    let thrown = false;
    try {
      await generateCareGuideReply({ message: 'Test bad', history: [], databaseContext: {}, language: 'en' });
    } catch (err) {
      thrown = true;
      assert(err.name === 'AiServiceError' || err.message.includes('invalid response') || err.message.includes('Invalid JSON'));
    }
    assert.strictEqual(thrown, true);
  });
});