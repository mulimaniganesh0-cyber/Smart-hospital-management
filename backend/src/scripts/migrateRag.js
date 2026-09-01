// Applies only the RAG schema migration. It avoids replaying legacy migrations
// in installations that predate migration tracking.
const fs = require('fs');
const path = require('path');
const { pool } = require('../config/database');

async function migrateRag() {
  const file = path.join(__dirname, '..', 'migrations', '002_add_rag_pgvector.sql');
  const sql = fs.readFileSync(file, 'utf8');
  try {
    await pool.query(sql);
    console.log('RAG pgvector migration applied successfully.');
  } catch (error) {
    console.error(`RAG pgvector migration failed: ${error.message}`);
    console.error('Use the pgvector/pgvector:pg15 Docker image (or install the pgvector extension on your PostgreSQL server), then run this command again.');
    process.exitCode = 1;
  } finally { await pool.end(); }
}

migrateRag();
