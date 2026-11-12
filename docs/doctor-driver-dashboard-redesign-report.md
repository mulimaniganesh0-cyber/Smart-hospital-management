# Doctor and Ambulance Driver Dashboard Redesign

## Changes

### Doctor dashboard

- Reworked the Doctor screen into a responsive workspace with a compact portal header, personalized greeting, current date, doctor and hospital identity, profile initials, refresh, password, logout, and the existing shared notification center.
- Added six responsive metrics: today's appointments, pending, confirmed, in consultation, completed, and cancelled or rejected.
- Replaced the oversized availability blocks with a compact booking status control and structured day/time/slot cards. The toggle still calls the existing availability API.
- Added Today, Upcoming, Pending, In progress, and Completed appointment filters.
- Rebuilt appointment cards with patient initials, appointment ID, readable date/time, status, symptoms when present, and only the existing status-appropriate workflow actions.
- Kept patient medical details behind the existing appointment-specific consultation context call.

### Ambulance driver dashboard

- Reworked the overview header with a personalized greeting, assigned hospital, date, and profile initials.
- Added responsive metric cards for new assignments, pending/active assignments, active trip, completed today, and trip history totals. Values come from the existing authenticated profile and assignment/history responses.
- Added a concise ambulance and dispatch availability summary with a link to the existing ambulance details section.
- Preserved the driver's current navigation destinations, account authorization, emergency assignment cards, active-trip map and location freshness display, valid trip state transitions, location sharing, hospital/pickup navigation, notifications, history, and profile flows.

## Files changed for this task

- `frontend/lib/screens/doctor/doctor_dashboard_screen.dart`
- `frontend/lib/screens/driver/ambulance_driver_dashboard.dart`
- `frontend/test/dashboard_runtime_layout_test.dart`
- `frontend/test/driver_portal_test.dart`
- `frontend/lib/screens/forgot_password_screen.dart` (formatted by the requested `dart format lib` run)
- `frontend/lib/screens/hospital/hospital_resource_requests.dart` (formatted by the requested `dart format lib` run)
- `frontend/lib/screens/patient/patient_emergency_request.dart` (formatted by the requested `dart format lib` run)

No new shared widgets were needed; both screens use the existing app theme, `app_ui.dart` components, and notification center.

## Verification

- `dart format lib`: completed; three previously unformatted library files were also normalized as listed above.
- `flutter analyze --no-pub`: passed with no issues.
- `flutter test --no-pub`: passed (24 tests).
- Responsive widget layout: Doctor, Driver, and Admin dashboards passed at 360×800, 390×844, 430×932, 768×1024, 1024×768, 1366×768, 1440×900, and 1920×1080. The test caught and led to a fix for a 360px Doctor AppBar overflow.
- Driver portal interaction test: existing section navigation and empty states passed; active trip map tests verified real-coordinate markers, missing-location fallback, stale-location indicator, and live location updates.
- Release web build: `flutter build web --release --no-wasm-dry-run` passed and produced `frontend/build/web`. The default release build spent several minutes in Flutter's optional WASM dry-run compile, so the successful JS release build used the documented switch to skip that dry run.
- `git diff --check`: passed for the files changed in this task.

## Visual review and limitations

Screenshots were not captured. The attached material supplied a text brief but no standalone dashboard screenshot, and the local in-app browser preview could not be opened because the computer-use runtime failed with `failed to write kernel assets: The system cannot find the path specified (os error 3)`. The responsive widget tests used the existing mocked empty appointment and assignment responses; they did not exercise screenshot states with appointment records, a live consultation, new emergency assignments, or an active trip. Those populated states and live backend actions still need a visual review in a working browser session.
