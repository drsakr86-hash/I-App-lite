# RELEASE READINESS — audit branch `audit/full-repair-2026-10`

## Decision
**The branch is safe to review and merge by a human** (only code/test/doc changes, no schema or workflow behavior change besides CI steps). **The production system is NOT declared fully production-ready**: open blockers below need production SQL or product decisions that require your approval. Nothing was merged, pushed or deployed.

## Passed (on branch HEAD, real runs)
- `npm ci` ok · `npm test` 785 tests: 784 pass, 1 known-limitation `todo`, 0 fail · `test:smoke` ok · `test:smoke:screens` ok (120 checks) · `test:smoke:accounting` ok · `npm run build` ok · `npm run verify:dist` ok (build 79c5455dcb38) · `npm audit`: 2 moderate (react-router) remain, high cleared.
- Production catalog: RLS on all tables; anon limited to booking INSERT + queue/slots reads; finance v1 unique indexes and append-only triggers present.

## Blockers / open items (priority order)
0. **F-19** Three file numbers (P-0062/63/64) each belong to 3 different patients in the core tables — clinic must decide the cleanup (DATABASE-AND-MIGRATION-REVIEW §G) before a unique index can be added. New cases are prevented on a device by this branch.
1. **F-03** Apply finance hardening (needs backup, branch test, approval) — until then secretaries collect through the legacy path and the ledger can diverge from real collections; the app now warns when this happens.
2. **F-05** Public queue cache exposes full names and past days to anyone with the public key (SQL B1 ready for approval).
3. **F-06** Secretary can read/write clinical data and backups through `iapp_store` (product decision D).
4. **F-08** Unsigned Cloudinary upload preset; image access mode unknown (UNVERIFIED).
5. **F-18** Concurrent saves of the same blob key can lose a record (server CAS needed, §F). **F-12** Anonymous booking has no rate limit/uniqueness.
6. **F-11** Leaked-password protection off (dashboard toggle).
7. **Live site verification UNVERIFIED** — run `node scripts/verify-live.mjs https://drsakr86-hash.github.io/I-App-lite/ 3` from a machine with internet (read-only GETs), or let the deploy workflow run it after approval.
8. No E2E tests exist; 15 acceptance scenarios not executed end-to-end (WORKFLOW-ACCEPTANCE.md).
9. Not audited in depth: device UX/RTL/print, sync conflict resolution, Realtime reconnection, legacy-migration partial-failure simulations, clinical form field-level review.

## Exact steps after your approval (none executed)
- Review/merge: `git diff main...audit/full-repair-2026-10` then open a PR (CI now runs the extra smoke suites). Deploy happens only when you merge to `main` via the existing workflow, which runs `verify-live.mjs`.
- Production SQL: follow DATABASE-AND-MIGRATION-REVIEW.md §A–C with backup → branch test → apply → verify → rollback script ready.

## Working tree
Branch `audit/full-repair-2026-10`, 4 code commits + 1 docs commit on top of `12dd46d`; `main` unchanged; no secrets or patient data in the diff (the production queries returned only aggregates/metadata).
