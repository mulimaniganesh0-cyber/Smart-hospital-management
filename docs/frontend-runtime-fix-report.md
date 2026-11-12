# Flutter Runtime Stability Report

Date: 2026-11-03

## Fixed and verified

| Issue | Root cause / change | Evidence |
|---|---|---|
| Landing-screen layout failure | The preserved `frontend/test-output.txt` starts with `BoxConstraints forces an infinite width` in the landing header `ElevatedButton`; later `RenderBox was not laid out` messages are cascading errors. The saved log does not show a standalone unbounded-height RenderFlex failure. Expanding startup checks reproduced a 102 px horizontal `RenderFlex` overflow in the header Row at 390×844. Kept the same Access Dashboard action and portal destination, but use a compact, accessible icon action below 600 px. | App startup regression test checks for Flutter exceptions at 390×844, 768×1024, 1024×768, 1366×768, and 1920×1080; it also checks the compact action is present on mobile. All passed. |
| Patient dashboard initialization | The PatientHomeScreen/PatientDashboard imports and callback-based return path are now exercised through the real patient portal widget tree with mocked HTTP responses. | PatientHomeScreen renders the Latest appointment section at 390×844, 768×1024, and 1366×768 without Flutter exceptions. |
| Hospital navigation overflow | Desktop navigation uses a fixed-width, independently scrollable sidebar. The mobile More sheet retains the secondary sections. | Tests verify all ten desktop destinations at 1024×768, 1366×768, and 1920×1080, and verify all six More-sheet destinations and Gallery selection at 390×844 and 768×1024. |
| Other dashboard layout failures | Responsive layout checks cover doctor, driver, and admin dashboards; resource cards are also checked separately. | Doctor, driver, and admin at 390×844, 768×1024, and 1366×768; hospital resource cards at 390×844, 768×1024, and 1024×768. No Flutter layout exceptions. |
| Ambulance API method/path mismatch | Flutter calls `PUT ${API_BASE_URL}/ambulance/:ambulanceId/deactivate`; the configured API base includes `/api`, matching Express's `/api/ambulance` mount and guarded `PUT /:ambulanceId/deactivate` route. The shared authenticated headers are retained. The backend deactivation implementation was not changed in this follow-up. | Frontend test asserts the exact composed path, PUT method, and presence of the Authorization header. The previous backend route/ownership/active-trip tests were reported passing. |

## Validation results

- `flutter test --no-pub`: passed, 21 tests. Full output: [flutter-test.log](./frontend-runtime-evidence/flutter-test.log).
- `flutter analyze --no-pub`: no errors or warnings, but exits 1 because of 29 `curly_braces_in_flow_control_structures` infos already present in the frontend. Output: [flutter-analyze.log](./frontend-runtime-evidence/flutter-analyze.log).
- `flutter build web --release`: succeeded. Flutter emitted non-blocking WebAssembly dry-run compatibility notices for `share_plus` and `geolocator_web` using `dart:html`. Output: [flutter-build-web.log](./frontend-runtime-evidence/flutter-build-web.log).
- `git diff --check`: passed; final check log: [git-diff-check.log](./frontend-runtime-evidence/git-diff-check.log).
- Browser smoke check: the release page returned HTTP 200 and rendered as CareSync. Responsive release screenshots: [mobile](./frontend-runtime-evidence/landing-mobile.png), [tablet](./frontend-runtime-evidence/landing-tablet.png), and [desktop](./frontend-runtime-evidence/landing-desktop.png).

## Still unverified

- Live authenticated login/logout and real API click-through for the five portals. No service was listening on the configured backend port 5001, and no live test account was available. No real credentials were used.
- Authenticated dashboard screenshots. Dashboard layouts were verified with widget tests and mocked HTTP; the saved browser screenshots are of the unauthenticated release landing page.
- `flutter analyze` does not exit successfully until the 29 informational style findings are addressed. They are not runtime or type errors and were not expanded into unrelated formatting changes here.
- WebAssembly output is not enabled/verified; the standard JavaScript release web build passed.

The backend ambulance deactivation implementation was left untouched.
