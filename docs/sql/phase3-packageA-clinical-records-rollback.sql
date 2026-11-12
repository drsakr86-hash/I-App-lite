-- 1) restore the previous sync function
\i docs/sql/pre-phase3/iapp_sync_examination_core.before.sql
drop function if exists public.iapp_amend_examination(text,jsonb,text);
drop function if exists public.iapp_sign_examination(text);
drop trigger if exists trg_iapp_guard_exam_signed on public.iapp_examinations_core;
drop function if exists public.iapp_guard_exam_signed();
-- The versions table and new columns are kept (they hold signed clinical history). Drop only if no signed rows exist:
-- drop table public.iapp_clinical_record_versions; alter table public.iapp_examinations_core drop column findings_od, ...;
