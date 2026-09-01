const path = require('path');

const REQUIRED_EMBEDDING_DIMENSION = 768;

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);

  return Number.isInteger(parsed) && parsed > 0
    ? parsed
    : fallback;
}

function numberInRange(
  value,
  fallback,
  minimum,
  maximum
) {
  const parsed = Number(value);

  return Number.isFinite(parsed) &&
    parsed >= minimum &&
    parsed <= maximum
    ? parsed
    : fallback;
}

function enabled(value, fallback = true) {
  if (value == null || value === '') {
    return fallback;
  }

  return String(value).toLowerCase() === 'true';
}

const configuredEmbeddingDimension = positiveInteger(
  process.env.EMBEDDING_DIMENSION,
  REQUIRED_EMBEDDING_DIMENSION
);

if (configuredEmbeddingDimension !== REQUIRED_EMBEDDING_DIMENSION) {
  throw new Error(
    `EMBEDDING_DIMENSION must be ${REQUIRED_EMBEDDING_DIMENSION} for ` +
    'nomic-embed-text:latest.'
  );
}

module.exports = {
  enabled: enabled(
    process.env.RAG_ENABLED,
    true
  ),

  // This must match the vectors already persisted in PostgreSQL.  CareGuide
  // intentionally does not allow a request-time model override: vectors from
  // different embedding models are not comparable.
  embeddingModel: 'nomic-embed-text:latest',

  // nomic-embed-text produces 768-dimensional embeddings
  embeddingDimension: REQUIRED_EMBEDDING_DIMENSION,

  // PostgreSQL table used for RAG chunks/vectors
  // IMPORTANT: actual chunk content and embeddings
  // are stored in rag_chunks.
  ragTableName:
    process.env.RAG_TABLE_NAME ||
    'rag_chunks',

  // Medical records in the supplied age-aware dataset
  // are compact structured records.
  chunkSize: positiveInteger(
    process.env.RAG_CHUNK_SIZE,
    3000
  ),

  chunkOverlap: positiveInteger(
    process.env.RAG_CHUNK_OVERLAP,
    150
  ),

  topK: Math.min(positiveInteger(process.env.RAG_TOP_K, 5), 5),

  similarityThreshold: numberInRange(
    process.env.RAG_SIMILARITY_THRESHOLD,
    0.35,
    0,
    1
  ),

  dataDirectory: path.resolve(
    __dirname,
    '../../data/medical'
  ),

  queryTimeoutMs: positiveInteger(
    process.env.RAG_QUERY_TIMEOUT_MS,
    30_000
  ),

  embeddingBatchSize: positiveInteger(
    process.env.RAG_EMBED_BATCH_SIZE,
    8
  ),

  isDevelopment:
    process.env.NODE_ENV !== 'production',
};
