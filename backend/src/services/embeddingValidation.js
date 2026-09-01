const { embeddingDimension } = require('../config/ragConfig');

class EmbeddingValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'EmbeddingValidationError';
  }
}

function validateEmbedding(embedding) {
  if (!Array.isArray(embedding)) throw new EmbeddingValidationError('Embedding must be an array.');
  if (embedding.length !== embeddingDimension) {
    throw new EmbeddingValidationError(`Invalid embedding dimension. Expected ${embeddingDimension}, received ${embedding.length}.`);
  }
  if (!embedding.every((value) => typeof value === 'number' && Number.isFinite(value))) {
    throw new EmbeddingValidationError('Embedding contains invalid numeric values.');
  }
  return embedding;
}

module.exports = { EmbeddingValidationError, validateEmbedding };
