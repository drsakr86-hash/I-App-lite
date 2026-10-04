-- ============================================================================
-- NOT APPLIED.  NOT TESTED.  DO NOT RUN ON PRODUCTION BEFORE REVIEW ON A BRANCH.
-- Written from READ-ONLY inspection of the live project (pg_policies, 2026-10-04).
-- Nothing in this file has been executed by Claude.
-- ============================================================================
-- Facts this file is based on (verified read-only):
--   * iapp_staff columns: email, role ('admin' | 'secretary' only), created_at.
--   * iapp_is_staff() and iapp_is_admin() exist.
--   * The *_core tables have a single policy "authenticated_full_access_<table>" (ALL) --
--     i.e. ANY authenticated user, not even iapp_is_staff(). iapp_visits / iapp_appointments /
--     iapp_store use iapp_is_staff().
--   * There is no server-side 'doctor' role.
-- Goal: clinical data readable/writable only by admin + doctor; secretary limited to
-- reception data. Because the server only knows admin/secretary, step 1 adds a 'doctor' role.
-- Rollout order: branch -> run -> test every screen as each role -> then production.
-- ============================================================================

-- 0. Inspect first (read-only)
-- select email, role from public.iapp_staff;
-- select pg_get_functiondef('public.iapp_is_staff'::regproc);

-- 1. Allow a doctor role (check constraint name may differ -- inspect before running).
-- alter table public.iapp_staff drop constraint if exists iapp_staff_role_check;
-- alter table public.iapp_staff add constraint iapp_staff_role_check check (role in ('admin','doctor','secretary'));

create or replace function public.iapp_has_role(p_roles text[]) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.iapp_staff s where lower(s.email) = lower(auth.jwt() ->> 'email') and s.role = any(p_roles));
$$;
revoke all on function public.iapp_has_role(text[]) from public, anon;
grant execute on function public.iapp_has_role(text[]) to authenticated;

-- 2. Clinical Core tables: admin + doctor only.
do $$
declare t text;
begin
  foreach t in array array[
    'iapp_examinations_core','iapp_diagnoses_core','iapp_treatments_core','iapp_prescriptions_core',
    'iapp_followups_core','iapp_investigation_orders_core','iapp_imaging_orders_core','iapp_imaging_studies_core'
  ] loop
    execute format('drop policy if exists %I on public.%I', 'authenticated_full_access_' || t, t);
    execute format($p$create policy %I on public.%I for all to authenticated
      using (public.iapp_has_role(array['admin','doctor'])) with check (public.iapp_has_role(array['admin','doctor']))$p$,
      'clinical_staff_' || t, t);
  end loop;
end $$;

-- 3. Reception data (patients, visits, appointment maps): any staff role.
do $$
declare t text;
begin
  foreach t in array array['iapp_patients_core','iapp_visits_core','iapp_patient_identity_map','iapp_appointment_patient_map','iapp_appointment_visit_core'] loop
    execute format('drop policy if exists %I on public.%I', 'authenticated_full_access_' || t, t);
    execute format($p$create policy %I on public.%I for all to authenticated
      using (public.iapp_is_staff()) with check (public.iapp_is_staff())$p$, 'staff_' || t, t);
  end loop;
end $$;

-- 4. iapp_store holds exams/prescriptions/users as JSON keys, so row-level policies cannot separate
--    them. Recommended: move iapp_exams / iapp_prescriptions / iapp_users out of iapp_store into real
--    tables with the policies above, or restrict writes to those keys with a trigger:
-- create or replace function public.iapp_store_guard() returns trigger language plpgsql security definer set search_path=public as $$
-- begin
--   if new.key in ('iapp_users') and not public.iapp_is_admin() then raise exception 'admin only'; end if;
--   if new.key in ('iapp_exams','iapp_prescriptions','iapp_injections') and not public.iapp_has_role(array['admin','doctor']) then raise exception 'doctor/admin only'; end if;
--   return new;
-- end $$;
-- (attach with: create trigger ... before insert or update on public.iapp_store for each row execute function public.iapp_store_guard();)
-- Check the real key/column names of iapp_store first.

-- 5. Defence in depth: iapp_staff should not be writable through the API at all.
-- revoke insert, update, delete on public.iapp_staff from authenticated, anon;

-- 6. Core RPCs are SECURITY INVOKER, so steps 2-3 automatically apply to them. After applying, a
--    secretary calling iapp_create_diagnosis_core must be rejected -- verify on the branch.
-- ROLLBACK: re-create the original "authenticated_full_access_<table>" policies (using true / with check true).
