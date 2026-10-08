# I-App Lite — Accounting Architecture Audit

Baseline commit: `186aca3` · Audit date: 2026-10-08 · Baseline: `npm test` 702/702 pass, `npm run build` OK.
Live data was inspected **read-only** (Supabase project `mofdveiwlaymlabvsypu`). Nothing was changed.

## 1. Where money exists today

| Concept | Stored in | Type in DB | Notes |
|---|---|---|---|
| Visit fee / paid flag | `iapp_visits.cost`, `.paid` | `text`, `boolean` | Entered in `VisitForm`, `CollectModal` (via secretary), patient-file |
| Appointment fee / paid flag | `iapp_appointments.cost`, `.paid` | `text`, `boolean` | Entered in `SecretaryAptForm` and `CollectModal` |
| Expense | `iapp_expenses` | `amount text` | id is `Date.now()` text |
| Recurring expense template | `iapp_recurring_expenses` | `amount text` | no schedule, only "every month" |
| Audit trail | `iapp_store` key `iapp_audit` | jsonb list | capped at 1500 entries, `details` cut to 200 chars; money events are logged only for Collect |

Not present anywhere: charge, invoice, payment, method, account/cashbox, refund, ledger, doctor share, settlement, reversal, reconciliation.

## 2. Current-state diagram

```
 Patient ─ Appointment (cost, paid) ──Collect──► Visit "apt-<aptId>" (cost, paid)
              │                                      ▲
              └──────── SecretaryAptForm             │ VisitForm / patient file (cost, paid)
                                                     │
        revenue = visits.filter(paid).sum(cost) ─────┴──► Accounting, Dashboard, Settings summary,
                                                          print reports, patient "totalSpent"
 Expense (amount) ─► iapp_expenses ◄── auto-created on Accounting mount from recurring templates
```

## 3. Findings

**F1 — The visit is the financial source of truth.** Revenue is `paid ? Number(cost) : 0` computed independently in 7 places:
`accounting/model.js` (`computeRevenue`, `buildClinicComparison`), `dashboard/model.js` (`paidCost`), `settings/model.js` (`computeTotalRevenue`),
`print/templates.js` (daily report, patient statement ×2), `patient-file/use-patient-file.js` (`totalSpent`), `secretary-app/model.js` (`collectedToday` from *appointments*).

**F2 — Two competing sources.** Appointments and visits both carry cost/paid. Live data: 24 appointments have a fee but **no** collection visit
(`apt-<id>`), so the secretary stats count them while the Accounting screen does not. The two screens already disagree.

**F3 — Money is text and floating point.** DB columns are `text`; JS uses `Number()` and `reduce`. No currency/precision rules.

**F4 — Collect is not a transaction.** `handleSaveCollect` does three independent writes (appointment, visit upsert, audit entry). A failure between them leaves cost/paid inconsistent. There is no payment record, method, account, receipt, partial payment, or refund (paid is a boolean).

**F5 — Hidden side effect on screen open.** `Accounting.jsx` has a mount effect that appends *paid* expenses for every recurring template once per month, with random ids and a duplicate check against local state only. Two devices opening the screen offline will each create one → duplicate expenses after sync.

**F6 — Sync model is destructive for financial rows.** `rowMutate` writes the whole list and `rowDelete`s every row missing from it; `mergeData` is last-writer-wins on conflicting edits. A stale client can silently remove or overwrite financial rows. Ids are `Date.now()` / `Math.random()` (collision-prone across devices).
Good parts to keep: dirty-key queue, 3-way merge, retry, `BACKUP_KEYS`, `ensureAuthed`, offline fallback `sbMutateLocal`.

**F7 — Deletes are real and unaudited.** `delExp`/`delRec` remove rows after a confirm. No audit entry for expense create/edit/delete. `reset()` in `App.jsx` overwrites expenses/visits with seed data.

**F8 — Permissions are cosmetic.** `permissions.js` is "architecture only" and unused by accounting. Access control is `adminOnly` nav + `effectiveTab` check in `App.jsx`. Server side: `iapp_expenses`/`iapp_recurring_expenses` are admin-only RLS (good), but `iapp_visits` allows **any staff** to write any visit's cost/paid (`staff_visits`).

**F9 — Multi-clinic is weak.** Clinic is a free label on visits; 41 of 53 live visits have no clinic, so clinic filters under-count. Doctor is a short-name string, not an id.

