# AUDIT REPORT — I-App Lite (2026-10-11)

Scope actually covered: repo build/test/CI state, Service Worker + chunk recovery + deploy scripts, print/XSS surface, secretary collection flow, dependency advisories, and the live Supabase **catalog** (RLS policies, grants, functions, views, migrations). NOT covered in depth (no time/tooling, see "Not audited"): full per-screen UX/RTL review on devices, offline-queue conflict resolution line by line, every clinical form, Realtime reconnection behavior.

Legend: FIXED = fixed and regression-tested on the audit branch. PROPOSED = needs production SQL, not applied. OPEN = documented, not fixed. UNVERIFIED = could not be checked.

## P0
None confirmed. (Nothing found that is silently losing patient data or corrupting ledger rows in the code paths read.)

## P1
**F-03 — Hardening SQL not applied but the deployed client depends on it (finance drift).** FIXED (client warning) + PROPOSED (apply the SQL).
- Evidence: `docs/sql/accounting-hardening.sql` header says "NOT APPLIED to production"; production `list_migrations` has no accounting migrations and the function list contains no `iapp_fin_collection_state`, which `src/modules/finance/store.js` (`loadCollectionState`) calls. Production still has the v1 policy `fin_secretary_payments_read` limited to `created_at >= now() - interval '36 hours'`.
- Impact: for a secretary, `loadCollectionState` fails → `SecretaryApp` silently falls back to the legacy collection path (`finState` stays null). Those collections do not enter the finance ledger, while the admin Accounting screen reads only the ledger → revenue/receivables diverge. Also, in v1 the server overpayment guard runs with the caller's RLS rights, i.e. it only sees the last 36 h of payments (hardening finding H1) — an old payment is invisible to the check.
- Fix on branch: `loadCollectionState` returns `unavailable:true` on PGRST202; `SecretaryApp` shows an explicit bilingual warning. Test: `tests/finance-sync.test.js`. Root fix = apply the hardening SQL after review (see DATABASE-AND-MIGRATION-REVIEW.md §A).

**F-04 — Stored XSS in imaging-study print.** FIXED.
- Evidence: `src/screens/ImagingCenter.jsx` built the print HTML by string interpolation of `view.patient`, `view.report`, `view.notes`, `f.name`, `f.src` and `typeName` without escaping; `printDoc` (`src/modules/print/dom-print.js`) writes it with `document.write` into a same-origin window, so script runs with the app's origin (localStorage, Supabase session).
- Realistic chain: anonymous booking form (`iapp_booking_requests.patient_name`, 3–80 chars) → patient record → clinician prints a study.
- Fix: `src/modules/print/study-print.js` (`escHTML` on every value, `safeUrl` allows only http(s)/blob/image data URLs). Tests: `tests/study-print.test.js`. All other print templates are wrapped by `safeTemplate` (verified in `src/modules/print/index.js`).

**F-05 — Public queue cache readable by anyone with the anon key, with full patient names and old days.** PROPOSED.
- Evidence (production, read-only): policy `public_read_queue_cache` = `USING (true)` for `anon, authenticated`, anon has `SELECT` on `iapp_queue_public_cache`; 66 rows, max 5 words per `patient`, dates 2026-10-01…2026-10-10. The trigger `iapp_refresh_queue_public_cache` only inserts today's rows and deletes on UPDATE/DELETE, so past days are never purged. The view `iapp_queue_public` filters to today, but it is `security_invoker=true`, so the table is directly queryable and the view filter does not protect it. The display shortens names only in the browser (`displayName()` in `public/queue-display.html`).
- Impact: anyone can read names + clinic + doctor + visit times for the last N days from the public REST endpoint.
- Proposed fix (SQL in DATABASE-AND-MIGRATION-REVIEW §B): restrict the policy to today's Cairo date and purge old rows. Do NOT revoke table SELECT: the invoker view needs it and the TV screen would break. Residual: today's full names stay public; product decision B2 (mask server-side) documented.

