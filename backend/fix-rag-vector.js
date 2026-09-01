require("dotenv").config();

const { Client } = require("pg");

async function main() {
  const client = new Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });

  await client.connect();

  await client.query(`
    ALTER TABLE rag_chunks
    ALTER COLUMN embedding TYPE vector
    USING embedding::vector;
  `);

  console.log(
    "? rag_chunks.embedding is now a dimensionless pgvector column."
  );

  await client.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
