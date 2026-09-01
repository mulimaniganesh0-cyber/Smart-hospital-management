require('dotenv').config();
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

async function migrateHnswIndex() {
  console.log('[MIGRATION] Checking PostgreSQL pgvector HNSW index setup...');
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'hospital_resource_db',
  });

  await client.connect();

  const migrationSql = fs.readFileSync(
    path.join(__dirname, 'src/migrations/003_add_hnsw_vector_index.sql'),
    'utf8'
  );

  try {
    console.log('[MIGRATION] Applying 003_add_hnsw_vector_index.sql...');
    await client.query(migrationSql);
    console.log('✅ [MIGRATION SUCCESS] HNSW vector index created/verified on rag_chunks(embedding).');
  } catch (error) {
    console.error(`[MIGRATION ERROR] ${error.message}`);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

migrateHnswIndex();
