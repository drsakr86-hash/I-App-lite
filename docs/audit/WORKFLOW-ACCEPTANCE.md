# WORKFLOW ACCEPTANCE — status of the 15 required scenarios

**Honest summary: no end-to-end (browser/real-backend) test was run, and the repository has no E2E runner.** What exists and ran: 779 unit/integration tests with mocked storage/Supabase (`npm test`), and 3 react-test-renderer smoke suites. None of the scenarios below is marked "passed end-to-end".

Status values: NOT RUN = no test executed against a real UI/backend; PARTIAL = related unit/smoke tests exist and pass (file names listed, **not mapped assertion by assertion**); CODE-REVIEWED = read in code/catalog, no execution; BLOCKED = needs authorization or environment I do not have.

| # | Scenario | Status | Evidence / gap |
|---|---|---|---|
| 1 | Create patient, find after refresh | PARTIAL | `tests/patients-list.test.js`, `sync-*.test.js`, `data-access.test.js` (mocked storage). Real refresh: NOT RUN |
| 2 | Book appointment, appears on the right staff screen | PARTIAL | `tests/booking-requests.test.js`, `appointments*.test.js`, `secretary-app-model.test.js`. Real booking → staff: NOT RUN |
| 3 | Appointment visible only to authorized roles | CODE-REVIEWED | RLS read from production (PERMISSIONS-MATRIX): anon cannot read appointments; any staff can. UI role hiding: NOT RUN |
| 4 | Queue + visit lifecycle | PARTIAL | `tests/queue.test.js`, `queue-model.test.js`, `realtime-call-channel.test.js`. Live status consistency across appointment/visit/queue: NOT RUN |
| 5 | Save clinical exam and reopen | PARTIAL | `tests/exam-form-model.test.js`, `ophth.test.js`, `patient360-save-workflows.test.js`. OD/OS laterality in the real forms: NOT RUN |
| 6 | Create and print prescription | PARTIAL | `tests/rx-form-model.test.js`, `print-templates.test.js`, `print-dom-print.test.js`, screens smoke. Printing on mobile/desktop: NOT RUN |
| 7 | Order investigation, upload image, link report | PARTIAL | `tests/investigation-links.test.js`, `imaging-model.test.js`, `radiology-model.test.js`. Cloudinary upload and failure reporting: NOT RUN / BLOCKED (no account access) |
| 8 | Clinic-specific vs general prices | PARTIAL | `tests/price-per-clinic.test.js` passes (existing) |
| 9 | Partial payment then collect remainder | PARTIAL | `tests/finance-flow.test.js`, `finance-core.test.js`. Against the real DB: BLOCKED (secretary RPC missing in production, F-03) |
| 10 | Retry does not duplicate a charge/payment | PARTIAL + CODE-REVIEWED | `tests/finance-hardening.test.js`, `finance-sync.test.js`; production has the unique indexes `iapp_charges_source_uq`, `iapp_payments_source_uq` (catalog-verified). Partial-failure simulation at every write boundary: NOT re-run by me |
| 11 | Expense creation and reconciliation | PARTIAL | `tests/accounting-model.test.js`, accounting smoke. Reconciliation against production ledger: NOT RUN |
| 12 | Doctor / secretary / admin boundaries | CODE-REVIEWED | Backend matrix derived from RLS (there is no doctor account in production). UI boundaries and per-role E2E: NOT RUN |
| 13 | Offline → online without losing queued work | PARTIAL | `tests/sync-engine.test.js`, `sync-wiring.test.js`, `finance-sync.test.js` (offline queue assertion). Real network toggle: NOT RUN |
| 14 | Refresh during deployment, recover from stale chunk | PARTIAL | `tests/stale-chunk-recovery.test.js`; `verify-dist` green. Live check: UNVERIFIED (sandbox blocked) |
| 15 | Arabic RTL and print on mobile and desktop | PARTIAL | `tests/i18n-coverage.test.js`, screens smoke (120 checks incl. "no Arabic in English UI", direction). Real device rendering/print: NOT RUN |

## Counts (final branch state)
`npm test`: 779 tests, 779 pass, 0 fail, 0 skipped, 0 todo. Smoke: `test:smoke` pass, `test:smoke:screens` pass (120 checks), `test:smoke:accounting` pass. E2E tests implemented: 0 (not implemented).

## Suggested E2E setup (not added: new dependency)
Playwright against a Supabase **branch** with synthetic fixtures; start with scenarios 1, 2, 9, 10, 13, 14.
