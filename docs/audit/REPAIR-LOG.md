# REPAIR LOG — branch `audit/full-repair-2026-10` (base `12dd46d`)

Commits are small and independent; none touches `main`. Each commit message carries the session trailer.

| # | Commit | Bug | Root cause | Fix | Regression test |
|---|---|---|---|---|---|
| 1 | `d1f8ba3` | F-01 Accounting screen smoke failed (2 failures) | smoke test omitted the `session` prop that production always passes; Cash/Doctors/Expenses/Setup read `session.name` | pass `session: adminSession` in `tests/smoke/screens-english.smoke.jsx` | `npm run test:smoke:screens` (120 checks) |
| 1 | `d1f8ba3` | F-02 Arabic text in English UI for recurring-expense notes | `tv()` translated whole strings only; stored note is `"<note> · <recurring note>"` | `tv()` translates each ` · ` segment (`src/modules/i18n/tv.js`); fixture corrected to the real stored shape | `tests/tv-composite.test.js` (2) |
| 1 | `d1f8ba3` | F-07 CI skipped two smoke suites | workflow listed only `test:smoke` | added `test:smoke:screens` and `test:smoke:accounting` to `ci.yml` | CI itself |
| 2 | `06f530f` | F-03 secretary silently on legacy collection when the server RPC is missing | `loadCollectionState` collapsed every RPC error into `offline:true`; `SecretaryApp` then left `finState` null | `unavailable:true` on PGRST202 / "could not find the function"; bilingual warning key `g8.collect.serverUnavailable`; permission errors are NOT reported as missing | `tests/finance-sync.test.js` (extended assertions for both cases) |
| 3 | `be372e4` | F-04 stored XSS in imaging print | raw string interpolation of stored values into HTML written with `document.write` (same-origin) | new `src/modules/print/study-print.js` (`escHTML`, `safeUrl`); `ImagingCenter` uses it | `tests/study-print.test.js` (3) |
| 3 | `be372e4` | F-13 `innerHTML` with error text in queue display | `e.message` concatenated into HTML | DOM + `textContent` in `public/queue-display.html` | covered by review only (no DOM test harness for this static page) |
| 4 | `fa58588` | F-14 high advisory in `source-map-js` | transitive build-time dep at 1.2.1 | lockfile-only bump to 1.2.2 | `npm audit` (high → none), build + `verify:dist` green |
| 5 | `2fa783b` | F-19 file numbers re-issued after delete/merge | max(current list)+1 | monotonic floor `code-floor.js`, wired in addP/delP/mergePatients, kept by PHI purge | `tests/patient-code-floor.test.js` (5) |
| 5 | `2fa783b` | F-18 lost update on blob keys | unconditional upsert | NOT fixed (needs server CAS); documented + `todo` test | `tests/sync-lost-update.test.js` (todo) |

| 6 | (this commit) | F-05 topic 3: public broadcast channel + TV voice leaked full names | `broadcastCall` sent `patient: a.patient`; the TV said the full name through Google TTS | `src/modules/realtime/mask-name.js` (same rule as TV displayName / SQL `iapp_mask_name`) used in `call-channel.js` and in the TV relay; online (Google) voice says the queue number only, device voice the first name | `tests/mask-name.test.js` (6) |

Tests: 774 on baseline → 791 now (790 pass, 1 `todo` known limitation, 0 fail). Smoke suites: 3, all green.

## Deliberately NOT changed (and why)
- `deploy.yml`: adding steps changes the production release path; propose adding the same two smoke steps after review.
- `react-router` advisories: fix is the v7 major line (rule 11).
- Clinical RLS, `iapp_store` policies, queue-cache policy, grants, finance hardening: need production SQL → proposals only (DATABASE-AND-MIGRATION-REVIEW.md).
- Cloudinary signed uploads, anonymous booking rate limiting: need new server-side components.
- Service Worker minor items (F-16): no confirmed user-visible defect; kept to avoid destabilizing the recent stale-chunk fix.

## F-03 accounting hardening — APPLIED to production (2026-10-11, by the owner in the SQL editor)
- Script: `docs/sql/accounting-hardening-apply.sql` (guarded single transaction). A second run aborts with `ABORT G0` by design (proof it is applied).
- Verified read-only afterwards: all 17 `iapp_fin_*` functions match the locally tested v2 set (combined md5 identical to the PG16 test DB); guards are SECURITY DEFINER;
  `iapp_fin_collection_state` executable by `authenticated` only (not `anon`); unique index `iapp_entries_source_ref_uq` and trigger `iapp_fin_audit_guard_trg` present;
  secretary policies are INSERT-only (4), no SELECT policy; pre-change snapshot `iapp_fin_hardening_pre_20261011` (23 rows, no anon access).
- Row counts untouched: 32 charges, 23 payments, 61 entries. Rollback: `accounting-hardening-rollback.sql`.
- NOT verified: a real secretary session on the live site (no network / no secretary credentials here).

## F-06 iapp_store role boundary — READY, NOT APPLIED (2026-10-12)
- Finding (read-only, production): `iapp_store` had two policies (`staff_read`, `staff_write`) giving ANY staff account — including the 3 secretary accounts — read/write on every key: exams, prescriptions, imaging orders/metadata, injections, the rolling full backups (`iapp_backups`), users, clinic settings. Roles on the server: 1 admin, 3 secretary (no doctor account). The clinical `*_core` tables are already admin/doctor-only in production.
- Fix: `docs/sql/store-role-rls.sql` (+ `-rollback.sql`): admin everything; secretary read+write only `iapp_appointments, iapp_patients, iapp_prices, iapp_visits, iapp_audit, iapp_trash`, read-only `iapp_users, iapp_doctors, iapp_clinic`; every other/future key default-deny. Guarded single transaction (3 s lock timeout, G0 exact-policy check, private snapshot of old policies, G1).
- Key list verified from the secretary client code (SecretaryApp, sync wiring, finance store, staff login). Client companion: the daily auto-backup now runs for admin sessions only (`UnifiedRouter.jsx`).
- Tested on PostgreSQL 16 with the production policies replicated: `docs/sql/tests/store-role-rls.{setup,assertions}.sql` (secretary RW/RO/denied keys incl. upsert `ON CONFLICT`, admin, unknown user, anon, snapshot privacy), second apply aborts at G0, rollback restores the two original policies.
- Residual (not fixed): `iapp_trash` (deleted records of any kind) stays readable and `iapp_audit` rewritable by a secretary because they are whole-array blobs; needs per-record tables or append-only RPCs. A secretary device that previously cached clinical data keeps that local cache.
- NOT verified: a real secretary session on the live site after applying.
