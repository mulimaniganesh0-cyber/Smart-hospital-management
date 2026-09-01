const {
  embeddingModel,
  queryTimeoutMs,
} = require('../config/ragConfig');
const { validateEmbedding: validateEmbeddingDimension } = require('./embeddingValidation');

class EmbeddingServiceError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = 'EmbeddingServiceError';
    this.code = 'EMBEDDING_UNAVAILABLE';
    this.cause = cause;
  }
}

function baseUrl() {
  return (
    process.env.OLLAMA_BASE_URL ||
    'http://localhost:11434'
  ).replace(/\/$/, '');
}

async function requestEmbeddings(input) {
  const controller = new AbortController();

  const timer = setTimeout(() => {
    controller.abort();
  }, queryTimeoutMs);

  try {
    const response = await fetch(
      `${baseUrl()}/api/embed`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: embeddingModel,
          input,
        }),
        signal: controller.signal,
      }
    );

    if (!response.ok) {
      const errorText = await response.text();

      throw new EmbeddingServiceError(
        `Ollama embedding request failed with HTTP ${response.status}. ` +
        `Model: ${embeddingModel}. ` +
        `Response: ${errorText}`
      );
    }

    const body = await response.json();

    if (!Array.isArray(body.embeddings)) {
      throw new EmbeddingServiceError(
        'Ollama embedding response did not contain embeddings.'
      );
    }

    try {
      return body.embeddings.map(validateEmbeddingDimension);
    } catch (error) {
      throw new EmbeddingServiceError(
        `Ollama returned an invalid ${embeddingModel} embedding. ${error.message}`,
        error
      );
    }
  } catch (error) {
    if (error instanceof EmbeddingServiceError) {
      throw error;
    }

    throw new EmbeddingServiceError(
      `Local embedding model is unavailable at ${baseUrl()}. ` +
      `Start Ollama and make sure ${embeddingModel} is installed.`,
      error
    );
  } finally {
    clearTimeout(timer);
  }
}

async function generateEmbedding(text) {
  const input = String(text || '');

  if (!input.trim()) {
    throw new EmbeddingServiceError(
      'Embedding input text cannot be empty.'
    );
  }

  const embeddings =
    await requestEmbeddings(input);

  if (embeddings.length === 0) {
    throw new EmbeddingServiceError(
      'Ollama returned no embedding.'
    );
  }

  return embeddings[0];
}

async function generateEmbeddings(texts) {
  if (!Array.isArray(texts)) {
    throw new EmbeddingServiceError(
      'generateEmbeddings expects an array of texts.'
    );
  }

  if (texts.length === 0) {
    return [];
  }

  const inputs = texts.map((text) =>
    String(text || '')
  );

  if (inputs.some((text) => !text.trim())) {
    throw new EmbeddingServiceError(
      'Embedding input text cannot be empty.'
    );
  }

  return requestEmbeddings(inputs);
}

async function embedQuery(query) {
  return generateEmbedding(query);
}

module.exports = {
  EmbeddingServiceError,
  generateEmbedding,
  generateEmbeddings,
  embedQuery,
  embeddingModel,
  validateEmbedding: validateEmbeddingDimension,
};
