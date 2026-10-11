# BASELINE — I-App Lite audit (2026-10-11)

## Repository state
- Base: `main` @ `12dd46dbd3d813769b78fd840ede6bf4c4fade18` (Merge PR #9 "price-per-clinic"), working tree clean, no stashes.
- Audit branch: `audit/full-repair-2026-10` (created from that commit). `main` was not touched. Nothing was pushed, merged or deployed.
- Environment: Node v22.22.0, npm 10.9.4 (CI uses Node 20).
- 364 tracked files, ~27k lines under `src/`. Remote branches present: accounting-*, claude/*, feat/*, fix-stale-chunks, phase-41-vite-migration, price-per-clinic, backup-before-changes.

## Checks run on the untouched baseline (real output)
| Command | Result |
|---|---|
| `npm ci` | exit 0; "3 vulnerabilities (2 moderate, 1 high)" |
| `npm test` | **774 pass / 0 fail / 0 skipped / 0 todo** |
| `npm run build` | exit 0 (main chunk 813.97 kB, Vite >500 kB warning) |
| `npm run verify:dist` | exit 0, "dist consistent: build 368f6385f3dd, 11 assets" |
| `npm run test:smoke` | pass |
| `npm run test:smoke:accounting` | pass |
| `npm run test:smoke:screens` | **FAIL — 2 failures** (see AUDIT-REPORT F-01, F-02) |
| `npm audit` | 1 high (source-map-js, build-time), 2 moderate (react-router) |

## Gaps in the baseline
- CI (`.github/workflows/ci.yml`) ran only `test`, `test:smoke`, `build`, `verify:dist`. `test:smoke:screens` and `test:smoke:accounting` were never run by CI, which is why the failing screens smoke was not noticed.
- No linter, no type checker, no browser/E2E test runner is configured (the repo has no Playwright/Cypress). "End-to-end" in this repo means unit tests + react-test-renderer smoke tests only.
- `deploy.yml` runs `npm test` but no smoke tests.

## Not verifiable from this sandbox
- Live-site check: `node scripts/verify-live.mjs https://drsakr86-hash.github.io/I-App-lite/ 1` → "fetch failed" (outbound network is allowlisted; this is an environment limit, NOT evidence about the site). **UNVERIFIED.** Run it from CI or a machine with internet access.
- Cloudinary account settings (access mode, upload preset restrictions): no access. **UNVERIFIED.**
- Supabase Auth dashboard settings other than what the advisors report: **UNVERIFIED.**

## Production database access used (read-only)
Project `mofdveiwlaymlabvsypu` ("iapp-clinic"). Only catalog/metadata was read (advisors, table list with RLS flags, `pg_policies`, function and view definitions, migration list) plus three aggregate queries (row counts, max word count and date range of `iapp_queue_public_cache`, role counts of `iapp_staff`). No patient rows, names, phones or emails were read, printed or stored. No DDL/DML was run.
