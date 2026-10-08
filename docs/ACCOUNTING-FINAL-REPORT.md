# I-App Lite — Accounting redesign: final report

Baseline commit `186aca3` · tests 702 → **740 passing** (+38) · `npm run build` OK · render smoke (`npm run test:smoke:accounting`) OK ·
SQL: 10 tables validated on a local PostgreSQL 16 (assertions pass, rollback tested, re-apply tested). **The SQL is NOT applied to production.**

## 1. Audit
Full audit with findings F1–F11: `docs/ACCOUNTING-AUDIT.md`. Headline: money lived only as `visit.cost` + a boolean `visit.paid` (and `iapp_expenses` text amounts); no payment record, method, account, receipt, reversal, history or audit; `Accounting` created expenses on mount; edits/deletes overwrote history; the sync layer deletes rows missing from a list.

## 2. Diagrams
```
BEFORE   Appointment ─┐
                      ├─ Visit.cost + Visit.paid  ──► Accounting screen (sums paid visits − expenses)
         Expense (free amount, edited/deleted in place; auto-created on screen open)

AFTER    CLINICAL:  Patient → Appointment → Visit            (unchanged)
                                   │ best-effort legacy mirror (cost/paid) only
         FINANCIAL: Charge ─► Payment (method + account) ─► Ledger entry (balanced lines) ─► Account / reports
                      │            └ refund / reversal / transfer / doctor_payment (append-only)
                      └ Revenue allocation ─► Doctor settlement ─► doctor_payment
                    Expense (pending → paid | cancelled; reverse) ─► Ledger entry
                    Cash reconciliation (count, difference, period lock)     Financial audit trail
```

## 3. Schema (`docs/sql/accounting-core.sql`)
New: `iapp_fin_accounts`, `iapp_charges`, `iapp_payments`, `iapp_accounting_entries` (+ server-expanded `iapp_accounting_entry_lines`), `iapp_doctor_share_rules`, `iapp_doctor_settlements`, `iapp_revenue_allocations`, `iapp_cash_reconciliations`, `iapp_fin_audit`, view `iapp_fin_ledger_health`.
Extended (additive columns only): `iapp_expenses` (status, due_date, account_id, payment_method, created_by, approved_by, paid_at, reversal_of, source), `iapp_recurring_expenses` (frequency, start/end/next_due_date, active, account_id).
Rules enforced in the DB: numeric(14,2); append-only triggers (no UPDATE/DELETE on charges, payments, entries, lines, allocations, reconciliations, audit); balanced entries only; no overpayment; period lock after reconciliation; one reversal per row; paid expenses immutable; RLS admin-all, secretary = controlled collection only.
`iapp_visits.cost/paid` kept untouched (legacy).

## 4. Migration strategy
Pure, idempotent, traceable (`legacy-migration.js`, run from the explicit admin button **Accounting → financial setup**, with a **dry-run preview that writes nothing**):
- paid/priced visit → Charge `chg-legacy-visit-<id>` + Payment `pay-legacy-visit-<id>` (method `legacy`, account `acc-legacy`) → entries; re-running skips what exists.
- unpaid visit with a fee → Charge only (receivable). Paid without amount → "needs review".
- appointment-only fees (never counted before) → **needs review list**, not auto-added to revenue (D1).
- expenses → status `paid` on the legacy account; recurring templates → monthly templates, **never back-filled**.
- no payment method is invented; visits are never edited.

## 5. Changed / new files
New: `src/modules/finance/*` (money, ids, constants, ledger, audit, batch, billing, collection, expenses, doctor-accounting, reconciliation, legacy-migration, reports, repair, accounts, store, use-finance, index), `src/modules/sync/finance-tables.js`, `src/screens/accounting/*` (Overview, Expenses, Doctors, Cash, Setup, parts, view-model), `src/modules/i18n/dict/g8.js`, `docs/sql/*`, `docs/ACCOUNTING-*.md`, tests `finance-core|flow|sync`, smoke `accounting-render`.
Changed: `src/app/permissions.js`, `src/modules/sync/row-tables.js`, `src/modules/sync/engine.js` (BACKUP_KEYS), `src/modules/i18n/dict/index.js`, `src/components/forms/CollectModal.jsx`, `src/screens/{Accounting,App,SecretaryApp}.jsx`, `package.json` (tests + smoke script), `tests/sync-row-tables.test.js`.

## 6. DB migrations
`docs/sql/accounting-core.sql` (apply) · `accounting-core-rollback.sql` · tests under `docs/sql/tests/` (harness + assertions, run on a throwaway DB only).

## 7. Permission & sync changes
- Permissions: `accounting, payments, expenses, doctor_settlements, financial_reports, cash_accounts` — admin `*`; secretary `payments: read/create(+legacy write alias)`, `cash_accounts: read`; doctor/employee none. Enforced in UI and mirrored by RLS (secretary cannot adjust a posted fee, reverse, refund, see expenses/settlements).
- Sync: nothing bypassed. Finance keys are `ROW_TABLES` (`useDB → queueSave → flusher → sbMutate/rowMutate`). Added table flags `insertOnly` (ON CONFLICT DO NOTHING), `noDelete` (rows missing from a list are kept; `rowDelete` refuses), `paged` (reads past the 1000-row cap). Every id is client-generated or deterministic ⇒ offline retries/duplicate devices are harmless. Commits write parents first; `repair.missingEntries` heals a half-committed money row.

## 8. Behaviour notes
- Opening Accounting only **reads**. Recurring expenses are produced only by the explicit "Create due expenses" button, as *pending* items.
- Until an admin runs the financial setup, the secretary's collect modal keeps working exactly as before (legacy path).
- Settings "reset" no longer touches expenses/recurring.
- Doctor share: no rule ⇒ share 0 and the screen says so (D3).

## 9. Tests & build
`npm test` 740/740 · `npm run build` ✓ · `npm run test:smoke:accounting` ✓ · SQL assertions ✓ (all constraints, RLS, append-only, period lock, rollback and re-apply).

## 10. Remaining risks
1. Production SQL not applied (needs approval) — until then the app runs in legacy mode.
2. Secretary device loads all charges/payments to compute a balance (scales to ~tens of thousands of rows; a server RPC for per-appointment balance is the next step).
3. Finance rows are cached in localStorage by `rowList` — quota risk on very large ledgers.
4. Weekly `iapp-backup.mjs` (Termux, not in repo) must add the finance tables.
5. Dashboard / Settings / print / patient file still read legacy `visit.cost/paid`; they stay correct only through the best-effort mirror after each collection.
6. Doctor "own view" cannot be enforced server-side until doctors are linked to staff accounts (D5).
7. Multi-key commits are not one DB transaction; ordering + repair covers the known case, a server RPC would remove it.

## 11. Rollback
App: `git revert` the accounting commit (no data impact). Data: run `docs/sql/accounting-core-rollback.sql` after exporting finance tables — drops only the new tables/columns; legacy visits/expenses/amounts are untouched. Legacy `iapp_visits.cost/paid` was never modified, so the old screens work immediately after either step.
