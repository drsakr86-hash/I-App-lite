# Accounting hardening — review report (branch `accounting-hardening`)

Status: **not merged, nothing applied to production.** The new SQL (`docs/sql/accounting-hardening.sql`) has only been run on throwaway local PostgreSQL 16 databases.

## 1. What was found and fixed

| # | Problem (on main `9ae2ea6`) | Fix |
|---|---|---|
| 1 | Legacy migration skipped a visit as soon as its Charge existed, so a failure between Charge and Payment left money unrecorded forever; a re-run could also double-bill a visit already charged by the collection flow. | `planLegacyMigration` is resumable per Charge / Payment / Entry / Expense, idempotent, dedups against collection-flow charges (visitId / sourceRef), adds a missing Payment only when `netPaid = 0`, repairs a missing entry, flags `VISIT_DIFFERS_FROM_CHARGE` / `PAID_BUT_PARTLY_RECORDED` for review. Finance state is authoritative for expenses/recurring. |
| 2 | Secretary guards ran with the caller's rights → the overpayment check only saw her 36-hour window of payments; the period-lock check could not read reconciliations. | Guards and helpers are `SECURITY DEFINER` (search_path pinned), `EXECUTE` revoked from clients; advisory lock per charge. |
| 3 | Secretary could read all charges / payments / accounts (needed for balances). | Secretary has **no SELECT** on any finance table. New RPC `iapp_fin_collection_state(apt_ids, pending_ids)` returns, for those appointments only, the charge(s) + adjustments, totals (net / paid / refunded / outstanding) from the FULL ledger, the usable accounts, and which of her own pending ids the server already holds. |
| 4 | Ledger entries were only checked for balance. | Entry guard: entry must have `source_ref`, id `ent-<source_ref>`, match a real origin row (charge / payment / refund / doctor_payment / transfer / paid expense / reconciliation adjustment / reversal) on type, date, source, clinic and **exact lines** (ledger, account, category, side, amount); reversals must mirror the original entry; one entry per origin row (unique index). A secretary can only post entries for her own `COLLECT_MODAL` charges and payments. Line ids are derived by the server (a client id could collide and silently drop a line). |
| 5 | Payments/expenses could use the legacy account/method; doctor payments were unchecked; reversals did not have to mirror. | Legacy account/method are migration-only; doctor payment needs an approved/partial settlement and ≤ remaining share; reversals must mirror (amount, accounts, charge, settlement); reversing a refund cannot push paid above net; audit rows from the secretary must point at a real charge/payment. |
| 6 | **Found while testing:** `insert … on conflict` (which the client used for insert-only tables) needs a SELECT policy, so it would have broken the secretary after fix 3. | `rowUpsert` on insert-only tables is a plain INSERT; a primary-key duplicate counts as success (offline retry); guards never re-judge a row whose id already exists. |
| 7 | Flush/commit order allowed an entry before its origin row. | Order: accounts → charges → rules → payments → settlements → allocations → reconciliations → expenses → recurring → **entries** → audit. |
| 8 | Collection charge id was random → two devices could create two receivables for one appointment. | Deterministic id `chg-<source>-<sourceRef>`. |

Server rules ⇄ UI: the UI already forbade the secretary adjustments/refunds/reversals/transfers; the server now enforces the same (RLS + guards), tested with the secretary's role.

## 2. Files changed

- `src/modules/finance/legacy-migration.js` — resumable/idempotent migration.
- `src/modules/finance/billing.js` — `chargeBalance` honours `state.serverBalances`; deterministic charge id.
- `src/modules/finance/store.js` — new order, `SCOPES.collect` removed (secretary has no read scope), `commitBatch(…, {verify:false})`, `stateFromCollectionRpc`, `loadCollectionState`.
- `src/modules/sync/row-tables.js` — insert-only tables use plain INSERT, PK duplicate = success.
- `src/modules/sync/finance-tables.js` — flush order.
- `src/screens/SecretaryApp.jsx` — loads state through the RPC (offline → existing legacy modal path).
- `docs/sql/accounting-hardening.sql` (NEW), `docs/sql/accounting-hardening-rollback.sql` (NEW), `docs/sql/tests/accounting-hardening.assertions.sql` (NEW).
- `tests/finance-hardening.test.js` (NEW), `tests/finance-sync.test.js`, `package.json` (new test registered).
- `docs/ACCOUNTING-HARDENING-REPORT.md` (this file).

## 3. Tests run and results

| Command | Result |
|---|---|
| `npm test` | 759 tests, 759 pass, 0 fail |
| `npm run build` | OK (only the existing chunk-size warning) |
| `npm run test:smoke:accounting` | OK (tabs + collect modal, finance and legacy) |
| SQL, fresh DB: harness → core → hardening → hardening assertions | ALL PASSED (also re-applying hardening is a no-op) |
| SQL, upgrade DB: harness → core → v1 assertions (data present) → hardening | OK, `iapp_fin_ledger_health` = 0 rows |
| SQL, rollback DB: harness → core → hardening → rollback → v1 assertions | ALL PASSED |

Covered by tests: legacy migration partial failure (80 random partial states converge, revenue never duplicated, third run empty), collection-flow dedup, differing amounts; secretary reads nothing; RPC totals with old (>36 h), multiple and partial payments, refunds, reversed payment; overpayment blocked on old payments; period lock; arbitrary/unlinked/wrong-amount/wrong-account/wrong-date/wrong-clinic/duplicate/mis-linked entries rejected for secretary and admin; reversal mirror; doctor payments; transfers; expenses and expense reversals; reconciliation adjustment; audit restrictions; helper functions not callable by anon/authenticated/doctor; idempotent retries; offline queue (dirty keys), flush order, verify-less commit, RPC offline/error handling.

SQL tests ran on a local throwaway PostgreSQL 16 with a harness that emulates Supabase roles/JWT (`docs/sql/tests/accounting-core.harness.sql`). **Not** run against a real Supabase branch/project.

## 4. Applying it (after your approval)

1. Pre-flight (read-only; each must return 0 rows) — listed at the top of `accounting-hardening.sql`.
2. Apply `accounting-hardening.sql` once. Existing rows are not re-validated.
3. Deploy the client of this branch **together with** the SQL: the new SQL removes the secretary's read access, so the OLD client would show her no balances; and the NEW client calls an RPC that exists only after the SQL. Order: SQL first, client immediately after.
4. Rollback: `accounting-hardening-rollback.sql` (restores v1 functions/policies; data untouched).

## 5. Remaining risks

- Real Supabase not exercised: local harness only. Suggest running the SQL on a Supabase branch first.
- Secretary offline: the collection screen falls back to the legacy modal (visit.cost/paid mirror only); that money reaches accounting only when the migration is re-run (now safe and idempotent).
- A secretary can still post a collection for any appointment id she names (no appointment ↔ secretary link exists server-side), but only as an INSERT-only, guard-checked `COLLECT_MODAL` charge/payment; she cannot change fees or touch history.
- Doctor payments flushed offline before an unsynced settlement approval are rejected once and succeed on the next flush retry.
- `accounts.opening_balance` is hidden from the secretary (the RPC omits it).
- Deploy coupling (SQL and client together) as in §4.