**F-06 — Role boundary for clinical data is bypassed through the legacy `iapp_store` key-value table.** OPEN (needs product decision + SQL).
- Evidence: clinical core tables (`iapp_examinations_core`, `iapp_prescriptions_core`, `iapp_diagnoses_core`, `iapp_treatments_core`, `iapp_investigation_orders_core`, `iapp_imaging_*_core`, `iapp_followups_core`) are `admin`/`doctor` only, but policies `staff_read`/`staff_write` on `iapp_store` allow **any staff (including secretary)** to read/write every key except the two expense keys. Production keys include `iapp_patients`, `iapp_exams`, `iapp_prescriptions`, `iapp_imaging_orders`, `iapp_imgmeta_*`, `iapp_backups`, `iapp_trash`, `iapp_audit`, `iapp_users`. Also `iapp_visits`, `iapp_appointments`, `iapp_visits_core` are open to all staff.
- Impact: a secretary account can read/modify the same exams/prescriptions and full backups the core policies try to restrict. Today production has 1 admin + 3 secretaries and no doctor account, so this is the effective boundary.
- Not fixed: tightening `iapp_store` keys would break secretary workflows (patients, appointments, visits are legitimately needed). Needs a per-key decision (see PERMISSIONS-MATRIX).

**F-19 — Patient file numbers re-issued after deletion; 3 numbers held by 3 different patients each in production.** FIXED in code for new cases + OPEN for existing data (DATABASE-AND-MIGRATION-REVIEW §G).
- Evidence: `nextPatientCode()` (src/modules/patients/list.js) = max(current list)+1, so deleting/merging the last patients re-issued their numbers. Production catalog: P-0062/63/64 each used by 3 distinct patients, 6 of the 9 rows are patients deleted through the app (all in trash and backups); `iapp_patients_core` has no unique index on `patient_code`.
- Impact: wrong-patient risk (file number is the lookup key for `iapp_get_patient_file_by_code`, prints, and trash restore would create a second patient with the same number).
- Fix: `src/modules/patients/code-floor.js` (monotonic per-device floor, kept across sign-out), wired into add/delete/merge. Tests: `tests/patient-code-floor.test.js` (5). Not fixed: existing duplicates (data decision), two devices issuing the same number at once (needs a server sequence).

**F-18 — Concurrent saves of the same blob key can overwrite each other (lost update).** OPEN (reproduced, `todo` test; fix needs server-side compare-and-swap, §F).
- Evidence: `src/modules/sync/store-io.js` `sbSetStore` = unconditional upsert after client merge (`flush.js`); `tests/sync-lost-update.test.js`.
- Scope: keys not backed by row tables (patients, exams, prescriptions, imaging orders…). Appointments, visits and expenses use per-row tables.

## P2
**F-01 — `test:smoke:screens` failed on baseline (Accounting).** FIXED. Cause: the smoke test did not pass the `session` prop; `Cash/Doctors/Expenses/Setup` read `session.name` (production `App.jsx` always passes it). Fixture corrected.

**F-02 — Composite stored notes not translated (i18n).** FIXED. `tv()` did not translate `"<note> · <recurring note>"`, so English UI showed Arabic. `tv()` now translates each ` · ` segment. Test: `tests/tv-composite.test.js`.

**F-07 — CI did not run the screen/accounting smoke tests; deploy workflow runs no smoke tests.** CI FIXED (steps added). `deploy.yml` left unchanged on purpose (see REPAIR-LOG).

**F-08 — Unsigned Cloudinary upload preset used from the browser.** OPEN / UNVERIFIED. `src/screens/ImagingCenter.jsx` (`upload_preset "iapp_clinic"`, cloud name in source) and `use-patient-file.js` upload directly. Anyone can reuse the cloud name + preset to upload arbitrary files to the clinic's account; delivery URLs are probably unauthenticated (cannot check settings). Deleting a record cannot delete the asset (needs a signature). Recommendation: signed uploads via a Supabase Edge Function, restricted preset (format/size/folder), and authenticated delivery if the account plan supports it. Not changed (rule 11: no new storage architecture without need).

