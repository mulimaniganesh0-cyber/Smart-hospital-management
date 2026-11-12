# Frontend redesign report

Date: 2026-11-02

## Frontend audit

The Flutter app has 40+ screens across Patient, Hospital, Doctor, Ambulance Driver, Admin, registration, and shared utility flows. Most screens already use Flutter Material components, but the app had multiple primary blues/teals, inconsistent hard-coded form/card styles, and different spacing and navigation behavior. The Hospital portal also exposed ten destinations in its narrow bottom bar. Patient and Hospital dashboards already consume live API data; the redesign keeps those calls, routes, role selection, and action handlers intact.

## Design system

Added shared tokens in `frontend/lib/theme/`:

- `app_colors.dart`: navy `#16324F`, teal `#159A9C`, off-white canvas, white surfaces, charcoal text, slate support text, semantic status colors, and border color.
- `app_spacing.dart`: 8-point spacing and shared radii.
- `app_theme.dart`: shared Poppins typography, Material 3 color scheme, card, button, field, dialog, chip, navigation, divider, and snackbar styles.

`main.dart` now uses this theme and identifies the app as CareSync. Existing UI helpers in `widgets/app_ui.dart` now use the palette and provide reusable page-width, section-header, status-badge, empty-state, action-tile, card, and statistic-card components. Repeated legacy brand colors were aligned with the navy/teal palette across the existing screens and widgets.

## Portal and screen changes

| Area | Changes |
| --- | --- |
| Login and registration | Centered responsive sign-in card, branded desktop introduction, clearer portal selection, shared fields/buttons, accessible password visibility label, and wrapping onboarding links. Authentication and per-role onboarding actions are preserved. |
| Patient | Dashboard is constrained to a readable desktop width; welcome panel, quick actions, and report entry use the shared palette. Existing emergency, hospital, report, Care Hub, and booking actions remain connected. |
| Hospital | Dashboard styling uses shared tokens. Mobile navigation now shows Dashboard, Resources, Appointments, Requests, and More; More opens Staff, Ambulances, Blood bank, Campaigns, Profile, and Gallery. Each item still selects its existing screen index. |
| Doctor | Dashboard uses shared status colors, cards, and a centered content width. Appointment, consultation, report, prescription, availability, and API handlers remain in place. |
| Ambulance Driver | Portal palette now uses the shared navy, teal, and semantic error tokens. Shared Material styles apply to trip cards and controls. Assignment, trip, GPS, and Socket.IO logic is unchanged. |
| Admin | Dashboard metric colors use the shared semantic palette; global card, typography, field, dialog, and navigation styles apply across admin screens. |
| Other patient, hospital, admin, and utility screens | Shared Material theme and common palette updates apply to existing resource, appointment, blood bank, gallery, campaign, profile, verification, chatbot, and registration screens. |

The work primarily centralizes appearance so existing operational screens keep their behavior and data sources. It does not add sample dashboard statistics or mock API results.

## Responsive and accessibility work

- The Hospital mobile bar no longer attempts to show ten labels at once; secondary workflows are reachable through a labeled sheet.
- Navigation labels appear only for the selected item to reduce crowding on small screens.
- Login role chips and onboarding links wrap within their available width. A regression test exercises 360, 390, 768, 1024, 1366, and 1920 pixel widths.
- Inputs, buttons, dialogs, and chips share consistent dimensions and focus styling. Password visibility controls have explicit tooltips, and existing action tiles retain semantic button labels.

## Files changed

- New: `frontend/lib/theme/app_colors.dart`, `frontend/lib/theme/app_spacing.dart`, `frontend/lib/theme/app_theme.dart`.
- Updated: `frontend/lib/main.dart`, `frontend/lib/widgets/app_ui.dart`, `frontend/lib/screens/login_screen.dart`, `frontend/lib/screens/landing_screen.dart`, patient and hospital dashboards, doctor and driver dashboards, and `frontend/test/auth_portal_selection_test.dart`.
- Updated palette literals in existing signup, password recovery, hospital resource/staff/appointment/ambulance/profile, patient report/request/discovery/profile, admin profile/verification, and shared chat/recommendation widgets.

No backend, migration, API contract, authentication, GPS, or Socket.IO code was changed for this visual pass.

## Testing and acceptance status

