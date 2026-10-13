# BASELINE — I-App Lite (2026-10-13)

Phase A only. No application logic was changed. The previous baseline (2026-10-11) is kept as `BASELINE-2026-10-11.md`.

## 1. Verified repository state
| Item | Value | Status |
|---|---|---|
| Repository | https://github.com/drsakr86-hash/i-app-lite (public) | PASS |
| Branch audited | `main` | PASS |
| HEAD | `6ee876e9603e0a12ffc39da390c4de3d85e96b43` (2026-10-13, "Merge fix/followups-expire…") | PASS |
| Working tree | clean before and after all commands | PASS |
| Audit branch | `audit/baseline-2026-10-13` (local only) | PASS |
| Clone | shallow (`--depth 1`, then `fetch --depth=40`) | limitation |
| Push access | read-only; nothing can be pushed from this session | BLOCKED |
| Environment | Node v22.22.0, npm 10.9.4 (CI uses Node 20) | note |

Earlier audits already exist in `docs/audit/` and `docs/*.md` (2026-10-11 and 2026-10-12). This baseline re-verifies against the current HEAD instead of trusting them.

## 2. Architecture (from source)
- Vite 6 + React 18 + react-router-dom 6 single-page app, ES modules, no TypeScript, no linter, no E2E runner. Entry: `index.html` → `src/main.jsx`; router `src/app/UnifiedRouter.jsx`; screens in `src/screens/`.
- Backend: Supabase only (`@supabase/supabase-js`), client in `src/services/supabase.js`. Public queue screen `public/queue-display.html`. Service worker `public/sw.js`. Deploy: GitHub Pages.
- Two data models side by side: legacy key-value blobs in `iapp_store` (and legacy row tables such as `iapp_appointments`) plus newer `*_core` tables and a finance domain (`src/modules/finance/`). Sync layer in `src/modules/sync/` (queue, CAS flush, row-table mappers).
- ~416 tracked files; `src/modules` 139 files. 84 test files under `tests/`, 3 render-smoke files under `tests/smoke/`.
- SQL is not executed by the app: `docs/sql/*.sql` with rollbacks and PG-tested assertions in `docs/sql/tests/`. Several are marked NOT APPLIED.
- CI (`ci.yml`, non-main pushes and PRs): `npm ci`, `test`, 3 smoke suites, `build`, `verify:dist`. `deploy.yml` (main): `npm ci`, `test`, `build`, `verify:dist`, then `verify-live.mjs`; it does not run the smoke suites.

## 3. Commands executed and results (all run in this session)
| Command | Result |
|---|---|
| `npm ci` | exit 0; reports 2 moderate vulnerabilities |
| `npm test` | **PASS** — 805 tests, 805 pass, 0 fail, 0 skipped, 0 todo (~95 s) |
| `npm run test:smoke` | **PASS** ("smoke: all passed") |
| `npm run test:smoke:screens` | **PASS** (120 checks) |
| `npm run test:smoke:accounting` | **PASS** |
| `npm run build` | **PASS** — exit 0; main chunk 817.83 kB (234 kB gzip), Vite >500 kB warning |
| `npm run verify:dist` | **PASS** — "dist consistent: build a20b6464e4cd, 11 assets" |
| `npm audit` | exit 1 — 2 moderate: `react-router` / `react-router-dom` (range 6.0.0–7.17.0), direct dependency |

**Baseline failures: none** in tests or build. Lint and type check: **NOT TESTED** (not configured). Browser/E2E: **NOT TESTED** (no runner). Live site (`verify-live.mjs`): **NOT TESTED** (sandbox network allowlist; not evidence about the site).

## 4. Limitations
- No Supabase or production database inspection was done in this phase. Every database statement below comes from repo SQL and earlier audit docs, so it is **UNVERIFIED** against production until queried read-only.
- No Cloudinary account or Supabase Auth dashboard access.
- Concurrency, offline sync and real RLS behaviour are covered only by repo tests (PG16 harness in `docs/audit/queue-sql-tests` and `docs/sql/tests`); they were **not re-run** here.

## 5. Top ten risks
Labels: CONFIRMED = seen in current source or executed output. UNVERIFIED = depends on the production database or settings.

1. **Empty appointment date reaches the database as NULL — CONFIRMED in source.** `appointmentToRow` writes `date: a.date || null` (`src/modules/appointments/appointment.mapper.js`). Both `AptForm` and `SecretaryAptForm` use `<input type="date">`, so the date can be cleared to `''`. Neither `aptSaveOutcome` nor `secretaryAptError` checks the date, and `hasSchedulingConflict` even treats a missing date as today. `aptUpsert` only logs a warning, and `aptMutate` then reports the failure as `error: 'offline'`. This is the path to `null value in column "date" of relation "iapp_appointments"`. No existing test covers an empty date through `appointmentToRow`. The NOT NULL constraint itself is **UNVERIFIED** (taken from the reported error). Not fixed in this phase.
2. **Write failures are reported as "offline" — CONFIRMED in source.** `aptMutate` maps any failed upsert or delete to `error: 'offline'`, hiding real database errors from the user (Phase B false-success/false-failure review).
3. **`iapp_store` role boundary not applied — OPEN per `REPAIR-LOG.md`.** `store-role-rls.sql` is written and PG16-tested but recorded as NOT APPLIED, so secretary accounts may still read exams, prescriptions, imaging and backups through the legacy table. **UNVERIFIED** in production.
4. **Accounting fresh-start SQL pending.** `accounting-reset.sql` is destructive (backed up) and recorded NOT APPLIED. Do not run it without explicit approval, backup verification and a branch rehearsal. **UNVERIFIED**.
5. **Unsigned Cloudinary upload preset in browser code — CONFIRMED in source** (`ImagingCenter.jsx`, `use-patient-file.js`; cloud name and preset in source). Anyone with those values can upload; delivery access mode is **UNVERIFIED**.
6. **Two parallel data models (legacy blobs and Core tables).** Duplicate business logic and sync paths remain, with a documented history of cross-patient and duplicate-record risks. Not yet traced end to end (Phase B).
7. **`react-router` moderate advisories — CONFIRMED** by `npm audit`. The fix is the v7 major line; exposure looks low (no SSR, internal links only) but is not yet assessed.
8. **Service worker fallback behaviour — low risk.** `pageHandler` (`public/sw.js`) serves the cached `index.html` when a navigation fails or takes more than 4 s; `assetHandler` caches any OK response. A comment says the queue display goes through `otherHandler` (network first), but the routing was not read, so whether the queue page can receive the app shell is **UNVERIFIED**. Not runtime-tested.
9. **Deploy workflow skips the three smoke suites** that CI runs, so a merge to `main` is gated by fewer checks than a PR — CONFIRMED in `deploy.yml`.
10. **No linter, type checker or end-to-end tests — CONFIRMED.** Most workflow claims rest on unit and render-smoke tests only.

Also noted: a Supabase publishable key and project URL are hard-coded as fallbacks in `src/services/supabase.js`. That key is public by design, so this is not a secret leak, but access safety then depends entirely on RLS, which is **UNVERIFIED** here.

## 6. Next steps (not done yet)
- Phase B: add a failing regression test for risk 1, then fix validation and error reporting on an isolated branch.
- Read-only production catalog checks (`iapp_appointments.date` nullability, applied-or-not status of the SQL above), only with explicit approval.
- Push access is needed to publish the branch; none of this is merged or deployed.
