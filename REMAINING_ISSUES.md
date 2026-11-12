# Remaining Issues

All items below remain open after discovery; severity is preliminary.

1. **High:** Run DB-backed role/ownership tests for patient records, family shares, doctor appointments/reports, hospital resources, and cross-hospital access.
2. **High:** Execute SOS lifecycle tests including competing assignments, rejected dispatch, stale GPS, reconnect, worker restart, location expiry/revocation, and authorized socket delivery.
3. **High:** Test appointment/ambulance/resource/blood concurrency against PostgreSQL and verify constraints/ledger consistency.
4. **High:** Validate deployed release configuration for API HTTPS, WSS, CORS, and Android/web access; test from a separate network/device.
5. **Medium:** Run Flutter analyze, all Flutter tests, and release builds; none were run in this discovery pass.
6. **Medium:** Reconcile AI providers with local Ollama-only preference; verify patient data handling, grounding and medical escalation/fallback policy.
7. **Medium:** Review the numerous pre-existing dirty/untracked files, including `backend/doctor-account-roster.csv`, database backup, and generated caches, for provenance and sensitive data. Do not discard or publish them without review.
8. **Medium:** Produce the full API endpoint/role-permission matrix and compare all Flutter calls to backend routes.
9. **Low:** Run static dependency/license and production build-size review after resolving the worktree baseline.
