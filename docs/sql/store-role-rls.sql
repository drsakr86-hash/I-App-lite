-- store-role-rls.sql  (audit F-06) — role boundary on public.iapp_store. NOT APPLIED until the owner approves.
-- Today: policies staff_read / staff_write let ANY staff account (incl. the 3 secretary accounts) read and write EVERY key:
-- exams, prescriptions, imaging, injections, custom tests, the 5 rolling full-database backups (iapp_backups ~1.4 MB), users, clinic settings.
-- After: admin keeps everything; a secretary gets only what the secretary app uses (verified in the client code):
--   read+write : iapp_appointments, iapp_patients, iapp_prices, iapp_visits, iapp_audit, iapp_trash
--   read only  : iapp_users (login list, no passwords), iapp_doctors, iapp_clinic
--   nothing    : every other key (clinical data, backups, expenses, follow-up, imaging metadata, any future key = default deny)
-- Not changed: the *_core tables (clinical ones are already admin/doctor only in production), finance tables, queue cache.
-- Residual (documented, not fixed here): iapp_trash holds deleted records of any kind and iapp_audit is rewritten as a whole array,
-- so a secretary can still read deleted records and tamper with the audit array. Needs per-record tables / append-only RPCs.
-- Client companion change (in the same merge): the daily auto-backup runs for admin sessions only (a secretary can no longer build/write it).
-- Safety: one transaction; lock_timeout 3 s (55P03 = nothing changed); G0 refuses unless the live policies are EXACTLY the two known ones;
-- private snapshot of the old policies; G1 checks the new set. Rollback: store-role-rls-rollback.sql.
begin;
set local lock_timeout = '3s';
lock table public.iapp_store in access exclusive mode;      -- CREATE/DROP POLICY needs it anyway; held for milliseconds
set local lock_timeout = '10s';

do $$
declare n int; q1 text; q2 text;
begin
  select count(*) into n from pg_policies where schemaname='public' and tablename='iapp_store';
  select regexp_replace(qual, '\s+', '', 'g') into q1 from pg_policies where schemaname='public' and tablename='iapp_store' and policyname='staff_read' and cmd='SELECT';
  select regexp_replace(qual, '\s+', '', 'g') into q2 from pg_policies where schemaname='public' and tablename='iapp_store' and policyname='staff_write' and cmd='ALL';
  if n <> 2 or q1 is null or q2 is null or q1 <> q2
     or q1 <> regexp_replace('(iapp_is_staff() AND ((key <> ALL (ARRAY[''iapp_expenses''::text, ''iapp_recurring_expenses''::text])) OR iapp_is_admin()))', '\s+', '', 'g') then
    raise exception 'ABORT G0: iapp_store policies are not exactly the reviewed pair (found % policies). Nothing was changed.', n;
  end if;
  if to_regprocedure('public.iapp_has_role(text[])') is null or to_regprocedure('public.iapp_is_admin()') is null then
    raise exception 'ABORT G0: role helper functions missing. Nothing was changed.';
  end if;
end $$;

create table public.iapp_store_policies_pre_20261012 as
  select policyname, cmd, roles::text, qual, with_check from pg_policies where schemaname='public' and tablename='iapp_store';
alter table public.iapp_store_policies_pre_20261012 enable row level security;
revoke all on public.iapp_store_policies_pre_20261012 from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname='service_role') then execute 'revoke all on public.iapp_store_policies_pre_20261012 from service_role'; end if;
end $$;

drop policy staff_read on public.iapp_store;
drop policy staff_write on public.iapp_store;

create policy store_admin_all on public.iapp_store for all to authenticated
  using (public.iapp_is_admin()) with check (public.iapp_is_admin());

create policy store_secretary_rw on public.iapp_store for all to authenticated
  using (public.iapp_has_role(array['secretary']) and key = any (array['iapp_appointments','iapp_patients','iapp_prices','iapp_visits','iapp_audit','iapp_trash']))
  with check (public.iapp_has_role(array['secretary']) and key = any (array['iapp_appointments','iapp_patients','iapp_prices','iapp_visits','iapp_audit','iapp_trash']));

create policy store_secretary_ro on public.iapp_store for select to authenticated
  using (public.iapp_has_role(array['secretary']) and key = any (array['iapp_users','iapp_doctors','iapp_clinic']));

do $$
declare n int;
begin
  select count(*) into n from pg_policies where schemaname='public' and tablename='iapp_store' and policyname in ('store_admin_all','store_secretary_rw','store_secretary_ro');
  if n <> 3 or (select count(*) from pg_policies where schemaname='public' and tablename='iapp_store') <> 3 then
    raise exception 'ABORT G1: unexpected policy set after change. Nothing was changed.';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.iapp_store'::regclass) then raise exception 'ABORT G1: RLS is not enabled. Nothing was changed.'; end if;
end $$;
commit;
