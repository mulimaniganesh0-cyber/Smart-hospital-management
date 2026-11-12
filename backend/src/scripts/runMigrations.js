// Ledger-backed migration runner. The default/status mode is read-only.
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { pool } = require('../config/database');
const { migrations, verifyMigration } = require('../services/migrationRegistry');

const LEDGER = 'schema_migrations';
const MIGRATION_DIR = path.join(__dirname, '..', 'migrations');
const mode = process.argv[2] || '--status';
const knownModes = new Set(['--status', '--baseline-verified', '--apply']);

function checksum(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(path.join(MIGRATION_DIR, file))).digest('hex');
}

async function ledgerExists(client) {
  const result = await client.query("SELECT to_regclass('public.schema_migrations') IS NOT NULL AS exists");
  return result.rows[0].exists;
}

async function ensureLedger(client) {
  await client.query(`CREATE TABLE IF NOT EXISTS public.${LEDGER} (
    version TEXT PRIMARY KEY,
    filename TEXT NOT NULL,
    checksum TEXT NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    applied_mode TEXT NOT NULL CHECK (applied_mode IN ('applied', 'verified_baseline'))
  )`);
}

async function readLedger(client) {
  if (!(await ledgerExists(client))) return new Map();
  const result = await client.query(`SELECT version, filename, checksum, applied_mode FROM public.${LEDGER} ORDER BY version`);
  return new Map(result.rows.map((row) => [row.version, row]));
}

async function run() {
  if (!knownModes.has(mode)) throw new Error('Usage: npm run migrate:run -- [--status|--baseline-verified|--apply]');
  const client = await pool.connect();
  try {
    await client.query("SET search_path TO public");
    const exists = await ledgerExists(client);
    if (mode !== '--status') {
      await client.query('SELECT pg_advisory_lock($1, $2)', [74291, 1]);
    }
    const ledger = await readLedger(client);
    if (mode === '--status') {
      console.log(`Migration ledger: ${exists ? 'present' : 'absent'} (read-only)`);
      let failures = 0;
      for (const migration of migrations) {
        const row = ledger.get(migration.version);
        const result = await verifyMigration(client, migration);
        const currentChecksum = checksum(migration.file);
        const ledgerState = !row ? 'unrecorded' : row.checksum !== currentChecksum || row.filename !== migration.file ? 'DRIFT' : row.applied_mode;
        const schemaState = result.complete ? 'verified' : `missing: ${result.missing.join(', ')}`;
        console.log(`${migration.version} ${migration.file}: ${ledgerState}; ${schemaState}`);
        if (!result.complete || ledgerState === 'DRIFT') failures++;
      }
      if (failures) process.exitCode = 2;
      return;
    }

    if (mode === '--baseline-verified') {
      if (ledger.size) throw new Error('Baseline refused: migration ledger already contains rows. Use --status and resolve ledger state first.');
      for (const migration of migrations) {
        const result = await verifyMigration(client, migration);
        if (!result.complete) throw new Error(`Baseline refused; ${migration.version} is incomplete: ${result.missing.join(', ')}`);
      }
      await ensureLedger(client);
      await client.query('BEGIN');
      try {
        for (const migration of migrations) {
          await client.query(`INSERT INTO public.${LEDGER} (version, filename, checksum, applied_mode) VALUES ($1,$2,$3,'verified_baseline')`, [migration.version, migration.file, checksum(migration.file)]);
        }
        await client.query('COMMIT');
      } catch (error) { await client.query('ROLLBACK'); throw error; }
      console.log(`Recorded ${migrations.length} verified migration postconditions in public.${LEDGER}.`);
      return;
    }

    if (!exists) {
      const first = await verifyMigration(client, migrations[0]);
      if (first.complete) throw new Error('Schema already contains migration 001 effects but has no ledger. Run --status, then use --baseline-verified after reviewing every migration postcondition.');
      await ensureLedger(client);
    }
    for (const migration of migrations) {
      const row = ledger.get(migration.version);
      const fileChecksum = checksum(migration.file);
      if (row) {
        if (row.filename !== migration.file || row.checksum !== fileChecksum) throw new Error(`Checksum or filename drift for ${migration.version}; refusing to continue.`);
        const verified = await verifyMigration(client, migration);
        if (!verified.complete) throw new Error(`Ledger/schema drift for ${migration.version}: ${verified.missing.join(', ')}`);
        continue;
      }
      // A partially executed older runner may have left effects without a ledger.
      const preexisting = await verifyMigration(client, migration);
      if (preexisting.complete) throw new Error(`${migration.version} effects already exist without a ledger row. Run --status and explicitly baseline a fully verified schema.`);
      const sql = fs.readFileSync(path.join(MIGRATION_DIR, migration.file), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        const verified = await verifyMigration(client, migration);
        if (!verified.complete) throw new Error(`Post-migration verification failed: ${verified.missing.join(', ')}`);
        await client.query(`INSERT INTO public.${LEDGER} (version, filename, checksum, applied_mode) VALUES ($1,$2,$3,'applied')`, [migration.version, migration.file, fileChecksum]);
        await client.query('COMMIT');
        console.log(`Applied and verified ${migration.version} ${migration.file}`);
      } catch (error) { await client.query('ROLLBACK'); throw error; }
    }
  } finally {
    if (mode !== '--status') await client.query('SELECT pg_advisory_unlock($1, $2)', [74291, 1]).catch(() => {});
    client.release();
    await pool.end();
  }
}

run().catch((error) => {
  console.error(`Migration ${mode} failed: ${error.message}`);
  process.exitCode = 1;
});
