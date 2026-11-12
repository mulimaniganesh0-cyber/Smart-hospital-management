# Test Results Report

**Date:** 2026-11-06. **Command:** `npm test` from `backend/`.

- Total: 101 tests
- Passed: 93
- Failed: 0
- Skipped: 8
- Cancelled/todo: 0
- Duration: approximately 14.2 seconds

Skipped tests include PostgreSQL report flow, live API acceptance, PostgreSQL blood inventory, role-matrix API, pgvector integration, and two-client Socket.IO integration; an additional CareGuide case is skipped by design because directory responses are tested elsewhere. Therefore this result proves only the runnable backend test suite, not database integrity or end-to-end readiness.

Flutter analysis, Flutter tests, production build, and live deployment smoke tests have not been run in this discovery pass. See `docs/phase5-live-acceptance-report.md` for prior project notes, which are not a substitute for fresh execution.
