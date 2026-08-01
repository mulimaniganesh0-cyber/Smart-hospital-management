# Flutter Client

This directory contains the Flutter application for the Smart Hospital Resource Management System.

## Run locally

```powershell
flutter pub get
flutter run
```

Configure the API and real-time server for the target environment with Dart defines:

```powershell
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:5000/api --dart-define=SOCKET_URL=http://10.0.2.2:5000
```

Use `10.0.2.2` for an Android emulator. For a physical device, use the reachable IP address or domain of the backend server.

## Test

```powershell
flutter test
flutter analyze
```

See the project-level [README](../README.md) and [requirements](../REQUIREMENTS.md) for backend setup, configuration, features, and security guidance.
