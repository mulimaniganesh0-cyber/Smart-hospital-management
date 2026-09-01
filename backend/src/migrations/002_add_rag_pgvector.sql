-- Local medical RAG infrastructure. This migration never touches hospital,
-- doctor, appointment, patient, or health-record tables.
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS rag_embedding_models (
  model_name TEXT PRIMARY KEY,
  embedding_dimension INTEGER NOT NULL CHECK (embedding_dimension > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS rag_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id TEXT NOT NULL,
  title TEXT NOT NULL,
  source TEXT NOT NULL,
  language VARCHAR(16) NOT NULL DEFAULT 'und',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  content_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(source, external_id)
);

CREATE TABLE IF NOT EXISTS rag_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES rag_documents(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL CHECK (chunk_index >= 0),
  content TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  embedding_model TEXT NOT NULL,
  embedding vector NOT NULL,
  search_vector tsvector GENERATED ALWAYS AS (to_tsvector('simple', content)) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(document_id, chunk_index)
);

ALTER TABLE rag_chunks ADD COLUMN IF NOT EXISTS embedding_model TEXT;
UPDATE rag_chunks SET embedding_model = 'legacy' WHERE embedding_model IS NULL;
ALTER TABLE rag_chunks ALTER COLUMN embedding_model SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_rag_documents_source_external_id ON rag_documents(source, external_id);
CREATE INDEX IF NOT EXISTS idx_rag_chunks_document_id ON rag_chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_rag_chunks_embedding_model ON rag_chunks(embedding_model);
CREATE INDEX IF NOT EXISTS idx_rag_chunks_search_vector ON rag_chunks USING GIN(search_vector);

-- The vector column intentionally has no fixed dimension. The selected local
-- model records its actual dimension in rag_embedding_models at first ingest;
-- this prevents a configuration-only dimension from becoming incorrect.
