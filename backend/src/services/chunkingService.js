const { chunkSize: defaultChunkSize, chunkOverlap: defaultChunkOverlap } = require('../config/ragConfig');

function normalizeWhitespace(value) {
  return String(value || '').replace(/\r\n?/g, '\n').replace(/[\t ]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

function chunkText(text, { chunkSize = defaultChunkSize, overlap = defaultChunkOverlap } = {}) {
  const normalized = normalizeWhitespace(text);
  if (!normalized) return [];
  if (!Number.isInteger(chunkSize) || chunkSize < 50) throw new Error('RAG chunk size must be at least 50 characters.');
  if (!Number.isInteger(overlap) || overlap < 0 || overlap >= chunkSize) throw new Error('RAG chunk overlap must be at least 0 and smaller than chunk size.');

  const chunks = [];
  let start = 0;
  while (start < normalized.length) {
    let end = Math.min(start + chunkSize, normalized.length);
    if (end < normalized.length) {
      const boundary = Math.max(normalized.lastIndexOf('\n', end), normalized.lastIndexOf('. ', end), normalized.lastIndexOf(' ', end));
      if (boundary > start + Math.floor(chunkSize * 0.55)) end = boundary + 1;
    }
    const content = normalized.slice(start, end).trim();
    if (content) chunks.push({ content, chunkIndex: chunks.length, startOffset: start, endOffset: end });
    if (end >= normalized.length) break;
    start = Math.max(end - overlap, start + 1);
  }
  return chunks;
}

module.exports = { chunkText, normalizeWhitespace };
