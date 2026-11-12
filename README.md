# Smart Hospital Resource Management & Clinical Ecosystem

A production-grade healthcare operations and intelligence platform built with **Flutter**, **Node.js (Express & Socket.IO)**, **PostgreSQL (pgvector)**, and **Ollama / Gemini AI**.

The system connects **Patients**, **Hospitals**, **Doctors**, and **Administrators** into a unified real-time ecosystem featuring dynamic daily QR check-in, digital OPD queuing with smart ETA calculation, automated emergency SOS dispatch escalation, ambulance telemetry, blood bank inventory audits, appointment scheduling, and the **CareGuide AI** medical assistant.

---

## Architecture & Technology Stack

| Domain | Technology | Purpose |
| --- | --- | --- |
| **Client Application** | Flutter / Dart 3.x | Cross-platform web and mobile UI for Patients, Hospital Staff, Doctors, and Admins. |
| **API & Real-time Server** | Node.js 18+, Express, Socket.IO | Authenticated REST endpoints, WebSocket room broadcasting, and background workers. |
| **Operational Database** | PostgreSQL 14+ | Relational persistence for users, hospitals, doctors, appointments, queues, inventory, and audit logs. |
| **Vector Search & RAG** | PostgreSQL + `pgvector` (HNSW Indexing) | 768-dimensional medical document chunk storage and cosine-similarity retrieval. |
| **Local AI Inference** | Ollama | Local embeddings via `nomic-embed-text:latest`; local generation via `llama3.2:latest`. |
| **Cloud AI (Optional)** | Google Gemini API | Cloud-based fallback and multimodal medical intelligence. |

```
                       ┌─────────────────────────────────────────┐
                       │        Flutter Client Application       │
                       │   (Patient | Hospital | Doctor | Admin) │
                       └─────────────┬───────────────────┬───────┘
                                     │ HTTP REST         │ Socket.IO
                                     ▼                   ▼
                       ┌─────────────────────────────────────────┐
                       │     Node.js Express & Socket.IO API     │
                       │ ─────────────────────────────────────── │
                       │  • RBAC & Auth        • Queue & Daily QR│
                       │  • SOS Escalation     • Doctor Portal   │
                       │  • Blood Consistency  • CareGuide AI    │
                       └──────────────┬──────────────────┬───────┘
                                      │                  │
                      SQL & Vector    ▼                  ▼  Embeddings & RAG
             ┌──────────────────────────────┐     ┌──────────────────────┐
             │    PostgreSQL + pgvector     │     │ Ollama / Gemini API  │
             │ ──────────────────────────── │     │ ──────────────────── │
             │ • Operational Relational DB  │     │ • nomic-embed-text   │
             │ • HNSW Vector Chunks (768d)  │     │ • llama3.2:latest    │
             └──────────────────────────────┘     └──────────────────────┘
```

---

## Key Modules & Recent Updates

### 1. Dynamic Daily QR Code Check-In
- **Daily Timezone-Anchored Rotation**: Hospitals generate cryptographically signed daily QR codes tied to `HOSPITAL_TIMEZONE` (default: `Asia/Kolkata`), refreshing automatically at midnight.
- **Contactless Mobile Check-In**: Patients scan the hospital's QR code using the in-app Flutter camera scanner (`patient_qr_scanner.dart`) to instantly generate a digital OPD queue token.

### 2. Digital OPD Queue & Real-Time Timing Engine
- **Token & Counter Workflow**: Full lifecycle tracking (`waiting` → `called` → `in_consultation` → `completed` / `skipped`) across hospital departments and counters.
- **Smart ETA Calculations**: Background workers evaluate rolling average consultation durations to compute real-time expected wait times.
- **Turn Approaching Notifications**: Dispatches automated in-app notifications and Socket.IO alerts when a patient is next in line.

### 3. Dedicated Doctor Portal & Clinical Scheduling
- **Doctor Role & Dashboard**: Secure authentication and custom dashboard (`doctor_dashboard_screen.dart`) for credentialed doctors.
- **Live Consultation Workflow**: View today's appointments, toggle real-time availability, mark consultations as in-progress, and submit digital clinical reports.
- **Appointment Availability Engine**: Prevents double-booking and validates doctor working days, daily consultation limits, and time slots (`appointmentAvailabilityService.js`).

