# RELEASE READINESS — audit branch `audit/full-repair-2026-10`

## Decision
**The branch is safe to review and merge by a human** (only code/test/doc changes, no schema or workflow behavior change besides CI steps). **The production system is NOT declared fully production-ready**: open blockers below need production SQL or product decisions that require your approval. Nothing was merged, pushed or deployed.

## Passed (on branch HEAD, real runs)
- `npm ci` ok · `npm test` 791 tests: 790 pass, 1 known-limitation `todo`, 0 fail · `test:smoke` ok · `test:smoke:screens` ok (120 checks) · `test:smoke:accounting` ok · `npm run build` ok · `npm run verify:dist` ok (build ec677955430e) · `npm audit`: 2 moderate (react-router) remain, high cleared.
- Production catalog: RLS on all tables; anon limited to booking INSERT + queue/slots reads; finance v1 unique indexes and append-only triggers present.

## Blockers / open items (priority order)
0. **F-19** DONE in production (2026-10-11): the 6 deleted patients that shared P-0062/63/64 now carry archive codes `…-D1/-D2` (active patients keep theirs); private backups + rollback script exist. Still open: a server-side sequence / unique index (two devices can still issue the same number at once).
1. **F-03** Apply finance hardening (needs backup, branch test, approval) — until then secretaries collect through the legacy path and the ledger can diverge from real collections; the app now warns when this happens.
2. **F-05** Queue privacy — DONE in production: (1) archive reads closed + history removed (backup table kept, private), (2) today's names masked in the public cache (M1). (3) broadcast channel + TV voice: code ready on this branch (`mask-name.js`, `call-channel.js`, `queue-display.html`) but only takes effect after YOU merge and deploy it; until then the old client still broadcasts full names and the old TV script says the masked name.
3. **F-06** Secretary can read/write clinical data and backups through `iapp_store` (product decision D).
4. **F-08** Unsigned Cloudinary upload preset; image access mode unknown (UNVERIFIED).
5. **F-18** Concurrent saves of the same blob key can lose a record — FIXED IN CODE + SQL (store-cas.sql), awaiting approval to apply. **F-12** Anonymous booking has no rate limit/uniqueness.
6. **F-11** Leaked-password protection off (dashboard toggle).
7. **Live site verification UNVERIFIED** — run `node scripts/verify-live.mjs https://drsakr86-hash.github.io/I-App-lite/ 3` from a machine with internet (read-only GETs), or let the deploy workflow run it after approval.
8. No E2E tests exist; 15 acceptance scenarios not executed end-to-end (WORKFLOW-ACCEPTANCE.md).
9. Not audited in depth: device UX/RTL/print, sync conflict resolution, Realtime reconnection, legacy-migration partial-failure simulations, clinical form field-level review.

## Exact steps after your approval (none executed)
- Review/merge: `git diff main...audit/full-repair-2026-10` then open a PR (CI now runs the extra smoke suites). Deploy happens only when you merge to `main` via the existing workflow, which runs `verify-live.mjs`.
- Production SQL: follow DATABASE-AND-MIGRATION-REVIEW.md §A–C with backup → branch test → apply → verify → rollback script ready.

## Working tree
Branch `audit/full-repair-2026-10`, 4 code commits + 1 docs commit on top of `12dd46d`; `main` unchanged; no secrets or patient data in the diff (the production queries returned only aggregates/metadata).
