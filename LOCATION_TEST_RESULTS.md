# Location Test Results

**Date:** 2026-11-06

## Automated checks

- `flutter pub get`: passed; dependencies resolved (91 packages have newer versions outside current constraints).
- `flutter analyze`: passed after removing an unused `_locationAccuracy` field; output: `No issues found! (ran in 6.6s)`.
- `flutter test`: passed; 24 tests, `All tests passed!`.
- Backend `npm test`: rerun after the location changes; 93 passed, 0 failed, 8 skipped (101 total; approximately 14.2 seconds). These tests do not exercise Flutter location acquisition.

### Review of the 8 skipped backend tests

- Location-relevant: the live ambulance dispatch API test uses simulated coordinates; the two-client Socket.IO integration test covers authorized location delivery; both require `RUN_POSTGRES_INTEGRATION=1` and PostgreSQL.
- Other PostgreSQL integration skips: hospital gallery workflow, doctor/admin role matrix, PostgreSQL report flow, and blood inventory integration. They are not GPS-specific.
- RAG skips: one directory grounding case is skipped because routing tests cover it; pgvector integration requires `RAG_TEST_INTEGRATION=1` and PostgreSQL/pgvector. Neither verifies GPS.
- These integration tests were not enabled because the configured database target was not confirmed disposable. Do not enable them against a production database.

Flutter tests currently contain no direct tests for `LocationService`, browser permission/max-age behavior, SOS coordinate submission, or ambulance booking GPS acquisition. The passing Flutter suite therefore confirms general widget/API behavior only, not the location fix itself.

## Not performed

The requested physical tests near Basavan Bagewadi, movement tests, GPS disabled/approximate-permission tests, offline/online synchronization, SOS/ambulance map validation, Android install, and Flutter Web over HTTPS/ngrok require a real handset/browser and deployed endpoint. They were not available here. No claim of physical GPS correctness is made.

## Manual verification procedure

1. Build/run Android and Flutter Web over HTTPS; grant precise location and record displayed accuracy and fix time.
2. Compare coordinates at acquisition, SOS/API payload, authenticated backend receipt, persisted row, authorized Socket.IO event, and map marker using a temporary secured test environment.
3. Repeat after moving, with GPS disabled, permission denied/approximate, and network disconnected/reconnected.
4. Confirm a failed/stale fix produces a retryable message and never reuses an earlier city coordinate.
5. Verify patient and driver markers remain separate and that location access remains restricted to authorized trip participants.

Out-of-order updates have not been verified against PostgreSQL. The REST update paths currently apply a rate limit and a freshness window, but a DB-backed concurrency check comparing each persisted device-fix timestamp with the last accepted device-fix timestamp remains required before claiming ordering safety.
