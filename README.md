# Smart Hospital Management System

A Flutter, Node.js, and PostgreSQL application for hospital discovery, resource requests, blood-bank management, donation campaigns, appointments, SOS support, and the CareGuide assistant.

CareGuide uses live PostgreSQL data for hospitals, beds, doctors, blood inventory, and requests. Medical education is handled separately through retrieval-augmented generation (RAG) over the local medical dataset.

## Architecture

| Area | Technology | Purpose |
| --- | --- | --- |
| Client | Flutter/Dart | Patient, hospital, and admin web/mobile interfaces. |
| API | Node.js, Express, Socket.IO | Authenticated workflows, CareGuide, and real-time updates. |
| Operational data | PostgreSQL | Hospitals, resources, blood stock, requests, campaigns, registrations, SOS. |
| Medical retrieval | PostgreSQL + pgvector | Stores medical-document chunks and vector embeddings. |
| Local models | Ollama | `nomic-embed-text:latest` for embeddings; `llama3.2:latest` for answers. |

## Layout

| Directory | Description |
| --- | --- |
| [frontend](frontend/) | Flutter client. |
| [backend](backend/) | Express API, schema, migrations, CareGuide, and ingestion scripts. |
| [backend/data/medical](backend/data/medical/) | Medical and medication dataset used by RAG. |

## Prerequisites

- Flutter SDK with Dart `>=3.0.0 <4.0.0`
- Node.js 18+ and npm
- PostgreSQL 14+ with the `vector` extension for RAG
- [Ollama](https://ollama.com/)

```powershell
ollama pull nomic-embed-text:latest
ollama pull llama3.2:latest
```

## Backend setup

Create a PostgreSQL database named `hospital_resource_db`. Copy `backend/.env.example` to `backend/.env`, then set secure database credentials and `JWT_SECRET`.

```powershell
cd D:\Smart-hospital-management\backend
npm install
npm run init-db

# Apply SQL migrations in backend/src/migrations
npm run migrate:run

# For an existing database that only needs RAG tables
npm run migrate:rag

npm run dev
```

The example environment starts the API at `http://localhost:5001`. CareGuide is the authenticated endpoint `POST /api/chatbot/query`.

## Medical RAG ingestion (“training”)

The application does **not** fine-tune `llama3.2`. In this project, “RAG training” means indexing the provided medical dataset:

```text
Medical JSON/JSONL files
  -> document normalization and chunking
  -> 768-dimensional embeddings via nomic-embed-text:latest
  -> PostgreSQL/pgvector upsert
  -> retrieve relevant chunks for a medical query
  -> provide retrieved context to llama3.2:latest
```

After applying the RAG schema migration, ingest the dataset:

```powershell
cd D:\Smart-hospital-management\backend
npm run ingest-medical
```

Ingestion is incremental: unchanged document hashes are preserved and only new/changed records are embedded. The embedding dimension is fixed at `768` for `nomic-embed-text:latest`; changing embedding models requires rebuilding the vector corpus.

Relevant `.env` settings:

```dotenv
RAG_ENABLED=true
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2:latest
OLLAMA_EMBEDDING_MODEL=nomic-embed-text:latest
RAG_TOP_K=5
RAG_SIMILARITY_THRESHOLD=0.35
```

## Flutter setup

```powershell
cd D:\Smart-hospital-management\frontend
flutter pub get
flutter run -d chrome --web-port 3000 --dart-define=API_BASE_URL=http://localhost:5001/api --dart-define=SOCKET_URL=http://localhost:5001
```

Use `10.0.2.2` instead of `localhost` for an Android emulator. A physical device requires the reachable LAN/API host address.

## CareGuide routing contract

The backend detects intent before choosing a service. Flutter renders cards from the structured `type` field, never by guessing from response text.

| Intent | Source | Response type | Result |
| --- | --- | --- | --- |
| `BLOOD_QUERY` | PostgreSQL `blood_bank` | `blood_results` | Requested group and available units; **Request Blood**. |
| `BED_QUERY` | PostgreSQL hospital resources | `bed_results` | General, ICU, Oxygen, Ventilator availability; **Request Bed**. |
| `HOSPITAL_QUERY` | PostgreSQL hospitals | `hospital_results` | Hospital recommendations. |
| `DOCTOR_QUERY` | PostgreSQL doctors | `doctor_results` | Doctor cards and booking actions. |
| `MEDICAL_QUERY` | pgvector + Ollama | `medical` | Dataset-backed medical answer. |
| `APPOINTMENT_QUERY` | Appointment workflow | Workflow response | Appointment guidance/actions. |
| `EMERGENCY_QUERY` | SOS/emergency workflow | `emergency` | Emergency actions and SOS support. |
| `GENERAL_QUERY` | Local rules | `general` | General assistance. |

### Blood and bed behavior

- Blood aliases such as `O+ve`, `O positive`, `A+`, and `AB negative` normalize to canonical groups.
- A grouped blood request queries only that group with positive availability and never uses RAG or a bed card.
- A blood request without a group asks the patient for one before searching inventory.
- General bed queries show General, ICU, Oxygen, and Ventilator values. Specific ICU/oxygen/ventilator queries focus on that resource.
- Resource-card actions retain the real hospital ID. **Request Blood** and **Request Bed** open the existing Resource Request page with the hospital and resource preselected.

### Medical RAG and follow-ups

Medical questions do not require location. CareGuide persists `conversationId`, `lastIntent`, age, follow-up answers, and `medicalConversation` state, so follow-up messages remain in the same medical/RAG flow unless the user clearly changes topic. Age-required flows return `age_required` and continue after age selection.

## Location, directions, and safety

- Location improves ordering but does not block blood, bed, hospital, or medical responses when it is unavailable.
- The Flutter location service uses valid approximate browser positions and a recent cached position when indoor updates fail.
- Directions prefer verified `entrance_latitude` / `entrance_longitude`, falling back to hospital coordinates only when no entrance is recorded.
- SOS retrieves the authenticated patient’s saved emergency contact and creates an emergency request.

## Operational workflows

- **Blood bank:** PostgreSQL is the single source of truth per hospital and blood group.
- **Donation campaigns:** registration and completed donation are separate; inventory increases only after a successful completed-donation record.
- **Resource requests:** server-side validation protects hospital, resource, blood group, and quantity data.

## Verification

```powershell
cd D:\Smart-hospital-management\backend
node --check src/services/medicalIntentService.js
node --check src/services/careGuideService.js
npm test
node --test test/careGuideRouting.test.js
npm run test:rag

cd ..\frontend
flutter analyze
flutter test
```

The routing tests cover blood aliases, blood requests without a group, generic and specific bed queries, medical/RAG questions, and medical-follow-up context. End-to-end testing requires the running API, PostgreSQL/pgvector, Ollama, Flutter client, authentication, and real seeded hospital/blood data.

## Security notes

- Never commit `backend/.env`, credentials, JWT secrets, or access tokens.
- Do not hard-code hospital, blood, bed, donor, rating, or coordinate data in Flutter.
- RAG output is medical information, not a diagnosis or prescription; urgent symptoms should be directed to emergency care.
