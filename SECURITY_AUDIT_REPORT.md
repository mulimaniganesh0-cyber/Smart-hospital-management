# Security Audit Report

**Status:** Preliminary static review only (2026-11-06). No penetration test or live DB test performed.

## Controls observed

- JWT verification and database user reload in `backend/src/middleware/auth.js`; token-version and account-state checks are present.
- Production JWT secret validation in `backend/src/config/jwt.js`.
- Socket handshake JWT validation and private room joins in `backend/server.js`; event-policy helpers are present.
- Helmet, CORS allowlisting, and generic API rate limiting in `backend/src/app.js`.
- Driver access is checked against active DB assignment in `requireActiveDriver`.
- Medical routes apply `protect` router-wide; sensitive record access still depends on controller ownership checks.

## Issues / follow-up

| Severity | Item | Required evidence/action |
|---|---|---|
| High | Medical/appointment access control not yet proven across all controller paths. | Run DB-backed cross-patient, cross-doctor, cross-hospital IDOR tests for reads, edits, reports, prescriptions and family permissions. |
| High | Live emergency location route uses an unguessable capability token path. | Verify token entropy, hash-only storage, expiry, revocation, scope, logging/redaction, and no leakage through analytics/referrers. |
| Medium | Production CORS is configured from `ALLOWED_ORIGINS`/`FRONTEND_URL`; unset means no browser origins are allowed. | Verify exact deployed origin list and Socket.IO CORS in production. |
| Medium | Request body size is 50 MB globally. | Bound JSON payloads separately from authenticated image uploads; test memory pressure and oversized requests. |
| Medium | One generic rate limit covers `/api/`; auth-specific brute-force protections were not confirmed. | Verify login/reset abuse controls and proxy-aware client IP configuration. |
| Medium | Startup admin provisioning uses configured shared `ADMIN_PASSWORD`. | Confirm bootstrap secret rotation and that existing accounts are not silently reset; inspect operational procedure. |
| Review | AI provider paths include Gemini/OpenAI despite local Ollama requirement. | Confirm no patient identifiers/records are transmitted externally unless explicitly approved and documented. |

No secrets or `.env` values were copied into this report. Security status remains **not cleared** pending authorization integration tests and deployment configuration review.
