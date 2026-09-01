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

  const result = await client.query(`
    SELECT format_type(atttypid, atttypmod) AS embedding_type
    FROM pg_attribute
    WHERE attrelid = 'public.rag_chunks'::regclass
      AND attname = 'embedding';
  `);

  console.table(result.rows);

  await client.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
