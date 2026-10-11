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

Added tests: 5 (774 → 779 `npm test`). Smoke suites: 3 (all green).

## Deliberately NOT changed (and why)
- `deploy.yml`: adding steps changes the production release path; propose adding the same two smoke steps after review.
- `react-router` advisories: fix is the v7 major line (rule 11).
- Clinical RLS, `iapp_store` policies, queue-cache policy, grants, finance hardening: need production SQL → proposals only (DATABASE-AND-MIGRATION-REVIEW.md).
- Cloudinary signed uploads, anonymous booking rate limiting: need new server-side components.
- Service Worker minor items (F-16): no confirmed user-visible defect; kept to avoid destabilizing the recent stale-chunk fix.
