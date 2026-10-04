-- ============================================================================
-- NOT APPLIED.  NOT TESTED.  A recommendation only -- the app does NOT depend on it.
-- The front end stores these values today in exam.ophth (JSON inside iapp_exams) and mirrors
-- them as text into the existing Core columns (see src/modules/patient-file/ophth.js).
-- Live-schema fact (read-only): iapp_examinations_core has no UCVA/PH/CMT/CD/VF columns.
-- ============================================================================
-- Proposed: one row per (examination, eye) so queries by eye/metric are simple and indexable.

create table if not exists public.iapp_exam_measurements_core (
  id            bigint generated always as identity primary key,
  examination_id bigint not null,            -- FK to iapp_examinations_core(id) (check the real type first)
  eye           text   not null check (eye in ('OD','OS')),
  ucva          text, bcva text, pinhole text,
  iop_value     numeric, iop_method text,
  sph numeric, cyl numeric, axis integer,
  cup_disc      numeric check (cup_disc between 0 and 1),
  cmt_um        numeric,
  vf_md_db      numeric,
  anterior      jsonb, posterior jsonb,
  created_at    timestamptz not null default now(),
  unique (examination_id, eye)
);
alter table public.iapp_exam_measurements_core enable row level security;
-- policy: admin + doctor only (see NOT-APPLIED-role-rls.sql, iapp_has_role)
-- create policy clinical_staff_measurements on public.iapp_exam_measurements_core for all to authenticated
--   using (public.iapp_has_role(array['admin','doctor'])) with check (public.iapp_has_role(array['admin','doctor']));

-- The RPC iapp_sync_examination_core would need an extra parameter (or a new RPC) to write this table.
-- Not written here: it must be designed against the live function definition, on a branch.
-- Back-fill from exam.ophth is a one-off script to run only after review.
