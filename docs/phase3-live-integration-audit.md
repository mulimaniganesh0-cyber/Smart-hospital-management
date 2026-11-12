# Phase 3 live integration audit

## Migration history

`npm run migrate:run -- --status` is read-only by default. It verifies all declared postconditions for migration files 001–020 against the configured PostgreSQL schema and reports whether ledger rows exist, without creating a ledger or changing application tables.

Current configured database status on 2026-11-01: all 20 registered migration postcondition sets verify, including migrations 012, 013, 016, 017, 018 and 019 (gallery). `public.schema_migrations` is absent. Therefore the schema effects are verified, but historical execution dates and ordering cannot be established from the database. No baseline was recorded and no application migration was run against this database.

The new runner supports:

- `npm run migrate:run -- --status` — read-only comparison.
- `npm run migrate:run -- --baseline-verified` — explicit, all-postconditions-passing baseline; records current source checksums and `verified_baseline` provenance. It refuses if any effect is incomplete or if ledger rows already exist.
- `npm run migrate:run -- --apply` — transactional, ordered execution with advisory locking, checksums and postcondition verification. It refuses to infer history when earlier effects already exist without ledger entries.

Review a backup or isolated database comparison before running either write mode on a shared database. The current database remains unbaselined by design.

Migration 020 aligns legacy `users.permissions` JSONB values with the application’s `TEXT[]` contract. Conversion is checked on a PostgreSQL temporary table inside a transaction that is rolled back. It preserves JSON array entries, empty arrays, SQL/JSON nulls, and wraps legacy scalar JSON values as one text-array element. The configured database already has `_text`, so 020 has no change to apply there.

## Workflow findings and changes

- Ambulance booking now locks the selected authorized driver and rejects a booking when that driver already has an active booking or emergency trip. This closes the race where one active driver attached to multiple vehicles could be assigned concurrent trips.
- The routed blood request fulfillment path (`resourceController.fulfillBloodRequest`) already serializes request handling, conditionally deducts stock, and records an inventory transaction. It now excludes expired blood stock during deduction and broadcasts the resulting live inventory after commit. This matches the existing business rule that fulfillment deducts stock; merely submitting a request does not reserve it.
- Blood request fulfillment is distinct from the unused `bloodBankController.approveBloodRequest` handler; routes call the resource controller. Check that routing remains consistent when changing this flow.

## Verification and limits

- Backend test suite: `npm test` — 80 passed, 3 skipped, 0 failed (83 total tests).
- Migration runner syntax checks passed; read-only migration status verified all 20 migrations.
- Migration 020 JSONB conversion probe passed against a temporary PostgreSQL table and was rolled back.
- No live ambulance bookings, blood requests, gallery uploads, or real patient records were created or changed during this audit.
- Socket.IO and backend authorization logic have unit coverage, but two authenticated clients were not connected for a live dispatch/GPS demonstration. No real device GPS, Android runtime, or browser Flutter workflow was exercised during this phase.
- End-to-end gallery file persistence and cross-hospital authorization were not exercised against live users. Migration status confirms the gallery schema only.

## Phase 4A authenticated API acceptance update (2026-11-01)

Added `test/liveApiAcceptance.integration.test.js`, an actual Express HTTP/API test using signed test JWTs and the configured PostgreSQL schema. Test rows run inside a rollback-only outer transaction; generated gallery files use a unique OS temporary directory and are removed. PostgreSQL sequence values may advance because PostgreSQL sequences are not transactional, but test rows are rolled back. No existing application records are deleted or updated.

Run with PowerShell from `backend/`:

```powershell
$env:RUN_POSTGRES_INTEGRATION='1'
npm run test:live-api
Remove-Item Env:\RUN_POSTGRES_INTEGRATION
```

Actual HTTP and PostgreSQL outcomes:

| Test | Role/action | Result |
| --- | --- | --- |
| API-AMB-01 | Patient posts a booking with test coordinates | HTTP 201; booking and pickup coordinates read back from PostgreSQL; status `assigned` |
| API-AMB-02 | Patient retrieves own bookings; hospital retrieves its bookings | HTTP 200; fixture booking present |
| API-AMB-03 | Another patient and an unrelated driver request booking details | HTTP 404 for both; no booking details returned |
| API-AMB-04 | Patient requests driver assignment endpoint | HTTP 403 |
| API-AMB-05 | Patient attempts second active booking using another ambulance linked to the same driver | HTTP 409; duplicate active assignment prevented |
| API-AMB-06 | Assigned driver reads assignments and posts current location | HTTP 200; stored ambulance coordinates/accuracy verified in PostgreSQL |
| API-AMB-07 | Driver completes all seven legal booking state transitions | HTTP 200 for each; completed status and completion timestamp verified in PostgreSQL |
| API-AMB-08 | Driver posts location after trip completion | HTTP 409; location update rejected |
| API-GAL-01 | Hospital uploads generated valid PNG bytes | HTTP 201; draft metadata persisted and full/thumbnail WebP files verified on disk |
| API-GAL-02 | Hospital previews draft; patient requests published gallery before publication | HTTP 200 image preview; public list empty |
| API-GAL-03 | Different hospital tries to publish the draft | HTTP 404 |
| API-GAL-04 | Owning hospital publishes; patient lists gallery | HTTP 200; published image appears |
| API-GAL-05 | Invalid image, over 8 MiB upload, and missing stored image | HTTP 400, HTTP 413, HTTP 404 respectively |

The first live run exposed PostgreSQL parameter type inference failures in ambulance driver eligibility, booking insertion, and driver booking status updates. Explicit casts fixed these failures; the complete live API suite then passed. The test coordinates are simulated fixture values and do **not** establish device GPS acceptance.

`npm test` after these changes: **80 passed, 5 skipped, 0 failed** (85 tests total). The additional skips are opt-in PostgreSQL integration tests, including this API suite.

Still unverified: actual Socket.IO multi-client room/event delivery and reconnect/reassignment behavior; active GPS from a real device; SOS-specific hospital assignment; private-driver trip lifecycle; complete patient/doctor/admin cross-role matrix; live blood request API; running Flutter UI. Flutter commands (`flutter doctor -v`, `flutter analyze --no-pub`) stalled without producing output in this environment and were interrupted, so no Flutter runtime or build result is claimed. There was no local backend UI session or Android device/emulator available for interactive acceptance.
