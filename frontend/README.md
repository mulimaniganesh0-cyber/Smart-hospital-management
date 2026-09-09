# Flutter Client

This directory contains the Flutter application for the Smart Hospital Resource Management System.

## Run locally

```powershell
flutter pub get
flutter run
```

Configure the API and real-time server for the target environment with Dart
defines. `10.0.2.2` is only for the Android emulator:

```powershell
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:5000/api --dart-define=SOCKET_URL=http://10.0.2.2:5000
```

Use `10.0.2.2` for an Android emulator. For a physical device, use the reachable IP address or domain of the backend server.

### Physical Android device during development

Do not use `10.0.2.2` on a physical phone. The most reliable USB-debugging
option is an ADB reverse mapping, then run Flutter with a loopback define:

```powershell
& "$env:ANDROID_SDK_ROOT\platform-tools\adb.exe" reverse tcp:5001 tcp:5001
flutter run --dart-define=API_BASE_URL=http://127.0.0.1:5001/api --dart-define=SOCKET_URL=http://127.0.0.1:5001
```

The mapping exists only while the phone is connected through ADB. If phone and
PC are on the same Wi-Fi network, use the PC's current LAN IPv4 instead:

```powershell
flutter run --dart-define=API_BASE_URL=http://YOUR_PC_LAN_IP:5001/api --dart-define=SOCKET_URL=http://YOUR_PC_LAN_IP:5001
```

If an emulator login cannot reach `10.0.2.2:5001`, start the backend with
`npm run dev` and verify `http://localhost:5001/api/health` on Windows. The
server binds to `0.0.0.0` by default. The Android client returns a clear error
after 12 seconds rather than waiting indefinitely; a Windows Firewall inbound
rule for TCP 5001 may be needed only for a physical phone on your LAN, not for
the emulator.

## Android release configuration

Every release build requires HTTPS endpoints; the app intentionally falls back
to an invalid host when `API_BASE_URL` is omitted in release mode. Build with
your deployed API and Socket.IO domain:

```powershell
flutter build apk --release --dart-define=API_BASE_URL=https://api.example.com/api --dart-define=SOCKET_URL=https://api.example.com
flutter build appbundle --release --dart-define=API_BASE_URL=https://api.example.com/api --dart-define=SOCKET_URL=https://api.example.com
```

The Android debug manifest alone permits cleartext traffic for emulator/LAN
development. It is not enabled in profile or release builds. Before publishing,
create `android/keystore.properties` (it is intentionally not committed):

```properties
storePassword=your-store-password
keyPassword=your-key-password
keyAlias=your-key-alias
storeFile=C:\\absolute\\path\\to\\upload-keystore.jks
```

The Gradle configuration automatically uses that upload key when the file is
present; otherwise it uses the debug key solely for local build verification.
Choose an Android application ID you own before creating the Play Console app.

This client currently provides persistent in-app and Socket.IO notifications.
Firebase Cloud Messaging is not configured in this repository; foreground,
background, and terminated push delivery requires Firebase credentials and a
server-side FCM sender before it can be claimed as supported.

## Test

```powershell
flutter test
flutter analyze
```

See the project-level [README](../README.md) and [requirements](../REQUIREMENTS.md) for backend setup, configuration, features, and security guidance.
