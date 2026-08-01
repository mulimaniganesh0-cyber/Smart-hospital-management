# Smart Hospital Resource Management System

A full-stack platform for real-time hospital resource availability, emergency coordination, blood bank stock management, appointment booking, ambulance dispatch workflows, and patient support through the CareGuide assistant.

---

## 📂 Project Structure

| Directory | Description |
| --- | --- |
| [frontend/](file:///d:/projects/Smart-hospital-management-main/frontend) | Flutter client supporting Patients, Hospitals, and Admins. Built for Mobile, Desktop, and Web. |
| [backend/](file:///d:/projects/Smart-hospital-management-main/backend) | Express.js, PostgreSQL, and Socket.IO backend. |

---

## 🚦 Prerequisites

* **Flutter SDK**: Dart `>=3.0.0 <4.0.0`
* **Node.js**: Version 18+ and `npm`
* **PostgreSQL**: Version 14+

---

## ⚙️ Backend Setup & Migrations

1. **Create the Database**:
   Create a PostgreSQL database named `hospital_resource_db`.

2. **Configure Environment Variables**:
   In the [backend/](file:///d:/projects/Smart-hospital-management-main/backend) folder, copy `.env.example` to `.env` and fill in your PostgreSQL credentials, a high-entropy `JWT_SECRET`, and `ALLOWED_ORIGINS`.

3. **Install Dependencies & Provision DB**:
   Run the following commands:
   ```powershell
   cd backend
   npm install
   
   # Initialize tables and create administrator accounts
   # Note: ADMIN_EMAILS and ADMIN_PASSWORD must be configured in your .env
   npm run init-db
   ```

4. **Apply Migrations**:
   Run the migrations sequentially to enable resource requests, campaigns, and blood bank expiry tracking:
   ```powershell
   node migrate.js
   node migrate-campaigns.js
   node migrate-blood-expiry.js
   node migrate-blood-constraint.js
   ```

5. **Start the API Server**:
   ```powershell
   npm run dev
   ```
   The API health check endpoint will be available at `http://localhost:5000/api/health`.

---

## 📱 Flutter Client Setup

1. **Get Packages**:
   ```powershell
   cd frontend
   flutter pub get
   ```

2. **Run the Application**:
   Point the client to your local or hosted backend server environment using Dart defines:
   ```powershell
   # For local web/desktop targets
   flutter run --dart-define=API_BASE_URL=http://localhost:5000/api --dart-define=SOCKET_URL=http://localhost:5000
   
   # For Android emulator (connecting to host machine)
   flutter run --dart-define=API_BASE_URL=http://10.0.2.2:5000/api --dart-define=SOCKET_URL=http://10.0.2.2:5000
   ```

---

## ✨ Core Features & Workflows

* **Scrollytelling Web Entrance**: A landing page featuring scroll-driven animations, interactive metrics, and simulations detailing the system features.
* **Interactive Live Ward Simulator**: Simulated inputs letting patients test bed, ICU, and ventilator capacity dynamics.
* **Real-time Map Telemetry**: Dynamic map paths showcasing ambulance routing and live dispatch feeds.
* **CareGuide AI assistant**: Dynamic prompt options assisting users in searching for hospitals and resources.
* **Blood Bank Batch Tracker**: Automated batch expiry warning banners and campaign coordination triggers.
* **Admin Verification Portals**: Secure admin verification dashboards for verifying newly registered hospitals and blood donation campaigns.

---

## 🧪 Testing & Verification

* **Backend checks**:
  ```powershell
  cd backend
  node --check server.js
  ```
* **Frontend checks**:
  ```powershell
  cd frontend
  flutter analyze
  flutter test
  ```
