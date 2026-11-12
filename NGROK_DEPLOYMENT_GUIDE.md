# Public ngrok deployment

This project uses Flutter web in `frontend/` and Express plus Socket.IO on
backend port **5001** by default. Use two HTTPS ngrok tunnels. PostgreSQL and
Ollama stay local to the backend machine and must not be tunneled.

## Start the local services

1. Start PostgreSQL and confirm the database configured by `backend/.env` is
   available. Keep credentials in that ignored file; never put them in Dart
   defines or frontend source.
2. Start Ollama locally and make sure the configured `OLLAMA_MODEL` is pulled.
   The server uses `OLLAMA_BASE_URL` (normally `http://localhost:11434`).
   Ollama is optional for app/login availability and is not publicly exposed.
3. In `backend/`, install dependencies if needed, then run:

   ```powershell
   npm install
   npm run dev
   ```

   Confirm `http://localhost:5001/api/health`. The health result reports
   PostgreSQL and Ollama separately; Ollama being unavailable degrades AI but
   should not prevent the Flutter shell from loading.
4. In a second terminal, start Flutter web from the frontend directory:

   ```powershell
   cd frontend
   flutter pub get
   flutter run -d web-server --web-hostname 0.0.0.0 --web-port 3000 `
     --dart-define=API_BASE_URL=https://YOUR-BACKEND.ngrok-free.app/api `
     --dart-define=SOCKET_URL=https://YOUR-BACKEND.ngrok-free.app
   ```

   Flutter build-time defines are compiled into the app. The user-facing
   browser must use the public backend URL; `localhost` in a browser would
   refer to each visitor's own device.

## Start both tunnels

Open two more terminals:

```powershell
ngrok http 3000
```

```powershell
ngrok http 5001
```

Copy the HTTPS forwarding origin from each terminal. Set the frontend tunnel
origin (scheme and host, no path) in `backend/.env`:

```dotenv
FRONTEND_URL=https://YOUR-FRONTEND.ngrok-free.app
ALLOWED_ORIGINS=https://YOUR-FRONTEND.ngrok-free.app
```

Restart the backend after changing the origin. When either hostname changes,
update `ALLOWED_ORIGINS` and `FRONTEND_URL`, restart the backend, and restart
Flutter with the new backend URL defines. This keeps changing ngrok addresses
out of application source. If you have reserved ngrok domains, use them to
avoid repeating these updates.

The backend's current `.env` is local and ignored by Git. Do not commit it.
Use `backend/.env.example` as the template and replace its sample values with
strong secrets and actual service settings. Never tunnel ports 5432 or 11434,
and do not expose ngrok's local inspection interface.

## Verify the deployment

1. Open `https://YOUR-FRONTEND...` on the host machine and a separate phone or
   computer. Confirm the CareSync landing/login screen appears.
2. Open `https://YOUR-BACKEND.../api/health`. Confirm `database: true` for full
   database functionality. `ollama: false` only disables/degrades CareGuide.
3. In browser developer tools, check that API and Socket.IO requests target
   the backend HTTPS ngrok hostname, never `localhost`, `127.0.0.1`, or an
   `http://` URL. A browser `https` page must use HTTPS/WSS endpoints.
4. Sign in with a test account and confirm its role dashboard loads. Check a
   public hospital listing, then test a protected operation and notification
   flow with appropriate test data.
5. For REST CORS, send an OPTIONS request with the frontend origin and verify
   the response includes that exact `Access-Control-Allow-Origin`. For
   Socket.IO, verify the browser establishes a websocket/polling connection
   without a CORS error.
6. Close or stop the backend and reload the frontend. The landing/login UI
   should still render; sign-in should show a connection error rather than an
   indefinite spinner. Restore the backend before testing protected features.

## Common failures

- **Plain `hello world` page:** the repository root is being served. Start
  Flutter from `frontend/`; its entry document is `frontend/web/index.html`.
- **Connection refused / 502:** the backend listens on 5001 by default. Ensure
  ngrok forwards 5001 and that the backend is running.
- **Browser calls localhost or `api.invalid`:** restart Flutter with both
  correct public `--dart-define` values. Defines are embedded at compile/run
  time and cannot be changed by editing backend `.env`.
- **CORS error:** add the exact frontend HTTPS origin (scheme and host, without
  trailing slash) to `ALLOWED_ORIGINS`, then restart the backend.
- **REST works, realtime does not:** confirm `SOCKET_URL` is the backend
  origin, backend and frontend use the same current hostname, and the
  Socket.IO handshake is authenticated with a valid JWT.
- **Login/dashboard fails while page renders:** inspect `/api/health`, backend
  logs, and the failed network request. PostgreSQL is required for most
  authenticated features; Ollama is only required for AI functions.
- **Refresh on nested route returns 404:** the current Flutter app uses
  `MaterialApp` routes; the web host must serve the Flutter entrypoint as its
  fallback for paths.

## Security notes

Keep `JWT_SECRET`, database credentials, email credentials, and provider keys
only on the backend. Keep JWT authentication enabled. Configure exact
production origins in `ALLOWED_ORIGINS`; do not use wildcard CORS. Health
checks disclose dependency status but no credentials. Use test accounts and
avoid real patient information over a temporary public tunnel.
