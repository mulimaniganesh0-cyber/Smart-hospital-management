# API Audit Report

**Status:** Route-level inventory is partial; endpoint behavior and response compatibility are not fully verified.

Express mounts route groups for auth, hospitals, specialties, patients, appointments, emergency, driver, blood bank, ambulance, admin, resources, reports, campaigns, roles, chatbot, medical, queues, notifications, family, doctor portal, gallery-related hospital paths, and related modules. Endpoint declarations live in `backend/src/routes/`.

The medical router applies authentication globally. Several endpoints rely on controller-level patient/appointment scoping; this requires cross-role integration tests. Emergency exposes a token-based location endpoint and authenticated SOS/dispatch endpoints. Socket.IO has separate authenticated subscriptions and should be audited alongside REST.

Backend test command: `npm test` (results in `TEST_RESULTS_REPORT.md`). PostgreSQL/live API suites were skipped. A complete method/path/auth/role/request/response matrix and Flutter call compatibility check remain outstanding.