### 4. Emergency SOS Dispatch & Auto-Escalation
- **One-Touch Emergency SOS**: Patients trigger instant emergency alerts with verified GPS coordinates and entrance routing.
- **Multi-Hospital Auto-Escalation**: If the target hospital does not respond within `EMERGENCY_HOSPITAL_RESPONSE_TIMEOUT_SECONDS` (default: 30s), the background dispatcher (`npm run worker:sos-dispatch`) automatically reassigns and escalates the SOS to the next nearest hospital within `EMERGENCY_SEARCH_RADIUS_KM`.
- **SMS Webhook Integration**: Supports dispatching automated emergency notifications to emergency contacts via external SMS providers (`SMS_WEBHOOK_URL`).

### 5. Ambulance Fleet Dispatch & Live Telemetry
- **Driver Portal**: Responsive dashboard with assigned emergencies, active trip controls, ambulance details, paginated trip history, dispatch notifications, and profile/logout.
- **Ordered Trip Workflow**: Assignment acceptance, response to pickup, arrival, patient pickup, transport, hospital arrival, and completion are checked against the current database status.
- **Scoped Location Sharing**: A driver can explicitly share a fresh GPS fix during an active assignment. The API verifies driver/ambulance ownership, persists the fix, and sends it only to the assigned driver, patient, and hospital rooms; the portal does not collect location in the background.

### 6. Persistent Multi-Channel Notification Center
- **In-App Notification Center**: Centralized notification management (`notification_center.dart`) with unread counters, read state toggles, and direct deep-linking.
- **Dual Delivery Pipeline**: Critical events (appointments, queue calls, SOS updates, blood request decisions) persist in PostgreSQL while broadcasting instantaneously through private user WebSocket rooms.

### 7. Blood Bank Management & Audit Consistency
- **Atomic Inventory Updates**: Concurrency-safe inventory increments and deductions prevent overselling or race conditions.
- **Real-Time Consistency Audits**: Automated audit tool (`npm run verify:blood-inventory`) compares ledger records with actual stock units.
- **Batch & Shelf-Life Tracking**: Expiry date alerts and critical threshold monitoring for all blood groups (`A+`, `A-`, `B+`, `B-`, `AB+`, `AB-`, `O+`, `O-`).
- **Donation Campaigns**: Separate registration from completed donation records, crediting blood stock only after clinical verification.

### 8. CareGuide AI & Medical RAG Corpus
- **Dual AI Engine**: Fast local generation through Ollama (`llama3.2:latest`) with Google Gemini cloud integration.
- **5 Comprehensive Medical Datasets**:
  - `conversational_medical_dataset.json`: Patient-doctor clinical dialogues.
  - `medical_dataset_age_aware_600.json`: Age-stratified triage rules (Pediatric, Adult, Geriatric).
  - `medication_aware_patient_dataset.json`: Dosage awareness, contraindications, and drug interactions.
  - `verified_patient_conversational_dataset.json`: Clinical Q&A across multiple specialties.
  - `exercise_yoga_patient_dataset.json`: Over 115,000 lines of physical rehabilitation, therapeutic yoga, and lifestyle regimens.
- **Multi-Turn Contextual Memory**: Persists conversation state, age triage, and language context (English, Hindi, Kannada) across query follow-ups.
- **Structured Flutter UI Cards**: Intent classifier routes queries directly into native Flutter cards (Bed cards, Blood cards, Doctor cards, Hospital directory, and SOS emergency cards).

---

## Directory Layout

