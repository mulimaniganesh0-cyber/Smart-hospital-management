# Ngrok deployment test results

Date: 2026-11-12

## Automated checks run

| Check | Result | Notes |
|---|---|---|
| Backend automated suite (`npm test`, from `backend/`) | **Passed** | 101 tests, 93 passed, 0 failed, 8 skipped. Skips include database- and live-Socket.IO integration cases requiring services/fixtures. |
| Backend JavaScript syntax (`node --check server.js`) | **Passed** | No syntax errors. |
| Whitespace check (`git diff --check`, scoped to changed deployment files) | **Passed** | Only a line-ending normalization warning for the edited frontend README. |
| Flutter static analysis (`flutter analyze`) | **Not completed** | The Flutter command produced no output and did not complete in this environment; it was stopped after waiting. |
| Flutter automated tests (`flutter test`) | **Not completed** | The Flutter command produced no output and did not complete in this environment; it was stopped after waiting. |
| Flutter web release build | **Not run** | Requires a working Flutter toolchain invocation; see above. |

## Live checks not performed

No live public ngrok URLs were supplied. The following remain manual deployment
checks: PostgreSQL connectivity, `/api/health`, public API and CORS preflight,
JWT login through the public API, authenticated Socket.IO over ngrok, loading
Flutter web assets on desktop and mobile, backend/database/Ollama outage
behavior, and refresh on a nested route. Use the checklist in
`NGROK_DEPLOYMENT_GUIDE.md` after starting the local services and tunnels.

The backend unit suite passing does not verify an actual tunnel or database.
Eight skipped tests are reported as skipped, not passed.

## Security review notes

- Flutter uses build-time `API_BASE_URL` and `SOCKET_URL`; public browser
  requests should use the backend's HTTPS ngrok origin.
- REST and Socket.IO production origins are configured by exact
  `ALLOWED_ORIGINS` entries; do not use `*`.
- `.gitignore` excludes `**/.env`; keep database and JWT secrets backend-only.
- Review the existing local `backend/.env` and replace any development/sample
  credentials with unique strong secrets before exposing the service publicly.
- PostgreSQL and Ollama are not included in the tunnel commands.
- No patient-data logging or authentication changes were made for this task.
