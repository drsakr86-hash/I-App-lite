-- patient-code-unique-index.sql  (audit F-19c) — OPTIONAL, apply only AFTER patient-code-seq.sql has been live for a while. NOT APPLIED.
-- A unique index makes any duplicate P-code impossible, but a device that issued a number OFFLINE (local fallback) and later syncs a number
-- already used would get a sync error on that patient row instead of a silent duplicate. With the server counter this is rare.
-- Run OUTSIDE a transaction block (CONCURRENTLY). It fails by itself if duplicates exist (nothing is changed then).
-- Check first (must return no rows):
--   select patient_code, count(*) from public.iapp_patients_core group by 1 having count(*) > 1;
create unique index concurrently if not exists iapp_patients_core_code_uq on public.iapp_patients_core (patient_code);
-- rollback: drop index concurrently if exists public.iapp_patients_core_code_uq;