```
Smart-hospital-management/
├── backend/
│   ├── data/medical/             # Curated clinical datasets for RAG ingestion
│   ├── scripts/                  # Data ingestion, auditing, and testing tools
│   ├── src/
│   │   ├── config/               # Database pool, RAG configuration, and schema setup
│   │   ├── controllers/          # Business logic controllers (Auth, Doctors, Queues, SOS, etc.)
│   │   ├── middleware/           # JWT auth, RBAC authorization, and error handlers
│   │   ├── migrations/           # Versioned SQL migrations (001 through 016)
│   │   ├── models/               # Database models (User, Hospital, Patient)
│   │   ├── routes/               # Express routing definitions
│   │   ├── scripts/              # Migration runners, dispatch workers, and seeders
│   │   └── services/             # Core engines (CareGuide, RAG, Queues, SOS, Blood Bank)
│   ├── test/                     # Unit and integration test suites
│   ├── server.js                 # HTTP and Socket.IO initialization
│   └── package.json              # Backend dependencies and CLI scripts
├── frontend/
│   ├── lib/
│   │   ├── config/               # App configuration and environment setup
│   │   ├── models/               # Dart models (Hospital, Doctor, Chat, etc.)
│   │   ├── providers/            # State management providers
│   │   ├── screens/              # UI screens organized by role (admin, hospital, doctor, patient)
│   │   ├── services/             # API client, WebSocket listener, location services
│   │   ├── widgets/              # Reusable UI components, notification center, cards
│   │   └── main.dart             # Flutter entrypoint and role-based routing
│   └── pubspec.yaml              # Flutter dependencies and asset registrations
└── README.md                     # Project overview and reference guide
```

---

## Prerequisites

