# Project Audit Report

**Date:** 2026-11-06  
**Scope:** Discovery phase, static repository review, and backend unit test run. No application code was changed during this phase. The worktree contained extensive pre-existing modifications; see `git status` history in the audit notes and review those changes separately before attributing them.

## Architecture map

- Flutter/Dart client in `frontend/lib`: role dashboards, providers, API and Socket.IO clients, location services.
- Node.js/Express API in `backend/server.js` and `backend/src`: routes/controllers/services, JWT auth, Socket.IO, background queue/SOS work.
- PostgreSQL via `pg`, initialization and versioned migrations 001–022, including pgvector/RAG schema.
- AI paths include local Ollama and Gemini; README and source also describe/use an OpenAI provider. This conflicts with the request to avoid OpenAI/Gemini dependencies and retain local Ollama and needs an explicit architecture decision.
- Deployment configuration is split across backend environment files, Flutter `--dart-define` API/socket URLs, and Docker Compose. No live deployment or external-network validation was available in this phase.

## Preliminary findings

| Severity | Finding | Evidence / status |
|---|---|---|
| High | Backend test suite has skipped integration tests for PostgreSQL, API, report flow, role matrix, and two-client sockets. | `npm test`: 93 passed, 0 failed, 8 skipped (101 tests). Live workflow and database assurance remain incomplete. |
| High | Production startup/network settings require deployment verification. | Socket.IO uses `allowedOrigins`; if unset its origin list is empty. Flutter release mode uses `https://api.invalid/api` unless `API_BASE_URL` is supplied. These are fail-closed defaults; confirm actual release and production environment values. |
| High | Medical records and emergency location are sensitive workflows requiring endpoint-by-endpoint authorization verification. | Route middleware has router-wide authentication in medical routes, but several patient/appointment and record routes delegate ownership checks to controllers. `/emergency/location/:token` is capability-token based. Static route review alone does not prove controller scoping. |
| Medium | Large request bodies and broad generic rate limiting may increase resource exposure or interfere with legitimate uploads. | Express JSON/urlencoded limits are 50 MB; generic API limit is 100 requests per 15 minutes in production. Validate upload-specific limits and auth-specific throttling. |
| Medium | API config uses environment-dependent host defaults; deployment can silently fail if release defines are omitted. | `frontend/lib/config/app_config.dart`; test web, Android emulator, physical device, HTTPS and WSS with actual release artifacts. |
| Medium | Migration coverage is broad but database state is not verified in this environment. | Migration registry covers versions 001–022. PostgreSQL and pgvector integration tests were skipped; run against a disposable, representative database and inspect migration/rollback behavior. |
| Medium | Repository contains a large set of uncommitted changes and generated/untracked artifacts. | `git status --short` showed modifications across backend, frontend, migrations, docs, `.dart-cache`, Android build cache, database backup, and a doctor roster CSV. Review provenance and sensitive contents; do not discard or stage blindly. |
| Medium | AI provider architecture differs from the desired local-only preference. | README documents Gemini; code includes `aiServiceOpenAI.js`; backend test output exercised OpenAI provider routing. Verify provider selection, privacy handling, grounding, fallback, and configuration before deployment. |

## Inventory and verification state

Feature areas present in code include auth/roles; hospital and staff management; patient profiles/family/records; doctor portal/appointments; queues/QR; ambulance/SOS dispatch and tracking; blood inventory; resource requests; notifications; gallery; CareGuide/RAG; and admin reporting. Presence is not end-to-end verification. API route inventory and role-permission matrix remain to be completed in the next audit pass.

## Remediation order

1. Preserve and review the existing worktree changes; establish a clean baseline/commit before edits.
2. Run DB-backed authorization and isolation tests for patient records, family consent, doctor appointment access, hospital ownership, emergency coordinates, driver assignment, and Socket.IO subscriptions.
3. Verify production secrets, CORS, rate limits, request sizes, proxy/HTTPS/WSS, and Flutter release defines.
4. Exercise concurrency and data integrity for appointments, ambulances, resources, blood batches, queues, and SOS escalation against PostgreSQL.
5. Validate AI provider policy and emergency-safe fallbacks; reconcile documentation with actual provider behavior.
6. Run Flutter analysis/tests/build and live deployment smoke tests when required SDKs, DB, Ollama, credentials, and network target are available.

## Status

Discovery is partial. No production-readiness claim is made. Full end-to-end, deployment, performance, and device verification remain outstanding.
