# Ngrok blank screen investigation

## Findings

The repository does not contain evidence of one observed browser session or
console trace, so a runtime exception cannot be claimed as the confirmed cause.
The checked-in deployment configuration does contain several concrete failure
paths that explain a blank/wrong page or a frontend that cannot reach its API:

1. **The repository root is not the Flutter web app.** Its untracked root
   `index.html` contains only `hello world`; Flutter's entry point is
   `frontend/web/index.html`. Serving the repository root displays that plain
   page instead of the app.
2. **The actual backend port is 5001.** `backend/server.js`, the local
   environment, and most README commands use 5001, while one Flutter README
   command used 5000. A tunnel or Dart define using 5000 therefore targets the
   wrong port.
3. **A public Flutter build must receive public API and Socket.IO URLs.** The
   client is configured through `API_BASE_URL` and `SOCKET_URL`; its release
   fallback is deliberately `https://api.invalid/api`. A successful frontend
   page load with omitted or stale defines cannot authenticate or load data.
4. **Socket.IO origin handling differed from REST CORS.** REST allowed local
   development origins when no allowlist was configured, while Socket.IO was
   given an empty origin list, rejecting browser connections. Socket.IO now
   applies the equivalent development exception and exact production allowlist.
5. **Production CORS must include the current frontend ngrok origin.** The
   example environment only lists localhost. Ngrok assigns changing hostnames;
   leaving the example origin in place causes browser preflight/API and realtime
   requests to fail.

The Flutter entrypoint calls `runApp` immediately and `MaterialApp` falls back
to `LandingScreen`; it does not wait for the API or Ollama before rendering.
The inspected startup flow therefore does not support the theory that an
ordinary API outage alone prevents the login/landing UI from rendering.

## Changes made for this investigation

- Updated `frontend/README.md` to use the repository's actual backend port and
  clarify that the Flutter web root is `frontend/`.
- Updated Socket.IO CORS to match the REST development and production origin
  policy. Production continues to require an exact configured origin.

## Verification limit

No live ngrok URLs or browser session were provided. Public browser behavior,
phone access, live database connectivity, and Socket.IO through ngrok must be
verified using the steps in `NGROK_DEPLOYMENT_GUIDE.md`. Test command outcomes
are recorded in `NGROK_TEST_RESULTS.md`.
