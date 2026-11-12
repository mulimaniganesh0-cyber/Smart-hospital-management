# Database Audit Report

**Status:** Static schema/migration review only; no database connection or integrity query was run.

The repository contains base schema initialization plus versioned migrations `001`–`022`, a migration registry that checks expected effects, and PostgreSQL/pgvector integration tests. Coverage includes roles/audit logs, RAG vectors, emergency/ambulance, notifications, queues, QR, scheduling, doctor reports, family access, driver authorization, resource constraints, gallery, and blood batches.

## Risks and next checks

- **High:** Actual deployed schema version and migration checksums/state are unknown. Run migration verification against a disposable copy of production-like data before applying changes.
- **High:** Confirm foreign keys, uniqueness, check constraints, and partial indexes enforce appointment-slot and active ambulance/driver exclusivity under concurrency.
- **High:** Validate medical-record ownership/share constraints and cascade behavior preserve privacy and retention obligations.
- **Medium:** Verify migration runner transaction/locking semantics and recovery after interruption; exercise backup/restore before any production migration.
- **Medium:** Compare aggregate blood stock with batches/ledger and resource counts against valid capacities using read-only audit queries.
- **Medium:** Validate vector extension/version, embedding dimensions, indexes, and migration behavior on supported PostgreSQL versions.

Do not run migrations against production until the actual target schema and backup/restore path have been reviewed. No destructive database operation was performed.