**F10 — No doctor accounting.** No share rules, no settlement. Print report receives a single `revenue` number.

**F11 — Data anomalies in live data** (53 visits): 21 paid with cost, 2 paid with zero/empty cost, 9 unpaid with cost (receivables), 4 `apt-` visits, 24 appointments with fee but no visit, 6 expenses (4 linked to recurring), 2 recurring templates. All amounts parse as numbers.

## 4. Every place a financial value is created / changed / deleted / calculated

- **Create/modify cost, paid:** `VisitForm` (+`visit-form-model.js`), `CollectModal` → `SecretaryApp.handleSaveCollect` (`buildCollectionVisitRecord`), `SecretaryAptForm`, `patients-orchestration.js` (new visit cost 0), seed.
- **Persist:** `row-tables.js` (`iapp_visits`, `iapp_expenses`, `iapp_recurring_expenses`), `appointment.mapper.js` (cost/paid), `patient-file/normalize.js`.
- **Expenses:** `Accounting.jsx` (add/edit/delete, recurring mount effect), `ExpenseForm`, `RecurringExpenseForm`, `accounting-forms-model.js`.
- **Calculate:** the 7 sites in F1, plus `dashboard` `pendingPayment`, `WaitingRoom` pay badge, `VisitsTab`.
- **Legacy dependents to keep working:** everything above reads `visit.cost/paid`; they stay untouched in this redesign (compat layer, section 8).

## 5. Target-state diagram

```
 CLINICAL (unchanged)                       FINANCIAL (new, independent)
 Patient ─ Appointment ─ Visit ──(ref only)─► Charge ──► Payment ──► Entry ──► Account
                                                 │          │ (refund = negative/reversal)
                                                 └─► Revenue Allocation ─► Doctor Settlement ─► Payment(out)
 Expense ─► Expense Payment ─► Entry ─► Account        Transfer ─► Entry(2 lines) ─► Accounts
 Every mutation ─► Financial Audit row (who/when/what/old/new/source/reason)
```

## 6. Design decisions

1. **Ledger is append-only.** `posted` entries are never updated or deleted; corrections are a *reversal* entry that references the original. Enforced by DB triggers, not only by JS.
2. **Money:** PostgreSQL `numeric(14,2)`. In JS, amounts are handled as **integer piastres** inside the domain module and converted at the edges; never summed as floats.
3. **Ids:** client-generated UUIDv4 (text) for all new financial rows — stable across offline devices, no collisions. Idempotency keys (`source`, `source_ref`) are unique-constrained.
4. **Sync:** financial tables are **append-only rows**, so they must NOT use the whole-list `rowMutate` delete path. A new `ROW_TABLES` flag `appendOnly: true` makes `rowMutate` upsert-only (never delete) and `mergeData` union-by-id with server-wins for posted rows. Existing keys and flow stay as they are.
5. **Server is the final guard.** Triggers enforce: payment ≤ outstanding charge, account required, no update/delete of posted rows, balanced entries (sum debit = sum credit).
6. **Legacy fields stay.** `visits.cost/paid` remain readable and writable (so old screens work); a compat layer keeps them in sync *from* the new domain, not the other way round (section 8).
7. **No hidden side effects.** Opening Accounting is read-only. Recurring expenses produce *due* items; the admin confirms/pays them.

## 7. Open decisions (defaults chosen, tell me if you disagree)

- **D1 — Appointment-only fees (24 live rows).** Default: **not** auto-migrated into revenue. They are listed in a "needs review" report (they were never counted by Accounting). Migrating them would raise historical revenue.
- **D2 — Production migration.** SQL is written as files and tested locally; it is **not** applied to the production project until you approve.
- **D3 — Doctor share default.** No percentage is assumed: with no rule configured, doctor share = 0 and the screen says "no rule set".
- **D4 — Visits with no clinic (41).** Migrated with clinic = NULL ("unassigned"), not guessed.

## 8. Risks to watch during implementation

Sync regressions (largest risk) · `reset()` wiping data · two sources of truth during transition (visit.paid vs payments) · RLS on new tables must mirror existing `iapp_is_staff()/iapp_is_admin()` helpers · Arabic/English i18n coverage test (`i18n-coverage.test.js`) will fail on any new untranslated key.
