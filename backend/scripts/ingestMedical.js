const path = require('path');
const { dataDirectory, embeddingBatchSize, embeddingModel } = require('../src/config/ragConfig');
const { loadDocumentsFromDirectory } = require('../src/services/documentProcessingService');
const { chunkText } = require('../src/services/chunkingService');
const { generateEmbeddings } = require('../src/services/embeddingService');
const crypto = require('crypto');

async function ingest() {
  const directory = process.argv[2] ? path.resolve(process.argv[2]) : dataDirectory;
  console.log(`[MEDICAL RAG] Scanning medical data directory: ${directory}`);
  const startTime = Date.now();
  
  const documents = await loadDocumentsFromDirectory(directory);
  if (!documents.length) {
    console.log(`No JSON or JSONL medical documents found in ${directory}. Nothing was ingested.`);
    return;
  }
  
  console.log(`[MEDICAL RAG] Loaded ${documents.length} raw medical documents. Preparing chunks and hashes...`);
  const prepared = [];
  for (const document of documents) {
    const chunks = chunkText(document.content);
    const contentHash = crypto.createHash('sha256').update(chunks.map((chunk) => chunk.content).join('\n'), 'utf8').digest('hex');
    prepared.push({ ...document, contentHash, chunks: chunks.map((chunk) => ({ ...chunk, embedding: null })) });
  }

  const { getExistingDocumentHashes, updateExistingDocumentMetadata, upsertProcessedDocuments, getRagCorpusStats } = require('../src/services/ragVectorStore');
  
  console.log(`[MEDICAL RAG] Checking existing document fingerprints in PostgreSQL...`);
  const existing = await getExistingDocumentHashes(prepared);
  const newDocuments = prepared.filter((document) => existing.get(`${document.source}\u0000${document.externalId}`) !== document.contentHash);
  const duplicateDocuments = prepared.length - newDocuments.length;
  const unchangedDocuments = prepared.filter((document) => existing.get(`${document.source}\u0000${document.externalId}`) === document.contentHash);

  const totalChunksToEmbed = newDocuments.reduce((acc, doc) => acc + doc.chunks.length, 0);
  console.log(`[MEDICAL RAG] Total dataset records: ${prepared.length}`);
  console.log(`[MEDICAL RAG] New/updated records to embed: ${newDocuments.length} (${totalChunksToEmbed} chunks)`);
  console.log(`[MEDICAL RAG] Unchanged records to preserve: ${duplicateDocuments}`);

  let totalEmbeddedChunks = 0;
  let totalSavedDocuments = 0;
  let totalSavedChunks = 0;

  // Process and commit in incremental batches of documents
  const DOC_BATCH_SIZE = 50;
  const BATCH_EMBED_SIZE = Math.max(embeddingBatchSize, 16);

  for (let docIdx = 0; docIdx < newDocuments.length; docIdx += DOC_BATCH_SIZE) {
    const docBatch = newDocuments.slice(docIdx, docIdx + DOC_BATCH_SIZE);
    
    // Collect all chunk embedding jobs for this doc batch
    const chunkJobs = [];
    docBatch.forEach((doc, dIndex) => {
      doc.chunks.forEach((chunk, cIndex) => {
        chunkJobs.push({ dIndex, cIndex, content: chunk.content });
      });
    });

    // Generate embeddings in sub-batches
    for (let eIdx = 0; eIdx < chunkJobs.length; eIdx += BATCH_EMBED_SIZE) {
      const eBatch = chunkJobs.slice(eIdx, eIdx + BATCH_EMBED_SIZE);
      const embeddings = await generateEmbeddings(eBatch.map((job) => job.content));
      eBatch.forEach((job, idx) => {
        docBatch[job.dIndex].chunks[job.cIndex].embedding = embeddings[idx];
      });
      totalEmbeddedChunks += eBatch.length;
    }

    // Persist this batch to PostgreSQL
    const upsertRes = await upsertProcessedDocuments(docBatch);
    totalSavedDocuments += upsertRes.documents;
    totalSavedChunks += upsertRes.chunks;

    const progressPct = ((totalEmbeddedChunks / Math.max(totalChunksToEmbed, 1)) * 100).toFixed(1);
    const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[MEDICAL RAG] Progress: ${totalSavedDocuments}/${newDocuments.length} docs (${progressPct}%) - ${totalEmbeddedChunks}/${totalChunksToEmbed} chunks indexed [${elapsedSec}s elapsed]`);
  }

  if (unchangedDocuments.length > 0) {
    console.log(`[MEDICAL RAG] Updating metadata for ${unchangedDocuments.length} unchanged documents...`);
    const metadataUpdated = await updateExistingDocumentMetadata(unchangedDocuments);
    console.log(`[MEDICAL RAG] Metadata updated for ${metadataUpdated} documents.`);
  }

  const totals = await getRagCorpusStats(embeddingModel);
  const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n=============================================================`);
  console.log(`✅ [MEDICAL RAG INGESTION & TRAINING COMPLETE]`);
  console.log(`   * Total documents in RAG corpus: ${totals.documents}`);
  console.log(`   * Total vector chunks indexed:   ${totals.chunks}`);
  console.log(`   * Embedding Model:               ${embeddingModel}`);
  console.log(`   * Total Duration:                ${totalElapsed}s`);
  console.log(`=============================================================\n`);
}

ingest().catch((error) => {
  console.error(`[RAG] ingestion failed: ${error.message}`);
  process.exitCode = 1;
});
