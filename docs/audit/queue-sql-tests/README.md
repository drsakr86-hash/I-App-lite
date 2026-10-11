# Local tests for the queue-cache SQL (no production access, synthetic data)
They run the REAL files from `docs/sql/` against replicas of the production objects (`schema.sql`: table, RLS, grants, view with `security_invoker`, the trigger function verbatim). They never connect to Supabase.

## 1. Functional / negative tests: `test-queue.mjs` (+ `test-mask.mjs`) on PGlite
PGlite is deliberately NOT a dependency of the app. In a scratch folder:
```
mkdir /tmp/qtest && cd /tmp/qtest && npm init -y && npm i @electric-sql/pglite@0.3.14
cp <repo>/docs/audit/queue-sql-tests/*.mjs . && IAPP_REPO=<repo> node test-queue.mjs && IAPP_REPO=<repo> node test-mask.mjs
```
Also `test-patient-codes.mjs` (12 passed) for docs/sql/patient-code-duplicates-fix*.sql. Expected: `test-queue.mjs` 42 passed, `test-mask.mjs` 19 passed. It emulates role switching (`set role anon|authenticated|service_role`), NOT PostgREST/JWT parsing or Supabase Realtime. **PGlite is a single session: it can NOT test concurrency.**

## 2. Concurrency tests: `test-concurrency.mjs` on a REAL PostgreSQL server
Needs a throwaway local PostgreSQL (tested with 16.15; production is 17.x) and `npm i pg` in a scratch folder:
```
initdb -D $D/data -A trust -U postgres && pg_ctl -D $D/data -o "-p 54329 -k $D/sock -c listen_addresses=''" start    # as a non-root user
PGSOCK=$D/sock PGPORT=54329 IAPP_REPO=<repo> node test-concurrency.mjs
```
Expected: 5 passed (C1-C5, includes a 25-round stress). It creates and drops its own `iapp_c*` / `iapp_tpl` databases only.
