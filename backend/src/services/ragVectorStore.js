const crypto = require('crypto');

const { pool } = require('../config/database');

const {
  ragTableName,
  embeddingDimension,
} = require('../config/ragConfig');
const { validateEmbedding } = require('./embeddingValidation');

class RagStoreError extends Error {
  constructor(message, cause = null) {
    super(message);
    this.name = 'RagStoreError';
    this.cause = cause;
  }
}

function assertValidEmbedding(embedding) {
  try {
    return validateEmbedding(embedding);
  } catch (error) {
    throw new RagStoreError(error.message, error);
  }
}

function embeddingToVector(embedding) {
  assertValidEmbedding(embedding);

  return `[${embedding.join(',')}]`;
}

/*
 * Alias used by ragRetrievalService.js.
 */
function asVector(embedding) {
  return embeddingToVector(embedding);
}

async function assertPgVector() {
  const result = await pool.query(`
    SELECT
      extname,
      extversion
    FROM pg_extension
    WHERE extname = 'vector'
  `);

  if (result.rows.length === 0) {
    throw new RagStoreError(
      'pgvector extension is not installed.'
    );
  }

  return {
    installed: true,
    version: result.rows[0].extversion,
  };
}

async function getRagCorpusStats(embeddingModel) {
  const result = await pool.query(
    `SELECT
       COUNT(DISTINCT d.id)::integer AS documents,
       COUNT(c.id)::integer AS chunks
     FROM rag_documents d
     LEFT JOIN rag_chunks c
       ON c.document_id = d.id
      AND c.embedding_model = $1`,
    [embeddingModel]
  );
  return result.rows[0] || { documents: 0, chunks: 0 };
}

async function ensureRagTable() {
  await assertPgVector();

  const result = await pool.query(
    `
    SELECT to_regclass($1) AS table_name
    `,
    [ragTableName]
  );

  if (!result.rows[0].table_name) {
    throw new RagStoreError(
      `RAG table "${ragTableName}" does not exist. Run npm run migrate:rag.`
    );
  }

  const schema = await pool.query(
    `SELECT format_type(a.atttypid, a.atttypmod) AS embedding_type
     FROM pg_attribute a
     WHERE a.attrelid = $1::regclass
       AND a.attname = 'embedding'
       AND NOT a.attisdropped`,
    [ragTableName]
  );
  const embeddingType = schema.rows[0]?.embedding_type;
  if (embeddingType !== 'vector' && embeddingType !== `vector(${embeddingDimension})`) {
    throw new RagStoreError(
      `RAG embedding column must be vector or vector(${embeddingDimension}); received ${embeddingType || 'missing'}.`
    );
  }

  return true;
}

