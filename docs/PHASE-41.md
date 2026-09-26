# Phase 41 — Vite/React Migration Foundation

## Implemented
- Added a real Vite build entry.
- Added package/dependency manifest for React 18 + Supabase.
- Moved the existing production React runtime behind a Vite migration bridge without rewriting clinical logic.
- Preserved the Phase 36 HTML as a rollback/reference copy.
- Created stable boundaries for app permissions, Supabase service, hooks, modules, components, and styles.
- Kept the production runtime behavior unchanged during this first migration slice.

## Deliberately NOT done
- No clinical rewrite.
- No database schema change.
- No auth/RLS change.
- No storage change.
- No deletion of the legacy runtime.

## Next extraction order
1. Supabase/auth service
2. Patient/Patient 360 module
3. Appointments/queue
4. Clinical visit/exam/prescription
5. Imaging
6. Finance/settings
7. Remove legacy runtime only after parity tests.
