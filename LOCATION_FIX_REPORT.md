# Location Fix Report

Implemented on 2026-11-06:

- Removed last-known and in-memory location fallbacks from the shared location service.
- Require finite coordinates, valid ranges, finite accuracy at or below 1,000 m, and a fix timestamp no more than 30 seconds old (allowing up to 5 seconds of clock skew).
- Request a high-accuracy fresh position and return an actionable failure when unavailable.
- Use the shared validated service for SOS acquisition and ambulance booking.
- Reacquire location when refreshing nearby-hospital results.
- Validate patient emergency and ambulance booking location stream fixes before sending.
- Pass the GPS fix timestamp with initial SOS and subsequent live location updates.
- Kept Android fine/coarse permissions; no background permission was added because background tracking was not established as required by the current foreground workflow.

No database rows or existing patient/emergency data were changed. Backend authorization and database persistence code were not changed.

## Files changed by this fix

- `frontend/lib/services/location_service.dart`
- `frontend/lib/screens/patient/patient_emergency_request.dart`
- `frontend/lib/screens/patient/ambulance_booking.dart`
- `frontend/lib/screens/patient/patient_nearby_hospitals.dart`
- `frontend/lib/services/api_service.dart`

## Limitations

The 1,000 m accuracy ceiling is a coarse safety bound, not a guarantee of turn-by-turn precision. Web geolocation quality depends on the browser and operating system. No temporary diagnostics screen or patient-coordinate logging was added because location is sensitive; existing logs report service state and accuracy without printing coordinates.

Flutter analysis and the existing Flutter test suite now pass, but there are no direct automated tests for location permission/freshness behavior. PostgreSQL ordering behavior and physical Android/Web location checks remain unverified; see `LOCATION_TEST_RESULTS.md`.
