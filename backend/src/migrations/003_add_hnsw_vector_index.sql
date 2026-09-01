-- Add HNSW cosine vector index for fast similarity search across RAG corpus
CREATE EXTENSION IF NOT EXISTS vector;

CREATE INDEX IF NOT EXISTS idx_rag_chunks_embedding_hnsw 
ON rag_chunks USING hnsw (embedding vector_cosine_ops);
