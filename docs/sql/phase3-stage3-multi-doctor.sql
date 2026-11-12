-- Phase 3 / Stage 3: multiple doctors (additive).
-- Gap found: iapp_store had no policy for role 'doctor' -> a doctor account could not sync anything.
-- Secretary/admin policies are NOT touched. Doctor: read+write on clinical/operational keys, read-only on
-- iapp_users/iapp_doctors/iapp_clinic, NO access to expenses, backups, or any unknown key (default deny).
do $$ begin
  if (select count(*) from pg_policies where schemaname='public' and tablename='iapp_store'
      and policyname in ('store_admin_all','store_secretary_rw','store_secretary_ro')) <> 3 then
    raise exception 'ABORT G0: unexpected iapp_store policy set; nothing changed';
  end if;
end $$;

alter table public.iapp_staff add column if not exists doctor_key text;
alter table public.iapp_staff add column if not exists display_name text;

create or replace function public.iapp_current_doctor_key()
returns text language sql stable security definer set search_path to 'public' as $$
  select s.doctor_key from public.iapp_staff s
  where lower(s.email) = lower(auth.jwt() ->> 'email') and s.role = 'doctor' limit 1 $$;
revoke all on function public.iapp_current_doctor_key() from public, anon;
grant execute on function public.iapp_current_doctor_key() to authenticated;

create or replace function public.iapp_admin_set_staff(p_email text, p_role text, p_doctor_key text default null, p_display_name text default null)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_email text := lower(btrim(coalesce(p_email,''))); v_old text;
begin
  if not public.iapp_is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  if v_email = '' or position('@' in v_email) = 0 then raise exception 'invalid email'; end if;
  if p_role not in ('admin','doctor','secretary','employee') then raise exception 'invalid role'; end if;
  select role into v_old from public.iapp_staff where lower(email) = v_email;
  if v_old = 'admin' and p_role <> 'admin' and (select count(*) from public.iapp_staff where role='admin') <= 1 then
    raise exception 'cannot demote the last admin';
  end if;
  insert into public.iapp_staff(email, role, doctor_key, display_name)
  values (v_email, p_role, case when p_role='doctor' then nullif(p_doctor_key,'') end, nullif(p_display_name,''))
  on conflict (email) do update set role = excluded.role, doctor_key = excluded.doctor_key,
    display_name = coalesce(excluded.display_name, public.iapp_staff.display_name);
end $$;
revoke all on function public.iapp_admin_set_staff(text,text,text,text) from public, anon;
grant execute on function public.iapp_admin_set_staff(text,text,text,text) to authenticated;

create or replace function public.iapp_admin_remove_staff(p_email text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_email text := lower(btrim(coalesce(p_email,''))); v_role text;
begin
  if not public.iapp_is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  select role into v_role from public.iapp_staff where lower(email) = v_email;
  if v_role is null then return; end if;
  if v_role = 'admin' and (select count(*) from public.iapp_staff where role='admin') <= 1 then
    raise exception 'cannot remove the last admin';
  end if;
  delete from public.iapp_staff where lower(email) = v_email;
end $$;
revoke all on function public.iapp_admin_remove_staff(text) from public, anon;
grant execute on function public.iapp_admin_remove_staff(text) to authenticated;

drop policy if exists store_doctor_rw on public.iapp_store;
create policy store_doctor_rw on public.iapp_store for all to authenticated
  using (public.iapp_has_role(array['doctor']) and (key = any (array['iapp_appointments','iapp_patients','iapp_prices','iapp_visits','iapp_audit','iapp_trash','iapp_exams','iapp_prescriptions','iapp_injections','iapp_custom_tests','iapp_custom_drugs','iapp_followup_hidden','iapp_imaging_orders','iapp_imaging_studies','iapp_imaging','iapp_ratings']) or key like 'iapp\_imgmeta\_%'))
  with check (public.iapp_has_role(array['doctor']) and (key = any (array['iapp_appointments','iapp_patients','iapp_prices','iapp_visits','iapp_audit','iapp_trash','iapp_exams','iapp_prescriptions','iapp_injections','iapp_custom_tests','iapp_custom_drugs','iapp_followup_hidden','iapp_imaging_orders','iapp_imaging_studies','iapp_imaging','iapp_ratings']) or key like 'iapp\_imgmeta\_%'));

drop policy if exists store_doctor_ro on public.iapp_store;
create policy store_doctor_ro on public.iapp_store for select to authenticated
  using (public.iapp_has_role(array['doctor']) and key = any (array['iapp_users','iapp_doctors','iapp_clinic']));
