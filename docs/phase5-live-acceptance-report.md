# Phase 5 live acceptance report

Date: 2026-11-01

This report records the checks completed in this Phase 5 pass. `VERIFIED` means the described behavior ran successfully in the stated environment. `NOT VERIFIED` means it was not exercised. `BLOCKED` means an environmental or access requirement prevented the check.

## Socket.IO dispatch and location

**VERIFIED** — `RUN_POSTGRES_INTEGRATION=1 npm run test:socket-live` passed against the configured PostgreSQL database with two real WebSocket clients, signed JWTs, the application Socket.IO server, and rollback-only PostgreSQL fixtures.

The test verifies hospital assignment, patient and assigned-driver room access, denial of unrelated users, rejection of forged assignment and client-published location events, driver location persistence and delivery, reassignment revocation, reconnect behavior, all seven legal emergency trip transitions, post-completion access denial, and invalid/expired JWT rejection. Test rows were rolled back. PostgreSQL sequence values may advance. Coordinates are test fixtures, not device GPS readings.

## Authenticated HTTP authorization

**VERIFIED (partial matrix)** — `RUN_POSTGRES_INTEGRATION=1 npm run test:live-api` passed all three tests, including the authenticated role matrix. It checked patient self-access and cross-patient denial, patient write restrictions, hospital self-access and cross-hospital resource isolation, doctor appointment ownership and status update, doctor timeline access without a grant, driver denial of admin routes, admin user listing, and rejection of public admin registration. Rejected cross-hospital mutation left the fixture resource unchanged. The live API suite also verified ambulance booking/location lifecycle and gallery upload/publish isolation.

**NOT VERIFIED** — This is not an exhaustive role-by-endpoint audit. Other endpoints, permission combinations, and production identity-provider flows were not exercised.

| Account | Live endpoint/action | Result |
| --- | --- | --- |
| Patient A | `GET /api/patients/profile` | 200; own profile |
| Patient B | Read Patient A timeline | 403; protected description absent |
| Patient | Write doctor report; hospital profile; admin users | 403 for each |
| Hospital A | `GET /api/hospitals/profile` | 200 |
| Hospital A | Modify Hospital B resources through admin route | 403; database value unchanged |
| Doctor B | List and update own appointment | 200; status persisted |
| Doctor A | Update Doctor B appointment | 404; appointment stayed pending |
| Doctor A | Read patient timeline without grant; hospital profile; admin users | 403 for each |
| Driver A | Admin users | 403 |
| Admin | Admin users | 200 |
| Public registration | Attempt to register as admin | 400; no account inserted |

Driver booking access, unrelated-driver denial, patient booking ownership, and location permissions are separately covered by the live ambulance HTTP and Socket.IO acceptance suites. **NOT VERIFIED** — Hospital impersonation controls, doctor report publication rules, all report/prescription routes, the full inventory endpoint matrix, all driver trip mutation cases, and every admin permission were not exhaustively probed.

## Blood bank

**VERIFIED (automated regression only)** — The backend unit suite passed the blood request validation and stock deduction tests, including request locking and conditional inventory debit.

**NOT VERIFIED** — No authenticated live blood-bank request was submitted against PostgreSQL as part of this Phase 5 pass. No live inventory was changed.

## Flutter and Android

**VERIFIED** — `flutter analyze --no-pub` reported no issues; `flutter test --no-pub` passed 15 tests; and `flutter build web --release` completed. `flutter doctor -v` found Flutter 3.41.3 / Dart 3.11.1 and Android SDK 36.1.0 / JDK 17 installed. Its report noted Android SDK licenses are not accepted. The sandboxed Flutter invocation initially stalled while accessing the SDK; rerunning with SDK access completed analyze, tests and web build. No Dart analysis-server failure was identified.

**VERIFIED (emulator available)** — Android emulator `emulator-5554` booted (Android 16 / API 36).

**NOT VERIFIED** — There is no physical Android device attached, so real GPS and physical-device location permission behavior were not tested. Permission denied, permanently denied, system GPS disabled, and actual GPS updates were not exercised.

**BLOCKED** — `flutter build apk --debug --no-pub -v` progressed through Gradle setup and Kotlin compilation but stopped producing output and was interrupted after extended waiting without a completion result. The Android app was not installed or launched, so Android portal workflows were not accepted. The local Flutter toolchain also reports unaccepted Android SDK licenses. These environment issues prevented finishing the Android build/runtime check; emulator boot alone is not acceptance evidence.

**NOT VERIFIED** — No authenticated backend session and dedicated portal test accounts were used for end-to-end Flutter navigation and actions. Patient, hospital, doctor, driver and admin portal workflows were not run in an actual Flutter runtime.

## Backend regression checks

**VERIFIED** — `npm test` completed with 80 passed, 0 failed, and 7 skipped (87 tests total). The skipped cases include opt-in PostgreSQL/socket integrations and a test explicitly skipped by its own condition. The live PostgreSQL suites were run separately as listed above.

**VERIFIED** — `RUN_POSTGRES_INTEGRATION=1 npm run test:postgres-report` passed (1 test). A sandboxed attempt returned PostgreSQL `EACCES`; rerunning with the approved local database access passed. `git diff --check` completed without whitespace errors; Git emitted line-ending normalization warnings for existing modified files.

The socket test exposed and prompted a PostgreSQL parameter type correction in emergency status handling. The doctor appointment live API test exposed and prompted a similar status parameter correction. Both corresponding live flows passed after the fixes.

## Commands

From `backend/` in PowerShell:

```powershell
$env:RUN_POSTGRES_INTEGRATION='1'
npm run test:live-api
npm run test:socket-live
Remove-Item Env:\RUN_POSTGRES_INTEGRATION
npm test
```

From `frontend/`:

```powershell
flutter analyze --no-pub
flutter test --no-pub
flutter build web --release
flutter build apk --debug --no-pub
```

The PostgreSQL integration suites use the configured local database and rollback their inserted fixture rows. No migration was applied and no pre-existing application rows were intentionally modified by the acceptance suites.