- **Node.js**: 18.x or 20.x LTS with `npm`
- **PostgreSQL**: 14+ with the `vector` extension installed (`pgvector`)
- **Flutter SDK**: `>=3.0.0 <4.0.0` with Dart SDK
- **Ollama** (for local AI inference): [ollama.com](https://ollama.com/)
  ```powershell
  ollama pull nomic-embed-text:latest
  ollama pull llama3.2:latest
  ```

---

## Backend Setup

### 1. Configure Environment Variables
Create a PostgreSQL database named `hospital_resource_db`. Copy `backend/.env.example` to `backend/.env` and update the values:

```dotenv
NODE_ENV=development
PORT=5001
HOST=0.0.0.0

DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=your_database_password
DB_NAME=hospital_resource_db

JWT_SECRET=your-minimum-32-character-random-secret-key-here
JWT_EXPIRE=7d

HOSPITAL_TIMEZONE=Asia/Kolkata

OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2:latest
OLLAMA_EMBEDDING_MODEL=nomic-embed-text:latest
RAG_ENABLED=true

# Optional: Google Gemini API fallback
GEMINI_API_KEY=
GEMINI_MODEL=gemini-1.5-flash

# Emergency SOS Escalation
EMERGENCY_HOSPITAL_RESPONSE_TIMEOUT_SECONDS=30
EMERGENCY_SEARCH_RADIUS_KM=30
SMS_WEBHOOK_URL=
```

### 2. Install Dependencies & Initialize Database
```powershell

```
*Note: Ingestion is incremental and computes SHA-256 document hashes to prevent duplicate embedding calls.*

### 4. Start the Backend Server
```powershell
# Development mode with auto-reload
npm run dev

# Production mode
npm start
```
The server will start at `http://localhost:5001` with WebSocket support at `ws://localhost:5001/socket.io/`.

---

## Database Migrations Reference

All SQL migrations are located in `backend/src/migrations/` and managed through `npm run migrate:run`:

| Migration File | Description |
| --- | --- |
| `001_add_roles_and_staff_log.sql` | Role-based access control (`RBAC`) and staff activity audit logs. |
| `002_add_rag_pgvector.sql` | `pgvector` extension setup, medical chunk tables, and vector schemas. |
| `003_add_hnsw_vector_index.sql` | HNSW cosine similarity index on vector embeddings for sub-millisecond search. |
| `004_add_hospital_entrance_coordinates.sql` | Verified emergency entrance coordinates for precise routing. |
| `005_emergency_and_ambulance.sql` | Emergency SOS requests, ambulance telemetry, and driver dispatch records. |
| `006_persistent_notifications.sql` | Persistent in-app user notifications and read state tracking. |
| `007_digital_queues.sql` | OPD hospital queues, digital tickets, counter management, and status workflows. |
| `008_queue_timing.sql` | Queue timing logs and smart ETA calculation metadata. |
| `009_hospital_daily_qr.sql` | Dynamic rotating daily QR codes for hospital contactless check-in. |
| `010_sos_dispatch_escalation.sql` | Multi-tier SOS auto-escalation dispatch ledger and audit trails. |
| `011_doctor_appointment_schedules.sql` | Doctor consultation schedules, slot capacities, and booking constraints. |
| `012_doctor_portal.sql` | Dedicated Doctor role accounts, activation statuses, and consultation notes. |
| `013_personal_health_and_family.sql` | Personal health profiles and consent-based family access. |
| `014_verified_hospital_entrances.sql` | Hospital entrance verification metadata. |
| `015_google_navigation_destinations.sql` | Verified Google Maps destination metadata. |
| `016_ambulance_driver_assignments.sql` | Authenticated driver/ambulance assignment links and driver GPS fields. |

---

## Background Workers & Maintenance Scripts

In a production environment, run the background worker processes alongside the main API server:

```powershell
# Continuous SOS escalation worker (evaluates unacknowledged alerts every 10s)
npm run worker:sos-dispatch

# Verify ledger consistency across blood stocks and requests
npm run verify:blood-inventory

# Migrate legacy doctor profiles to individual login accounts
npm run migrate:doctor-accounts

# Verify AI CareGuide routing and RAG pipelines
npm run test:careguide-rag
```

---

## Frontend Setup (Flutter)

### 1. Install Dependencies
```powershell
cd frontend
flutter pub get
```

### 2. Run on Desktop / Chrome
```powershell
flutter run -d chrome --web-port 3000 --dart-define=API_BASE_URL=http://localhost:5001/api --dart-define=SOCKET_URL=http://localhost:5001
```

### 3. Run on Android Emulator
The Android emulator accesses the host machine through `10.0.2.2`:
```powershell
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:5001/api --dart-define=SOCKET_URL=http://10.0.2.2:5001
```

### 4. Run on a Physical Android Device (via USB Debugging)
Forward host port 5001 to the device using ADB reverse proxy:
```powershell
& "$env:ANDROID_SDK_ROOT\platform-tools\adb.exe" reverse tcp:5001 tcp:5001
flutter run --dart-define=API_BASE_URL=http://127.0.0.1:5001/api --dart-define=SOCKET_URL=http://127.0.0.1:5001
```
*Alternatively, connect phone and PC to the same Wi-Fi and pass your PC's LAN IP (e.g. `--dart-define=API_BASE_URL=http://192.168.1.100:5001/api`).*

---

## User Roles & Capabilities

```
                  ┌─────────────────────────────────────────┐
                  │            User Roles in App            │
                  └────┬──────────┬───────────┬─────────┬───┘
                       │          │           │         │
                       ▼          ▼           ▼         ▼
                  [Patient]  [Hospital]   [Doctor]   [Admin]
```

### 1. Patient Portal
- **Discovery**: Locate nearby hospitals, real-time bed counts (General, ICU, Oxygen, Ventilator), and blood inventory.
- **Contactless Check-In**: Scan daily hospital QR codes to join digital OPD queues and track live turn ETAs.
- **Appointments**: Browse doctor specialties, book appointments, and receive status reminders.
- **Emergency SOS**: Single-tap emergency request with live GPS sharing and automated hospital escalation.
- **CareGuide AI**: Interactive health queries with verified medical RAG advice, age-specific recommendations, and exercise/yoga regimens.

### 2. Hospital Staff Portal
- **Resource Management**: Live updates for bed availability, critical care capacity, and equipment.
- **Blood Bank & Campaigns**: Stock tracking, expiry alerts, donor registrations, and blood issuance logging.
- **Digital Queue Management**: Call next patient token, manage counters, and mark consultations complete.
- **Emergency Response**: Incoming SOS alerts, ambulance dispatch, and telemetry tracking.

### 3. Doctor Portal
- **Clinical Dashboard**: Overview of scheduled appointments and patient waiting queue for the day.
- **Status & Availability**: One-click availability toggle (`Available` / `Busy`).
- **Consultation Lifecycle**: Transition patients from `scheduled` → `in_consultation` → `completed` and upload clinical advice/reports.

### 4. System Administrator Portal
- **Hospital Verification**: Review credentials and approve or reject hospital onboarding requests.
- **Platform Analytics**: System-wide utilization metrics, audit logs, and account lifecycle management.

---

## API Endpoints Reference

### Authentication & Profiles (`/api/auth`)
- `POST /api/auth/register` — Register a new patient or hospital user account.
- `POST /api/auth/login` — Authenticate credentials and retrieve JWT token with role information.
- `GET /api/auth/me` — Retrieve the authenticated profile and linked metadata.
- `POST /api/auth/forgot-password` — Request a password reset link or token.
- `POST /api/auth/reset-password` — Set a new password using a verified reset token.

### Hospitals & Directory (`/api/hospitals`)
- `GET /api/hospitals` — List all registered and verified hospitals.
- `GET /api/hospitals/nearby?lat={lat}&lng={lng}` — Retrieve nearby hospitals sorted by distance.
- `GET /api/hospitals/:id` — Get full hospital profile, verified entrance coordinates, and departments.
- `GET /api/hospitals/:id/reviews` — Get patient reviews and ratings.
- `POST /api/hospitals/:id/reviews` — Submit a hospital review and rating.

### Doctors & Scheduling (`/api/doctors`)
- `GET /api/doctors` — Search doctors by hospital, department, or specialty.
- `GET /api/doctors/specialties` — List all active medical specialties.
- `GET /api/doctors/:id/availability` — Check available appointment slots for a specific date.

### Doctor Portal (`/api/doctor` - Requires `doctor` role)
- `GET /api/doctor/profile` — Fetch doctor profile and current availability state.
- `PUT /api/doctor/availability` — Update real-time availability status (`is_available: true/false`).
- `GET /api/doctor/appointments` — Fetch assigned patient appointments.
- `PUT /api/doctor/appointments/:id/status` — Update appointment status (`in_consultation`, `completed`, `cancelled`).
- `POST /api/doctor/appointments/:id/consultation/start` — Mark consultation started and alert patient.
- `PUT /api/doctor/appointments/:id/report` — Save clinical consultation report and recommendations.

### Digital Queues & Daily QR (`/api/queues`)
- `GET /api/queues/hospital/:id/today` — Retrieve today's active queues and ticket states for a hospital.
- `GET /api/queues/daily-qr/:hospitalId` — Fetch today's dynamic rotating QR token (Hospital authorized).
- `POST /api/queues/scan-qr` — Scan daily QR code and generate an OPD queue ticket.
- `POST /api/queues/tickets/:id/call` — Hospital calls the next queue ticket to a counter.
- `POST /api/queues/tickets/:id/complete` — Mark ticket consultation as completed.
- `GET /api/queues/tickets/my-active` — Get patient's active queue tickets and estimated wait time.

### Emergency SOS & Ambulance (`/api/emergency`, `/api/ambulance`)
- `POST /api/emergency/sos` — Create a high-priority emergency SOS request with GPS coordinates.
- `GET /api/emergency/my-requests` — Get patient's active and historical SOS requests.
- `GET /api/emergency/hospital-alerts` — Hospital receives incoming emergency alerts.
- `PUT /api/emergency/:id/respond` — Hospital accepts or reassigns an emergency alert.
- `POST /api/ambulance/book` — Book an emergency or non-emergency ambulance.
- `GET /api/ambulance/live-tracking/:ambulanceId` — Fetch live ambulance coordinates.

### Blood Bank & Campaigns (`/api/blood-bank`, `/api/campaigns`)
- `GET /api/blood-bank/all` — Public directory of available blood stock across hospitals.
- `GET /api/blood-bank/:hospitalId` — Detailed blood inventory for a specific hospital.
- `POST /api/blood-bank/request` — Request blood units for a patient.
- `GET /api/blood-bank/stock/expiry` — Hospital view for expiring blood batches.
- `GET /api/campaigns` — List active blood donation campaigns.
- `POST /api/campaigns/:id/register` — Register as a donor for a blood drive.

### CareGuide AI Assistant (`/api/chatbot`, `/api/careguide`)
- `POST /api/chatbot/query` (or `/api/careguide/query`) — Submit a user message to CareGuide for intent analysis, database lookups, or medical RAG.

### In-App Notifications (`/api/notifications`)
- `GET /api/notifications` — Fetch user's persistent notifications (supports pagination).
- `GET /api/notifications/unread-count` — Get current unread notification count for badge display.
- `PATCH /api/notifications/:id/read` — Mark an individual notification as read.
- `PATCH /api/notifications/read-all` — Mark all user notifications as read.

### System Health (`/api/health`)
- `GET /api/health` — Check database connection, Ollama availability, model status, and API uptime.

---

## CareGuide Routing & Intent Contract

CareGuide performs deterministic intent classification before selecting an action, ensuring that operational queries query PostgreSQL directly while medical questions utilize the RAG vector corpus:

| Intent | Data Source | Response Type | Resulting Action |
| --- | --- | --- | --- |
| `BLOOD_QUERY` | PostgreSQL `blood_bank` | `blood_results` | Displays available units and blood group; triggers **Request Blood**. |
| `BED_QUERY` | PostgreSQL `hospital_resources` | `bed_results` | Displays General, ICU, Oxygen, Ventilator beds; triggers **Request Bed**. |
| `HOSPITAL_QUERY` | PostgreSQL `hospitals` | `hospital_results` | Renders hospital cards sorted by proximity or specialization. |
| `DOCTOR_QUERY` | PostgreSQL `doctors` | `doctor_results` | Displays doctor specialty cards and booking actions. |
| `MEDICAL_QUERY` | PostgreSQL `pgvector` + Ollama | `medical` | Returns verified clinical guidance from medical datasets. |
| `APPOINTMENT_QUERY` | Appointment Engine | `appointment_action` | Navigates patient to doctor booking and schedule manager. |
| `EMERGENCY_QUERY` | Emergency Engine | `emergency` | Offers immediate SOS trigger and emergency contacts. |
| `GENERAL_QUERY` | Rule Engine | `general` | General platform guidance and greeting assistance. |

---

## Testing & Verification

### Backend Tests
```powershell
cd backend

# Run entire test suite (Unit, Routing, RAG, Inventory, QR)
npm test

# Run RAG vector search tests
npm run test:rag

# Run Blood Bank concurrency and consistency tests
npm run test:blood-inventory
npm run verify:blood-inventory
```

### Frontend Tests
```powershell
cd frontend

# Run Flutter widget tests
flutter test

# Perform static code analysis
flutter analyze
```

---

## Security & Production Guidelines

1. **Environment Protection**: Never commit `backend/.env` or sensitive keys. Use strong 32+ character strings for `JWT_SECRET`.
2. **Database Security**: Enforce non-default passwords in production and configure connection pooling via `DB_POOL_MAX`.
3. **HTTPS & Reverse Proxy**: In production, place Node.js behind an HTTPS reverse proxy (e.g., NGINX, Cloudflare). Flutter release builds enforce HTTPS API endpoints.
4. **Android Release**: Configure `android/keystore.properties` for production APK or AppBundle code-signing.
5. **Medical Disclaimer**: CareGuide RAG responses provide informational guidance and do not replace professional medical diagnosis or emergency interventions.

---

## Ambulance Driver Authorization and Location Sharing

### Account workflows

- **Hospital drivers:** A hospital owner or staff member with `manage_drivers` permission opens Ambulance Management → Manage Drivers, enters the driver's contact and license information, and assigns an ambulance belonging to that hospital. The backend creates one `hospital_driver` account in `invited` state and makes that ambulance unavailable until activation. The driver sets their own password through the one-time email invitation (valid for seven days). Staff can resend an invitation, suspend, reactivate, deactivate, or reassign the driver. Public `/api/auth/register` does not create driver accounts; the legacy generic staff route rejects the `ambulance_driver` role.
- **Private operators:** The sign-in page links to Private Ambulance Registration. `POST /api/auth/drivers/private-registration` creates one `private_driver` account and a private ambulance in `pending_verification`; neither can sign in or receive trips until an administrator approves the application. Administrators review the application in the Drivers section or through `GET /api/admin/drivers/private-applications`, then `PUT /api/admin/drivers/private-applications/:driverId/review` with `action: approve|reject|suspend|deactivate`. Approval activates the account and ambulance together. Private vehicles can then receive patient ambulance bookings and use the same driver portal.
- Driver classification uses `users.driver_type` (`hospital_driver` or `private_driver`) and `users.driver_status`; the portal still uses the existing `role='ambulance_driver'`. The assigned vehicle is recorded by `ambulances.driver_user_id`; private ownership uses `private_operator_user_id`. Passwords are bcrypt hashes and invitation tokens are stored only as SHA-256 hashes.

Run the additive driver/tracking schema migration with `cd backend; npm run migrate:run`. It is `017_driver_authorization_and_patient_tracking.sql`. The migration adds driver review fields, invitation expiry, private vehicle links, and current patient-location columns. It does not create a location-history table: updates overwrite the current fix. Completing or cancelling an assignment clears its precise pickup and live coordinates and disables sharing.

### Patient location and Socket.IO contract

- Ambulance bookings accept a pickup address and optional GPS coordinates. The booking screen asks whether to share ongoing location; when enabled, it sends current fixes to `POST /api/ambulance/booking/location-update` while the booking screen remains open. SOS updates use the authenticated `POST /api/emergency/location-update` endpoint. Both APIs verify patient ownership, active assignment/sharing state, coordinate ranges, accuracy, fix age, and a three-second minimum update interval before persisting and emitting.
- If GPS is unavailable for a booking, a patient can select Custom address and type a pickup. An unavailable GPS fix is never replaced with guessed coordinates. The SOS flow keeps its existing permission and availability messaging.
- A signed-in participant subscribes with `assignment:subscribe` and `{ "type": "emergency"|"booking", "id": number }`. The server derives the room from a live database assignment and checks the patient, assigned active driver, or hospital. It emits `assignment:subscribed` on success and `socket-error` on rejection. Room names are `emergency_assignment_<id>` and `booking_assignment_<id>`.
- The server emits `patient:location_updated` with `{ emergencyId?, bookingId?, latitude, longitude, accuracy, timestamp }` only to the assignment room, assigned driver's authenticated `driver_<userId>` room, the patient's room, and the assigned hospital room. `ambulance:location_updated` carries the same assignment identifiers plus ambulance coordinates. Socket handshakes use the current JWT; driver sockets are disconnected when access is suspended or revoked and are disconnected at token expiry. Location payloads are not written to request logs.
- The Active Trip screen embeds an interactive `flutter_map` map, and retains external Google Maps navigation for turn-by-turn directions. It marks the patient pickup, ambulance when an authorized driver fix exists, and verified hospital destination separately. It shows location age, accuracy, unavailable/stale states, zoom, pan, and recenter controls. It never substitutes the driver's device position for patient coordinates.

### Embedded map setup and privacy

- `flutter_map` 6.2.1 and `latlong2` 0.9.1 are BSD-3-Clause packages with Android, iOS, web, Windows, macOS, and Linux targets. The map uses HTTPS raster tiles, with visible OpenStreetMap contributor attribution by default. No Google Maps SDK API key or platform manifest key is required. Android already requests `INTERNET`; web requires map tile requests to be permitted and to send a valid Referer.
- The default `tile.openstreetmap.org` source is intended for development/evaluation. Tile requests disclose the displayed viewport to the tile operator. The OpenStreetMap tile service is best-effort and its policy requires visible attribution, an identifying User-Agent, valid web Referer, and local tile caching; it prohibits bulk prefetch and offline downloads. For production, select a provider or self-hosted tile server whose privacy, cache, availability, and use terms fit the deployment. Pass its HTTPS `{z}/{x}/{y}` URL template using `--dart-define=MAP_TILE_URL=https://tiles.example.com/{z}/{x}/{y}.png`.
- Route polylines are off by default so exact patient/ambulance coordinates are not sent to a public router. Configure a private OSRM-compatible endpoint using `--dart-define=MAP_ROUTING_BASE_URL=https://routing.example.com`; route endpoints will be sent to that service. If unavailable or unset, the map shows markers and keeps the external navigation action. The driver explicitly chooses when to share the destination with Google Maps.
- Map tile failures show an in-map connection warning while preserving available location markers. If no real coordinates exist, the widget displays an unavailable state and the provided pickup address; it does not invent a marker. An address remains usable for external navigation.

### Limitations before production verification

- The project has no email/SMS OTP or secure file-upload provider. Private email/phone contact and submitted HTTPS document links must be reviewed by an administrator; links are metadata, not uploaded or protected documents. Configure `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USER`, `EMAIL_PASS`, and `FRONTEND_URL` to deliver hospital invitations. If invitation delivery fails, staff can resend it from Manage Drivers.
- Ongoing booking location capture runs while the booking screen is open; server authorization still requires a current active booking and driver. Background location tracking is not configured. A production mobile release should add explicit background-location platform disclosure and service configuration if tracking while the app is backgrounded is required.
- Run backend tests with `cd backend; npm test` and Flutter checks with `cd frontend; flutter analyze` and `flutter test`. Live PostgreSQL migration, actual email delivery, real patient/driver sessions, device GPS updates, and external map navigation must be exercised in the deployment environment before claiming end-to-end live tracking.
