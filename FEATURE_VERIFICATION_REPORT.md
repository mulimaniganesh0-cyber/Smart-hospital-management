# Feature Verification Report

**Status:** Discovery inventory, not feature acceptance. UI/API presence does not establish working workflows.

| Feature group | Implementation evidence | Verification state |
|---|---|---|
| Authentication and roles | JWT middleware, auth routes, role providers and portal tests | Unit-tested in part; live DB matrix skipped |
| Patients, family, medical records | Patient/family/medical routes and Flutter screens | Ownership and consent E2E pending |
| Hospitals, staff, resources, gallery | Controllers/routes, resource validation and gallery tests | Unit coverage present; live DB isolation skipped |
| Doctors and appointments | Doctor portal, schedule service, appointment routes | Unit scheduling checks; concurrency and live workflow pending |
| SOS and ambulance | Emergency/driver routes, dispatch worker, socket handlers | Lifecycle/live GPS and restart testing pending |
| Blood bank | Inventory service and controller tests | Unit checks run; PostgreSQL reconciliation pending |
| Queues and daily QR | Queue/QR services and migration set | Live multi-client and hospital validation pending |
| CareGuide / RAG | Ollama, retrieval, datasets, provider adapters | Mock/local logic tests; live Ollama/grounding and provider policy pending |
| Deployment | Compose/config and Flutter release URL defines | No remote device or ngrok test performed |

Use backend and Flutter reports for actual execution evidence. No percentage-complete estimate is supportable from this discovery pass.