**F-09 — SECURITY DEFINER view `iapp_slots_taken` (advisor ERROR).** Reviewed: exposes only clinic/date/time/count of future bookings to anon, no names. Intentional after the staff-only RLS lockdown (anon cannot read appointments). Accepted; document only.

**F-10 — Trigger functions `iapp_fin_*_guard`, `iapp_fin_block_mutation`, `iapp_fin_entries_expand` and helpers are executable by `anon` (default PUBLIC grant); `iapp_fin_entries_expand` is SECURITY DEFINER.** PROPOSED. Trigger functions cannot be called as RPC with meaningful effect, but the grants should be revoked (`accounting-hardening.sql` already revokes the guards). `iapp_fin_charge_net/paid/period_closed` are readable helpers (aggregates by charge id) callable by anon today.

**F-11 — Leaked-password protection disabled in Supabase Auth.** OPEN (dashboard setting, advisor WARN).

**F-12 — Anonymous booking insert has only length/date checks.** OPEN. No rate limit or uniqueness (duplicate slots/spam). `public_insert` allows any number of pending requests per phone/slot. Needs an Edge Function or DB constraint/trigger; not done.

## P3
- **F-13** `queue-display.html` error path used `innerHTML` with `e.message`. FIXED (`textContent`).
- **F-14** Dependency advisories: `source-map-js` high (build-time transitive) FIXED by lockfile bump 1.2.1→1.2.2. `react-router` ≥6.0.0 <7.18.0 moderate (open redirect with backslash in `<Link>/useNavigate`, SSR hydration issue) OPEN: the fix is the v7 major line; the app navigates only to internal routes and does no SSR. Not upgraded (rule 11).
- **F-15** `queue-display.html` subscribes to `postgres_changes` on `iapp_store` as anon; RLS makes that useless for anon (it relies on polling the view). Dead code, not removed. UNVERIFIED which path actually refreshes the screen.
- **F-16** Service Worker: `pageHandler` answers every offline navigation with the cached `index.html` (also for `queue-display.html`, which then shows the main app); `assetHandler` caches any `ok` response without checking content-type (GitHub Pages returns 404 for missing files, so this is only defense-in-depth); `activate` assumes `caches.keys()` is insertion-ordered when keeping the previous shell cache. Low risk, OPEN.
- **F-17** Main bundle 814 kB (232 kB gzip). OPEN (performance, no defect).

## Service Worker / chunk-recovery review (Phase 5) — results
Read `public/sw.js`, `src/app/chunk-recovery.js`, `scripts/verify-dist.mjs`, `scripts/verify-live.mjs`, `deploy.yml`:
1. Precache is atomic (`Promise.all` + throw on any non-OK; old worker stays) — OK by code reading. Existing tests in `tests/stale-chunk-recovery.test.js` pass.
2. A missing hashed asset returns the 404 as is (never index.html) — OK by code.
3. Reload loop guard: one attempt per 120 s via sessionStorage; no storage → never reloads — OK.
4. Recovery removes service workers and `iapp-shell-*` caches only; `localStorage` (offline queue, patient cache) is untouched — OK.
5. `verify-live.mjs` checks HTML-vs-asset, `sw.js` build id vs `precache.json` vs index references — solid; **not executed against production here (UNVERIFIED)**. `deploy.yml` verifies after deploying, so a failed verification cannot roll back by itself.
6. "Fixed for all users" is NOT claimed: it depends on the live check and on CDN propagation.

## Not audited / not claimed
Per-screen UX on real Android widths, RTL print layouts, sync-engine conflict resolution line by line, Realtime reconnection, doctor/secretary field-level clinical forms (OD/OS laterality etc.), expenses/recurring-expense math, and the legacy-migration idempotency simulations (the repo has `tests/finance-*.test.js` that pass, but I did not re-derive partial-failure cases at every write boundary). These are open work, not "verified OK".