- **VERIFIED** — `flutter analyze --no-pub`: no issues found.
- **VERIFIED** — `flutter test --no-pub`: 16 tests passed, including login role selection and the new six-width layout check, driver portal, map markers, and hospital gallery.
- **VERIFIED** — `flutter build web --release`: completed. Flutter emitted its existing WebAssembly dry-run notices for `dart:html` in `share_plus` and `geolocator_web`; the JavaScript web build succeeded.
- **VERIFIED** — `git diff --check`: no whitespace errors. Git reported line-ending normalization notices for modified files.
- **NOT VERIFIED** — Screenshots at all requested widths were not captured. The available browser session was already in active use, so it was left untouched.
- **NOT VERIFIED** — Full authenticated portal workflows were not run in the browser. This pass did not use dedicated test accounts or a backend session for end-to-end patient, hospital, doctor, driver, or admin actions.
- **NOT VERIFIED** — Android runtime and physical-device GPS were not part of this redesign pass.

## Remaining work

The shared design system and responsive login/hospital navigation are implemented, and the Flutter project builds cleanly for web. Visual review of every screen at 360, 390, 768, 1024, 1366, and 1920 pixels remains outstanding, as does authenticated click-through regression of all five portals. No before/after screenshot artifacts are available in this pass.


## Corrective dashboard composition pass

Date: 2026-11-02

The earlier report above described a theme-focused pass and did not satisfy the requested dashboard composition changes. This follow-up restructures the five portal entry dashboards and records the limits of the visual acceptance run.

### Dashboard implementations changed

| Portal | Screen and composition changes |
| --- | --- |
| Patient | `frontend/lib/screens/patient/patient_home_screen.dart` now surfaces an API-backed latest appointment and nearby-care pair directly below the welcome context. The pair adapts from two panels on wider content to stacked cards on narrow screens. The existing report link, quick service grid, Care Hub, resource requests, SOS, and booking detail actions remain available. |
| Hospital | `frontend/lib/screens/hospital/hospital_home_screen.dart` now leads with an eight-metric operational grid (four columns on wide desktop, three on tablet, two on mobile), followed by operational shortcuts, pending-request summary, the compact daily QR booking panel, and emergency activity. The QR still uses the existing daily QR endpoint and refresh/download/print handlers. |
| Doctor | `frontend/lib/screens/doctor/doctor_dashboard_screen.dart` places the appointment queue in a responsive card grid with two columns on desktop and one on narrow screens. Existing appointment status, consultation, patient context, report, prescription, schedule, and availability handlers remain attached to each item. |
| Ambulance Driver | `frontend/lib/screens/driver/ambulance_driver_dashboard.dart` gives the overview a responsive assignment and operations composition: active assignment details take the wider desktop column and large trip-history/assignment actions occupy a separate panel; mobile stacks them. Existing assignment validation, trip state, GPS, map, and socket logic were not modified. |
| Admin | `frontend/lib/screens/admin/admin_home_screen.dart` adds a backend-fed approval pipeline indicator and emergency count beside management shortcuts for hospitals, approvals, and drivers. Desktop uses a two-panel analysis row; mobile stacks panels and uses a compact five-item bottom bar with the less-used destinations in More. |

### Shared responsive system

`frontend/lib/widgets/app_ui.dart` raises the shared dashboard content cap to 1,360 px on large displays and 1,200 px on laptop widths. Patient, Hospital, and Admin shells use expanded labeled navigation rails on large desktop and retain compact rails/tablet navigation. No API or backend data was replaced with fixture values in these dashboard changes.

### Verification

- **PASS** — `flutter analyze --no-pub`: no issues found after the final dashboard edits.
- **PASS** — `flutter test --no-pub`: all 16 tests passed after the final dashboard edits.
- **PASS** — `flutter build web --release`: successful after the final dashboard edits. Flutter reported existing WebAssembly dry-run incompatibilities for `dart:html` in `share_plus` and `geolocator_web`; the JavaScript web release built successfully.
- **PASS with repository notices** — `git diff --check` reported no whitespace errors; Git printed existing LF-to-CRLF normalization notices for the already-modified working tree.
- **NOT VERIFIED** — No portal screenshots were captured for this corrective pass. The Windows computer-use helper stopped because it could not confidently identify the active CareSync browser URL. Authenticated portal sessions and credentials were not available through a safe, verifiable screenshot path. Consequently, 1440 px, 768 px, and 390 px screenshot review for all five portals remains outstanding, and no visual acceptance claim is made.
- **NOT VERIFIED** — Authenticated end-to-end dashboard action checks and API data checks were not run against a live signed-in session. Existing API calls and callback logic were retained in the dashboard code; the standard Flutter suite is not a live backend acceptance run.

### Remaining acceptance work

Show and inspect the five signed-in dashboards at desktop, tablet, and mobile widths. Confirm section balance, clipping, and live data in an authenticated environment. The implementation and automated checks are complete, but the screenshot-based visual acceptance condition remains open.
