# Location Root Cause Report

**Date:** 2026-11-06. Static source review; no physical-device or browser location trace was available.

## Confirmed code-level cause

The shared `LocationService` attempted a current position, then silently substituted `Geolocator.getLastKnownPosition()` or a session-cached position without checking timestamp or accuracy. That service is used across patient nearby-hospital searches, dashboard stats, CareGuide, hospital location picking, and driver location sharing. A stale fix can therefore persist across screens and look like a current location. The emergency SOS screen had a separate fallback to `getLastKnownPosition()` and labeled it live.

No Bengaluru or Belagavi coordinate fallback and no IP geolocation implementation were found in the searched active Flutter/backend source. Backend emergency updates accept authenticated client coordinates and validate numeric ranges/timestamp; no server-IP-to-patient-location substitution was found in the inspected path. This identifies a plausible code root cause for stale-city results, but cannot prove which stage produced the user's reported Bengaluru coordinate without a device/browser trace.

## Other contributing factors

- Flutter Web browser geolocation may use OS/network positioning and may be approximate; laptop Web location is not equivalent to phone GPS.
- Ambulance booking had a separate direct Geolocator path, so its validation differed from the common service.
- SOS payload previously stamped `DateTime.now()` rather than the GPS fix timestamp, obscuring the true age of a reused position.

## Verification limits

No actual Android handset, known-location browser session, ngrok HTTPS endpoint, or production database was available. Therefore physical GPS correctness and end-to-end coordinate parity are not certified.
