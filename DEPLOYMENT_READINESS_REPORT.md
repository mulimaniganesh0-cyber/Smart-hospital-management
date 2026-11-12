# Deployment Readiness Report

**Status:** Not verified against a remote host/device.

Backend defaults to port 5001 per project documentation. Flutter gets API and Socket.IO URLs through `API_BASE_URL` and `SOCKET_URL`; release mode intentionally falls back to `https://api.invalid/api`, so release builds require correct defines. CORS and Socket.IO origins come from `ALLOWED_ORIGINS` or `FRONTEND_URL`.

Before sharing externally, verify HTTPS/WSS end-to-end, proxy headers/timeouts, WebSocket upgrade, Flutter web asset base path, Android physical-device routing, and API/socket URL parity. Confirm PostgreSQL 5432 and Ollama 11434 are not publicly exposed. No ngrok URL, external device, production credentials, or cost plan was available for validation; the ₹2,000/month target and local Ollama requirement remain unverified.
