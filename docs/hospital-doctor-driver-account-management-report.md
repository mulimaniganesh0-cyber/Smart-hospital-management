# Hospital doctor and driver account management report

Date: 2026-11-02

## 1. Problems identified

- Hospital drivers were created as pending email invitations with an unusable dummy password. Driver login already accepted a phone field, but managed drivers could not use it to establish credentials.
- The hospital driver screen depended on invitation email and had no one-time credential display or password reset action.
- Doctor password reset accepted a hospital-selected password and cleared the required-change flag, allowing the doctor to keep using a password communicated by staff.
- `password_reset_required` blocked all protected routes, including the route a user would need to change their password.
- Doctor availability and account activation were coupled in the existing staff update operation.
- Global icon-button styling did not provide a shared visible background and interaction state for hospital toolbar actions.

## 2. Database schema changes

Added migration `021_managed_account_passwords.sql`. It adds `users.token_version` and a unique index on normalized mobile digits for plausible mobile numbers. Before creating the index, the migration raises an explicit error if existing normalized duplicates are present. This migration was **not applied**. `npm run migrate:run -- --status` exited with code 1 before reporting migration state because the configured PostgreSQL connection was unavailable; no database was modified.

## 3. New and modified APIs

- `POST /api/roles/drivers`: creates a hospital driver with required mobile, optional email, license and expiry, assigned ambulance, and accepted or generated initial password.
- `GET /api/roles/drivers`: returns hospital driver account, assignment, availability, password-change and active-trip status without credentials.
- `PUT /api/roles/drivers/:driverId`: edits driver identity and license details, scoped to the authorized hospital.
- `POST /api/roles/drivers/:driverId/password-reset`: generates a one-time temporary password and sets mandatory password change.
- `PUT /api/roles/drivers/:driverId/status` and `PUT /api/roles/drivers/:driverId/ambulance`: preserve server-side ownership and active-trip checks.
- `POST /api/auth/login`: supports mobile lookup while retaining email lookup and existing role/JWT payload behavior. Hospital drivers cannot be created through public registration; private driver registration remains separate.
- `POST /api/auth/change-password`: verifies the current password, enforces strength and confirmation, updates the hash, clears the first-login flag, increments token version and returns a refreshed token.
- `POST /api/roles/staff` and `PUT /api/roles/staff/:staffId/password`: doctor creation now requires first-login change; reset generates a one-time temporary password scoped to the hospital.
- `PUT /api/hospitals/staff/:staffId/status`: activates or deactivates an owned doctor login independently of availability.

The hospital invitation-token activation route was removed from routing and the Flutter route/action was removed. The private ambulance registration flow remains available.

## 4. Driver account creation workflow

The hospital enters the driver's name, mobile, optional email, license number, future expiry, initial password, and an unassigned active ambulance. The server normalizes the mobile for duplicate detection, serializes competing mobile allocations with an advisory lock, hashes the password, creates an active hospital-driver account with `password_reset_required=true`, and assigns the ambulance. The response contains the initial password once; normal list APIs never include it or the hash.

## 5. Mobile-number login workflow

Login resolves email or normalized phone against the existing `users` account table. If multiple rows match, login fails closed. Credentials are checked before account-status messages are returned. JWT roles and driver assignment checks remain in place. Phone uniqueness is enforced by the pending migration and checked by provisioning flows.

## 6. Initial password workflow

The hospital driver creation screen displays the server-confirmed initial password once with copy support and a secure-sharing reminder. Login returns `password_reset_required`; the Flutter app routes the account to the mandatory change screen, and backend middleware permits only that password-change request while the flag remains set.

## 7. Driver password reset workflow

Hospital staff confirm the reset action. The server verifies hospital scope, generates a cryptographically random temporary password, hashes it, flags mandatory change, increments token version, and returns the password only in that response. Existing driver sockets are disconnected. Legacy invited drivers can be issued credentials through this reset path.

## 8. Doctor password reset workflow

Doctor account creation still supports the existing email identifier and also provisions mobile lookup. It sets a first-login flag and displays the initial password once. Hospital reset now generates a temporary password, requires a change, increments token version, verifies hospital ownership and returns the password once. Doctor activate/deactivate status is separate from booking availability.

## 9. First-login and self-service password changes

Drivers and doctors can change passwords from their profile/dashboard using the old password. The server enforces a 10-character minimum, upper and lower case, a digit and a symbol, confirmation, current-password verification and no immediate reuse. Successful changes update the hash and token version, refresh the calling token, and disconnect existing role sockets.

## 10. Security protections

- Passwords are hashed with the existing `bcryptjs` library; one-time passwords are not stored in plaintext or logged.
- Hospital ownership is part of driver and doctor update/reset SQL predicates; client-supplied hospital IDs cannot widen a normal hospital manager's scope.
- Account changes increment JWT token version. Protected requests compare the token version with current user data.
- Driver deactivation is rejected during an active trip; ambulance reassignment already rejects active trips and requires an unassigned active ambulance.
- Password change is the only protected route allowed while a mandatory password change is pending.
- Login and password endpoints remain under the app's existing API rate limiter.
- Mobile provisioning uses normalized duplicate checks and transaction advisory locks; migration refuses to create a unique index over unresolved duplicates.

## 11. Frontend screens updated

- Hospital driver list: searchable cards, mobile and license details, assignment and availability/account status, edit, reset, activation controls, refresh and add actions.
- Driver creation: mobile required, email optional, license and expiry validation, password entry and ambulance selection.
- Driver and doctor password reset: confirmation and copy-once secret display.
- Driver and doctor dashboards: self-service password-change access.
- Login: routes first-login accounts to mandatory password change and no longer presents hospital invitation activation.
- Shared theme: icon buttons now use navy/teal foreground/background contrast plus hover and pressed states.

## 12. Buttons and actions tested

Backend unit tests cover mobile-only driver creation and password hashing, driver reset scoping and one-time response, doctor/driver first-login token flags, password change validation and existing private-driver approval/login behavior. These controller tests use mocks; they do not prove PostgreSQL transaction or cross-hospital persistence behavior.

Flutter regression tests also verify the five portal options and confirm hospital drivers see mobile/initial-password guidance without the obsolete invitation activation action.

## 13. Backend test results

`npm test`: **85 passed, 0 failed, 7 skipped** (92 total). The skipped tests include database-backed PostgreSQL integration checks that were not enabled in this environment. Changed backend JavaScript files also passed `node --check`.

## 14. Flutter test and build results

`flutter analyze --no-pub`: **No issues found**. `flutter test --no-pub`: **All tests passed** (16 tests). `flutter build web --release --no-pub`: **built successfully**. The build printed Wasm dry-run compatibility notices because `share_plus` and `geolocator_web` still import `dart:html`; the regular JavaScript web build succeeded. The four requested Dart files were formatted.

## 15. Remaining limitations

- The migration is pending. Before applying it, restore PostgreSQL connectivity and run `npm run migrate:run -- --status`; resolve any normalized mobile duplicates the migration reports, then apply through the ledger-backed migration runner.
- PostgreSQL-backed create/login/reset/ownership tests were not run. The new controller tests are unit tests and are not a substitute for those checks.
- Flutter's optional Wasm compatibility remains unavailable for the `share_plus` and `geolocator_web` dependency versions, although the release web build succeeds.
- A live cross-platform workflow has not been exercised against a configured hospital account, driver account, ambulance, and PostgreSQL database.
