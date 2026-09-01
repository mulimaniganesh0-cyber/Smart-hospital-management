const { pool } = require('../config/database');
const { embedQuery } = require('./embeddingService');
const { asVector, assertPgVector, getRagCorpusStats, RagStoreError } = require('./ragVectorStore');
const { topK: defaultTopK, similarityThreshold: defaultThreshold, isDevelopment, embeddingModel } = require('../config/ragConfig');

async function retrieveRelevantChunks(query, { topK = defaultTopK, similarityThreshold = defaultThreshold, language, ageBand } = {}) {
  const question = String(query || '').trim();
  if (!question) return [];
  // Never log a raw user message: it can contain patient information.
  console.info(`[RAG] User question: [redacted; characters=${question.length}]`);
  const embedding = await embedQuery(question);
  console.info('[RAG] Query embedding generated: yes');
  await assertPgVector();
  const corpus = await getRagCorpusStats(embeddingModel);
  console.info(`[RAG] Corpus: documents=${corpus.documents}; chunks=${corpus.chunks}; model=${embeddingModel}`);
  if (Number(corpus.chunks) === 0) {
    throw new RagStoreError(`No RAG chunks exist for embedding model ${embeddingModel}.`);
  }
  const count = Math.max(1, Math.min(Number(topK) || defaultTopK, 20));
  const candidateCount = Math.min(count * 4, 80);
  const params = [asVector(embedding), question, candidateCount, count, Number(similarityThreshold), embeddingModel];
  const languageFilter = language && language !== 'und' ? 'AND (d.language = $7 OR d.language = \'und\')' : '';
  if (language && language !== 'und') params.push(language);
  const ageParameter = params.length + 1;
  const ageFilter = ageBand ? `AND (d.metadata->>'ageGroup' IS NULL OR d.metadata->>'ageGroup' = $${ageParameter})` : '';
  if (ageBand) params.push(ageBand);
  try {
    const result = await pool.query(`WITH vector_matches AS (
      SELECT c.id, c.document_id, c.content, c.metadata, d.title, d.source, d.language,
        d.metadata AS document_metadata, 1 - (c.embedding <=> $1::vector) AS semantic_score,
        0::real AS keyword_score
      FROM rag_chunks c JOIN rag_documents d ON d.id=c.document_id
      WHERE c.embedding_model = $6 ${languageFilter} ${ageFilter}
      ORDER BY c.embedding <=> $1::vector LIMIT $3
    ), keyword_matches AS (
      SELECT c.id, c.document_id, c.content, c.metadata, d.title, d.source, d.language,
        d.metadata AS document_metadata, 0::real AS semantic_score,
        ts_rank_cd(c.search_vector, websearch_to_tsquery('simple', $2)) AS keyword_score
      FROM rag_chunks c JOIN rag_documents d ON d.id=c.document_id
      WHERE c.embedding_model = $6 AND c.search_vector @@ websearch_to_tsquery('simple', $2) ${languageFilter} ${ageFilter}
      ORDER BY keyword_score DESC LIMIT $3
    ), combined AS (
      SELECT * FROM vector_matches UNION ALL SELECT * FROM keyword_matches
    ), deduplicated AS (
      SELECT DISTINCT ON (id) *, GREATEST(semantic_score, keyword_score) AS score
      FROM combined ORDER BY id, GREATEST(semantic_score, keyword_score) DESC
    ) SELECT * FROM deduplicated
      WHERE semantic_score >= $5 OR keyword_score > 0
      ORDER BY (semantic_score * 0.8 + keyword_score * 0.2) DESC LIMIT $4`, params);
    const uniqueContent = new Set();
    const chunks = result.rows
      .map((row) => ({ ...row, semantic_score: Number(row.semantic_score), keyword_score: Number(row.keyword_score), score: Number(row.score) }))
      .filter((chunk) => {
        const signature = String(chunk.content || '').replace(/\s+/g, ' ').trim().toLowerCase();
        if (!signature || uniqueContent.has(signature)) return false;
        uniqueContent.add(signature);
        return true;
      });
    const topSimilarity = chunks[0]?.semantic_score;
    const topScores = chunks.slice(0, 5).map((chunk) => chunk.semantic_score.toFixed(4)).join(', ') || 'none';
    console.info(`[RAG] Retrieved chunks: ${chunks.length}; threshold=${Number(similarityThreshold).toFixed(2)}`);
    console.info(`[RAG] Top similarity scores: ${topScores}`);
    if (isDevelopment && chunks.length) {
      console.info(`[RAG] Selected chunk titles: ${chunks.map((chunk) => `${chunk.title} (${chunk.score.toFixed(4)})`).join('; ').slice(0, 800)}`);
    }
    return chunks;
  } catch (error) { throw error instanceof RagStoreError ? error : new RagStoreError('RAG retrieval query failed.', error); }
}

async function retrieveRelevantDocuments(query, options) {
  const chunks = await retrieveRelevantChunks(query, options);
  const documents = new Map();
  for (const chunk of chunks) {
    if (!documents.has(chunk.document_id)) documents.set(chunk.document_id, { id: chunk.document_id, title: chunk.title, source: chunk.source, language: chunk.language, chunks: [] });
    documents.get(chunk.document_id).chunks.push(chunk);
  }
  return [...documents.values()];
}

function buildRetrievedContext(chunks) {
  // Keep generation fast and avoid filling llama3.2's context window.  The
  // retrieval result remains intact for debugging/source attribution.
  const maxChunkCharacters = 650;
  return chunks.map((chunk, index) => `[Document ${index + 1}: ${chunk.title}]\n${String(chunk.content || '').slice(0, maxChunkCharacters)}`).join('\n\n');
}

module.exports = { retrieveRelevantChunks, retrieveRelevantDocuments, buildRetrievedContext };
