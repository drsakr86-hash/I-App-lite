# ARCHITECTURE MAP — I-App Lite (as read on 2026-10-11)

Derived from directory layout, `src/services/rpc.js`, `src/modules/finance/store.js`, `public/sw.js`, workflows, and the production catalog. Items marked (not traced) were not followed line by line.

## Layers
- **Shell**: `index.html` + `src/main.jsx` (lazy-loaded heavy screens, error boundary, SW registration, `chunk-recovery`), `public/sw.js` (build-stamped by `vite.config.js`), `public/queue-display.html` (separate, account-less TV screen).
- **Screens** (`src/screens`): App (admin/doctor shell), SecretaryApp, PatientApp (public booking portal), Dashboard, Patients/PatientFile, Appointments, WaitingRoom, Prescriptions, Radiology, ImagingCenter, Accounting (+ tabs), Settings, UnifiedLogin.
- **Modules** (`src/modules`): auth, patients, appointments, visits, examinations, prescriptions, investigations, imaging, queue, followups, notifications, finance (ledger domain), accounting (legacy view-model), sync (offline queue/engine/row-tables), data-access, realtime, print, i18n, patient-file, patient-app, secretary-app, settings, theme, ui.
- **Services** (`src/services`): `supabase.js` client, `rpc.js` (timeout 6 s default, in-flight de-duplication, retries only for transient errors, "never retry non-idempotent clinical writes"), `auth.js`, `storage.js`, `logger.js`.

## Two data planes (the main architectural risk)
1. **Legacy key-value plane**: `iapp_store(key, value jsonb)` holds whole collections (`iapp_patients`, `iapp_exams`, `iapp_prescriptions`, `iapp_visits`, `iapp_appointments`, `iapp_imaging_orders`, `iapp_imgmeta_*`, `iapp_backups`, `iapp_trash`, `iapp_audit`, `iapp_users`, `iapp_prices`, `iapp_clinic`, …). Written by the offline-first sync engine (localStorage cache + dirty keys + push).
2. **Relational core plane**: `iapp_*_core` tables (patients, visits, examinations, diagnoses, treatments, prescriptions, investigation orders, imaging studies/orders/report versions, followups) fed by DB functions/bridges (`iapp_sync_store_to_core`, `iapp_sync_*_core`, `iapp_create_*` RPCs), plus identity/appointment maps.
3. **Finance plane** (relational, separate): `iapp_fin_accounts`, `iapp_charges`, `iapp_payments`, `iapp_accounting_entries`/`_entry_lines`, share rules, settlements, allocations, reconciliations, `iapp_fin_audit`; legacy `iapp_expenses`/`iapp_recurring_expenses` tables.
Both clinical planes coexist; the same data can be written through either, with different RLS (see F-06).

## Critical flows
- **Booking (public)**: PatientApp → `iapp_booking_requests` INSERT as anon (RLS checks only length/date/status) → staff list (`staff_manage` policy) → secretary confirms → `iapp_appointments`. Slot availability from view `iapp_slots_taken` (definer; counts only).
- **Queue / waiting room**: appointment update → trigger `iapp_refresh_queue_public_cache` → `iapp_queue_public_cache` (today's rows) → view `iapp_queue_public` (invoker, today only) → `queue-display.html` (anon). Calls broadcast on Realtime channel `iapp_queue_calls`.
- **Clinical visit → exam → Rx/investigation → imaging**: UI services call RPCs (`iapp_create_clinical_visit`, `iapp_sync_examination_core`, `iapp_create_prescription_core`, `iapp_create_investigation_workflow_order`, `iapp_create_imaging_study`, …) while the legacy store is still written (dual write). Images are uploaded to Cloudinary from the browser (unsigned preset) and referenced by URL/public id (F-08).
- **Collection (secretary)**: CollectModal → `planCollection` (charge → payment → ledger entries, in minor units via `money.js`) → `commitBatch` (sync queue; admin read-back verification) ; balances from RPC `iapp_fin_collection_state` (missing in production, F-03) else legacy path.
- **Accounting (admin)**: `useFinance('full')` reads finance tables directly; explicit "financial setup" migration from legacy visits (`legacy-migration.js`, resumable by design — not re-simulated here).
- **Offline/Deploy**: SW precaches `index.html` + all hashed chunks of one build atomically; `chunk-recovery` handles stale tabs; `verify-dist` (build) and `verify-live` (post-deploy) enforce consistency; Pages deploy on push to `main`.

## CI/CD
- `ci.yml`: PRs and non-main pushes → `npm ci`, `npm test`, `test:smoke`, `test:smoke:screens`, `test:smoke:accounting` (added), `build`, `verify:dist`.
- `deploy.yml`: push to `main` / manual → test, build, verify:dist → Pages deploy → `verify-live.mjs` (12 attempts × 15 s).
