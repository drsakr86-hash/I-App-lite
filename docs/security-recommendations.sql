-- UNEXECUTED RECOMMENDATIONS. Do not run blindly. Step 1 is read-only.
-- Step 1: inspect (read-only)
select schemaname, tablename, policyname, roles, cmd, qual, with_check from pg_policies where tablename like 'iapp_%' order by 2,3;
select table_name, column_name, data_type from information_schema.columns where table_name = 'iapp_staff';
select routine_name, security_type from information_schema.routines where routine_name like 'iapp\_%' escape '\';
select grantee, routine_name, privilege_type from information_schema.routine_privileges where routine_name like 'iapp\_%' escape '\' and grantee in ('anon','public');

-- Step 2 (ONLY if iapp_staff has a "role" column — verify with the query above):
-- create or replace function public.iapp_staff_role() returns text language sql stable security definer set search_path = public as
--   $$ select role from public.iapp_staff where user_id = auth.uid() $$;   -- column names ASSUMED: user_id, role
-- Then restrict clinical tables/RPCs, e.g. only admin/doctor may write examinations, prescriptions, investigation orders:
-- create policy iapp_exams_write_clinicians on public.iapp_store ... using (public.iapp_staff_role() in ('admin','doctor'));
-- (iapp_exams/iapp_prescriptions live as JSON rows in iapp_store, so per-key policies on `key` are required.)
-- Revoke execute on create/sync RPCs from anon and from secretary/employee roles as appropriate.
