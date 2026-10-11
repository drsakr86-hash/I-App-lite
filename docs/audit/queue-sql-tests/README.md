# Local tests for the queue-cache SQL (no production access, synthetic data)
They run the REAL files from `docs/sql/` against an in-process Postgres (PGlite) that replicates the production objects (table, RLS, grants, view with `security_invoker`, trigger function).
PGlite is deliberately NOT a dependency of the app. Run in a scratch folder:
```
mkdir /tmp/qtest && cd /tmp/qtest && npm init -y && npm i @electric-sql/pglite@0.3.14
cp <repo>/docs/audit/queue-sql-tests/*.mjs . && IAPP_REPO=<repo> node test-queue.mjs && IAPP_REPO=<repo> node test-mask.mjs
```
Expected: `test-queue.mjs` 21 passed, `test-mask.mjs` 13 passed. Limits: it emulates PostgreSQL role switching (`set role anon|authenticated`), not PostgREST/JWT parsing or Supabase Realtime.
