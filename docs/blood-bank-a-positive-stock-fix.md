# Blood stock Add/Edit and A+ve correction

## Findings

The old schema stored one aggregate `blood_bank` row per hospital and blood group. Its Add endpoint used `ON CONFLICT` to increment `units_available`, overwrite the aggregate batch metadata, and retain the earliest expiry. The Edit operation therefore had no batch identity and could not edit one expiry batch independently. If the old aggregate expiry was already past, a new addition inherited that expired date and inventory reads excluded the whole aggregate, displaying zero.

The project has two Hospital Portal edit entry points: Manage Resources and the standalone Blood Bank screen. Both now call the same batch-specific PUT operation. Add remains a separate POST operation. A+ve was accepted by the backend normalizer, but that did not guarantee a canonical database row; text aliases could occupy separate rows because uniqueness was on the raw string. The database migration canonicalizes existing spellings to `A+`, refuses to merge ambiguous duplicates, and the Flutter API also sends canonical `A+`.

The date picker uses `DD/MM/YYYY`. `5/12/2026` is 5 December 2026 and is sent as ISO date `2026-12-05`. PostgreSQL `CURRENT_DATE` decides availability, avoiding client timezone conversion.

## Implementation

- Added `blood_inventory_batches`, backfilled one batch from each existing aggregate row, and retained `blood_bank` as a compatibility aggregate for existing APIs. The aggregate sync trigger keeps legacy increment/decrement routes aligned with batches.
- Add inserts a new batch and recalculates the active group total and expiry. It does not upsert the entered quantity into the old row.
- Edit sends a batch ID. SQL replaces that batch's quantity and expiry and scopes the update to its blood bank row, authenticated hospital, and canonical group. When multiple batches exist, an edit without a batch ID is rejected.
- Inventory reads normalize and aggregate the canonical eight groups from batches. Expired batches remain available to edit but are excluded from available totals.
- Both Hospital Portal screens list batches and provide per-batch Edit actions. They refresh from the backend after a successful mutation, compare the refreshed total with the response, and show errors on failure. A+ is displayed as “A+ve” in the hospital inventory UI and stored/sent as `A+`.
- The server startup schema hook applies the idempotent batch migration; the matching migration registry entry verifies the batch table and backfill.

## Request payloads

Add (`POST /api/blood-bank/add-expiry`):

```json
{"blood_group":"A+","units":10,"expiry_date":"2027-01-10"}
```

Edit (`PUT /api/blood-bank/stock`):

```json
{"blood_group":"A+","batch_id":51,"units":15,"expiry_date":"2026-12-05"}
```

Edit SQL updates `blood_inventory_batches.units_available` and `expiry_date` with a `WHERE` clause for batch ID, parent stock ID, hospital ID, and blood group. It then recalculates the compatibility aggregate and writes an adjustment transaction.

## Database verification

The migration was applied to the configured local PostgreSQL database. A read-only consistency check then passed across 16 hospitals: 96 aggregate rows had 96 corresponding batches, with no orphan batches, noncanonical group values, duplicate hospital/group rows, or aggregate-total mismatches. The database contained two expired A+ batches; eligible A+ batch stock across the local database was 99 units. These are cross-hospital totals and do not identify the account from the user’s screenshot.

A separate PostgreSQL integration test used disposable rows inside a transaction and rolled them back. It verified the database after each operation:

| Action | Batch quantities | Persisted group total |
| --- | ---: | ---: |
| Initial A+ | 10 | 10 |
| Edit A+ve to 15 | 15 | 15 |
| Repeated edit to 5 | 5 | 5 |
| Add a new batch of 10 | 5, 10 | 15 |
| Edit the first batch to 3 | 3, 10 | 13 |

It also verified that adding 6 future O+ units alongside an expired batch of 8 shows 6 available, that A+ve creates only canonical A+ records, and that a different user receives 404 when attempting to edit the batch. The temporary database records were rolled back; a follow-up query found no disposable test users.

## Tests

- Backend unit tests: 8 passed across `bloodBankFlow.test.js` and `bloodInventoryService.test.js`.
- PostgreSQL integration test: 1 passed with `RUN_POSTGRES_INTEGRATION=1`.
- `verifyBloodInventoryConsistency.js`: 16 hospitals passed.
- Flutter tests: 24 passed, including separate Add POST and batch Edit PUT payload checks.
- Dart analysis on the changed Flutter files: no issues found.

## Actual Hospital Portal acceptance status

The signed-in account-specific screen, network request, and screenshot are **not verified yet**. After the user signed in and marked the preview ready, the computer-use runtime failed to initialize with `failed to write kernel assets: The system cannot find the path specified (os error 3)`. I could not inspect the signed-in browser or capture the requested corrected-inventory screenshot. The database workflow above is an isolated PostgreSQL regression test, not a change to the hospital account shown in the screenshot. No real hospital stock quantities were changed by testing.

## Files changed

- `backend/src/migrations/022_blood_inventory_batches.sql`
- `backend/src/config/bloodInventoryBatchSchema.js`
- `backend/server.js`
- `backend/src/services/migrationRegistry.js`
- `backend/src/services/bloodInventoryService.js`
- `backend/src/controllers/bloodBankController.js`
- `backend/scripts/verifyBloodInventoryConsistency.js`
- `backend/test/bloodBankFlow.test.js`
- `backend/test/bloodInventoryService.test.js`
- `backend/test/bloodInventoryPostgres.integration.test.js`
- `frontend/lib/services/api_service.dart`
- `frontend/lib/providers/hospital_provider.dart`
- `frontend/lib/screens/hospital/hospital_resources.dart`
- `frontend/lib/screens/hospital/hospital_blood_bank.dart`
- `frontend/test/blood_stock_update_api_test.dart`
