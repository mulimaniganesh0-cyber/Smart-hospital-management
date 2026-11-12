# Phase 2 reliability audit

Static audit performed before the implementation changes in this phase. Existing workspace changes were preserved. Database-dependent findings remain unverified unless marked otherwise.

## Integration checklist

| Area | Current implementation found | Follow-up |
| --- | --- | --- |
| Patient portal | Patient dashboard, bookings, profile, family medical records, health summary and report timeline APIs exist. Published records are filtered in the timeline. | [ ] Verify report access with two real patient accounts against PostgreSQL. |
| Hospital portal | Profile, staff, resources, ambulance and gallery routes exist; hospital ownership is checked by controllers. | [ ] Verify role and hospital ownership cases against a real database. |
| Doctor portal | Authenticated profile, schedule, appointments, patient context, reports and prescriptions exist. Report writes target both `doctor_consultation_reports` and `medical_records`. | [ ] Verify migrations 012/013 and clinical persistence against PostgreSQL. |
| Driver portal | Driver identity/status checks, ambulance assignment checks, trip transitions, history, GPS and assignment-specific socket rooms exist. | [ ] Verify managed and private driver assignment rows against PostgreSQL. |
| Admin portal | Dashboard, hospital review, resource/blood administration and private-driver review routes exist. | [ ] Exercise each admin route with non-admin and admin tokens. |
| Appointments | Patient booking/slot/reschedule and hospital status routes exist; unique active doctor-slot index is created by initialization. Doctor transitions are ownership-scoped. | [ ] Verify booking conflicts and schedule edge cases on PostgreSQL. |
| Reports/prescriptions | Patient timeline selects only published records; report persistence is transactional after prior phase changes. | [ ] Run patient-doctor-patient workflow with production-shaped schema. |
| Medical records | Record access checks ownership or authorized family access for patient timeline; doctor context is appointment-scoped. | [ ] Add/execute cross-patient report-ID authorization integration tests. |
| Resources | Input validation and DB check constraints are present; migration 018 uses `NOT VALID` so legacy rows are preserved. | [ ] Validate legacy rows and constraints after review; do not validate blindly. |
| Blood bank | Inventory service has normalization, transactional stock updates and tests; patient request submission has a separate path from fulfillment. | [ ] Verify request visibility, inventory reservation policy and concurrency on PostgreSQL. |
| Ambulance/SOS | Booking and emergency routes, dispatch, assignment and location sharing exist. Terminal booking paths clear pickup location and leave assignment rooms. | [ ] Verify full patient/hospital/driver SOS lifecycle and location privacy with live sockets. |
| Gallery | Private storage, image re-encoding, size/content checks, draft/published distinction and per-hospital access tests exist. Migration 019 is additive. | [ ] Verify actual storage and DB behavior on deployment filesystem. |
| Notifications | Persistent notification service and read API exist; multiple controllers emit after DB work. | [ ] Audit all notification call sites for commit ordering and duplicate delivery. |
| CareGuide/RAG | Ollama and database retrieval paths exist; routing and RAG tests cover policy and retrieval helpers. | [ ] Execute local Ollama + pgvector integration and validate multilingual retrieval quality. |
| Flutter quality | Doctor/driver/patient modules and portal tests exist. Flutter commands produced no output in the restricted SDK location during this audit. | [ ] Run doctor/analyze/test/web build with permitted Flutter SDK access. |

## High-priority findings

1. In migration 017, alias `a` is the `ambulances` table. The failing reference is `a.driver_user_id`; migration 016 defines that column. The booking backfill copies the ambulance's assigned driver to `ambulance_bookings.driver_user_id`. The reported error means migration 016's source column is absent in the target schema at the moment 017 executes.
2. The targeted `migrate:driver-authorization` script applies 016 before 017, in one transaction, when required objects are missing. A read-only status check against the configured `hospital_resource_db` / `public` now reports `driver_type=true`, `driver_status=true`, and no missing 016 objects. A separate read-only column query confirms the driver, patient tracking, report publication, and doctor activation columns exist. The earlier `a.driver_user_id` error does not describe the current database state. No database migration was applied.
3. The generic migration runner executes every SQL file on every run and has no migration-history table. A read-only query confirms `public.schema_migrations` is absent. Existing migrations are mostly additive/idempotent, but this is not a reliable record of which migrations succeeded and makes it hard to diagnose partial deployments.
4. JWT verification and signing had a hardcoded development-secret fallback. This phase limits that fallback to non-production and makes production startup require a configured secret of at least 32 characters.
5. Doctor report APIs require schema from migrations 012 and 013. Startup schema creation does not add the publication/report columns, so a successful backend boot alone does not prove those endpoints work.
6. Most workflow tests use mocked database responses; pgvector integration is skipped when its test database is unavailable. This phase adds a rollback-only PostgreSQL integration test for report draft/publish, patient report and prescription retrieval, notifications, and cross-patient denial. That clinical workflow passed against `hospital_resource_db`.
7. Initial Flutter invocations stalled inside the restricted SDK location. With SDK execution permitted, `flutter doctor -v` completes; `flutter analyze` is clean, all 15 Flutter tests pass, and the web build succeeds. The web build reports existing WebAssembly compatibility warnings from `share_plus` and `geolocator_web` using `dart:html`. Android SDK licenses are not accepted.

## Work order

- [x] Identify the missing driver-column dependency and the table/alias it belongs to.
- [x] Make migration 017 resilient to an unapplied 016 driver-column definition, without changing existing driver records.
- [x] Improve migration diagnostics without printing credentials.
- [x] Remove the production JWT fallback and add regression coverage.
- [ ] Establish migration history/status for deployed databases without falsely marking unverified migrations as applied.
- [x] Verify report/prescription persistence, patient retrieval, notification persistence, and cross-patient denial against PostgreSQL in a rollback-only transaction.
- [ ] Verify driver workflow, blood inventory, gallery, and role boundaries against PostgreSQL.
- [x] Run Flutter doctor, analyze, and tests with a working SDK execution context.
- [x] Finish Flutter web build and verify its result.