async function upsertProcessedDocuments(documents) {
  if (!Array.isArray(documents)) {
    throw new RagStoreError(
      'documents must be an array.'
    );
  }

  await ensureRagTable();

  const client = await pool.connect();
  let chunkCount = 0;

  try {
    await client.query('BEGIN');

    await client.query(
      `INSERT INTO rag_embedding_models (model_name, embedding_dimension)
       VALUES ($1, $2)
       ON CONFLICT (model_name) DO UPDATE
       SET embedding_dimension = EXCLUDED.embedding_dimension
       WHERE rag_embedding_models.embedding_dimension = EXCLUDED.embedding_dimension`,
      [require('../config/ragConfig').embeddingModel, embeddingDimension]
    );

      for (const document of documents) {
      if (!document.externalId) {
        throw new RagStoreError(
          'RAG document externalId is required.'
        );
      }

      const source =
        document.source || 'unknown';

      const title =
        document.title ||
        document.externalId;

      const language =
        document.language || 'en';

      const metadata =
        document.metadata || {};

      const contentForHash =
        (document.chunks || [])
          .map(
            (chunk) =>
              chunk.content || ''
          )
          .join('\n');

      const contentHash =
        crypto
          .createHash('sha256')
          .update(
            contentForHash,
            'utf8'
          )
          .digest('hex');

      const documentResult =
        await client.query(
          `
          INSERT INTO rag_documents (
            external_id,
            title,
            source,
            language,
            metadata,
            content_hash,
            updated_at
          )
          VALUES (
            $1,
            $2,
            $3,
            $4,
            $5::jsonb,
            $6,
            CURRENT_TIMESTAMP
          )
          ON CONFLICT (source, external_id)
          DO UPDATE SET
            title = EXCLUDED.title,
            language = EXCLUDED.language,
            metadata = EXCLUDED.metadata,
            content_hash = EXCLUDED.content_hash,
            updated_at = CURRENT_TIMESTAMP
          RETURNING id
          `,
          [
            document.externalId,
            title,
            source,
            language,
            JSON.stringify(metadata),
            contentHash,
          ]
        );
      const documentId =
        documentResult.rows[0].id;

      await client.query(
        `
        DELETE FROM rag_chunks
        WHERE document_id = $1
        `,
        [documentId]
      );

      for (
        const chunk of document.chunks || []
      ) {
        assertValidEmbedding(
          chunk.embedding
        );

        const chunkMetadata = {
          ...(chunk.metadata || {}),
          startOffset:
            chunk.startOffset ?? 0,
          endOffset:
            chunk.endOffset ?? 0,
        };

        await client.query(
          `
          INSERT INTO rag_chunks (
            document_id,
            chunk_index,
            content,
            metadata,
            embedding_model,
            embedding
          )
          VALUES (
            $1,
            $2,
            $3,
            $4::jsonb,
            $5,
            $6::vector
          )
          `,
          [
            documentId,
            chunk.chunkIndex ?? 0,
            chunk.content || '',
            JSON.stringify(
              chunkMetadata
            ),
            chunk.embeddingModel ||
              'nomic-embed-text:latest',
            embeddingToVector(
              chunk.embedding
            ),
          ]
        );
        chunkCount += 1;
      }
    }

    await client.query('COMMIT');
    return { documents: documents.length, chunks: chunkCount };
  } catch (error) {
    await client.query('ROLLBACK');

    if (error instanceof RagStoreError) {
      throw error;
    }

    throw new RagStoreError(
      'Failed to upsert RAG documents.',
      error
    );
  } finally {
    client.release();
  }
}

async function getExistingDocumentHashes(documents) {
  if (!Array.isArray(documents) || !documents.length) return new Map();
  const resultMap = new Map();
  const BATCH_SIZE = 500;
  for (let i = 0; i < documents.length; i += BATCH_SIZE) {
    const batch = documents.slice(i, i + BATCH_SIZE);
    const result = await pool.query(
      `SELECT source, external_id, content_hash FROM rag_documents
       WHERE (source, external_id) IN (${batch.map((_, index) => `($${index * 2 + 1}, $${index * 2 + 2})`).join(', ')})`,
      batch.flatMap((document) => [document.source || 'unknown', document.externalId])
    );
    result.rows.forEach((row) => {
      resultMap.set(`${row.source}\u0000${row.external_id}`, row.content_hash);
    });
  }
  return resultMap;
}

async function updateExistingDocumentMetadata(documents) {
  if (!Array.isArray(documents) || !documents.length) return 0;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let updated = 0;
    for (const document of documents) {
      const result = await client.query(
        `UPDATE rag_documents SET title=$1, language=$2, metadata=$3::jsonb, updated_at=CURRENT_TIMESTAMP
         WHERE source=$4 AND external_id=$5`,
        [document.title || document.externalId, document.language || 'en', JSON.stringify(document.metadata || {}), document.source || 'unknown', document.externalId]
      );
      updated += result.rowCount;
    }
    await client.query('COMMIT');
    return updated;
  } catch (error) {
    await client.query('ROLLBACK');
    throw new RagStoreError('Failed to update RAG document metadata.', error);
  } finally {
    client.release();
  }
}

module.exports = {
  pool,
  RagStoreError,
  assertPgVector,
  getRagCorpusStats,
  ensureRagTable,
  assertValidEmbedding,
  embeddingToVector,
  asVector,
  upsertProcessedDocuments,
  getExistingDocumentHashes,
  updateExistingDocumentMetadata,
};
