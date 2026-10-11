# PERMISSIONS MATRIX — backend (RLS) as read from production on 2026-10-11

Source: `pg_policies` and `role_table_grants` of project `mofdveiwlaymlabvsypu` (read-only). Staff are identified by JWT email matched in `iapp_staff` through SECURITY DEFINER helpers `iapp_is_staff()`, `iapp_is_admin()`, `iapp_has_role(text[])`. Current staff: **1 admin, 3 secretary, 0 doctor** (counts only). The UI role "doctor" therefore has no distinct backend identity today. Sign-ups are disabled (per project notes; not independently verified here).

R = SELECT, C = INSERT, U = UPDATE, D = DELETE. "—" = no policy → denied.

| Data | anon | secretary | admin |
|---|---|---|---|
| `iapp_booking_requests` | C only (status pending, date today…+60 d, name 3–80, phone 8–20, note ≤300) | R C U D | R C U D |
| Booking slot counts (`iapp_slots_taken`, definer view) | R | R | R |
| Queue (`iapp_queue_public` view / `iapp_queue_public_cache`) | R (table: all rows, F-05) | R | R |
| `iapp_appointments`, `iapp_visits` (legacy tables) | — | R C U D | R C U D |
| `iapp_patients_core`, `iapp_visits_core`, identity/appointment maps | — | R C U D | R C U D |
| Exams/diagnoses/treatments/prescriptions/investigation/imaging orders & studies/followups `*_core` | — | — | R C U D |
| `iapp_imaging_report_versions_core`, `iapp_record_deletions`, migration logs | — | R | R |
| `iapp_core_sync_log` | — | R C | R C |
| `iapp_store` keys except the 2 expense keys (patients, exams, prescriptions, imaging, backups, trash, audit, users, prices, clinic…) | — | **R C U D (F-06)** | R C U D |
| `iapp_store` keys `iapp_expenses`, `iapp_recurring_expenses`; tables `iapp_expenses`, `iapp_recurring_expenses` | — | — | R C U D |
| `iapp_charges` | — | R (all rows), C (kind=charge, source≠LEGACY_VISIT) | R C U D |
| `iapp_payments` | — | R **only rows created in the last 36 h**, C (kind=payment, source≠LEGACY_VISIT) | R C U D |
| `iapp_accounting_entries` | — | C (type charge/payment) | R C U D |
| `iapp_accounting_entry_lines` | — | — | R |
| `iapp_fin_accounts` | — | R | R C U D |
| `iapp_fin_audit` | — | C (entity charge/payment) | R C U D |
| share rules, settlements, revenue allocations, cash reconciliations | — | — | R C U D |
| `iapp_staff` | — | — (RLS on, no policy; only definer helpers read it) | — |

Differences between this production state and the repo's own docs (`accounting-hardening.sql`, **not applied**): hardening makes secretary finance **INSERT-only, no SELECT** and adds `iapp_fin_collection_state`. Production today still has secretary SELECT on charges/accounts/36 h payments.

## Functions
All `iapp_create_*`, `iapp_sync_*`, `iapp_get_patient_*`, `upsert_iapp` etc. are SECURITY INVOKER (RLS applies to the caller) and not executable by anon. Definer functions: the three role helpers (authenticated only), `iapp_refresh_queue_public_cache` (not anon-executable), `iapp_fin_entries_expand` (anon-executable, F-10).

## Print / export / administer
No backend enforcement exists for printing or exporting: anyone who can read the rows can print/export them in the browser (`DataTools`, backups, print templates). "Administer" (users, prices, clinic settings, backups, trash) is enforced in the UI by role and server-side only through `iapp_store`/expense policies above; `iapp_users` and `iapp_backups` store keys are writable by any staff (the client verifies admin via `iapp_is_admin()` RPC, not the stored list).

## UI-only boundaries (NOT backend-enforced) — UNVERIFIED in the browser
Menu/button hiding for roles in `App.jsx`/`SecretaryApp.jsx` was not exercised by an automated browser test. Acceptance scenario 12 (doctor/secretary/admin boundaries) is therefore **not executed**.
