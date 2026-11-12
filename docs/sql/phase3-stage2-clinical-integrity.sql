-- Phase 3 / Stage 2: clinical data integrity (additive, no table drops, no data changes).
-- 1) Block deleting a visit that has clinical children (cascade would erase exam/diagnosis/treatment).
--    Verified: no client code or RPC deletes iapp_visits_core rows; secretary workflow unaffected.
-- 2) Imaging report versions: admin/doctor write policies (RPCs were failing under RLS),
--    approved reports immutable (only approved->cancelled supersession), never deletable.

create or replace function public.iapp_guard_visit_delete()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  if exists (select 1 from public.iapp_examinations_core where visit_id = old.id)
     or exists (select 1 from public.iapp_diagnoses_core where visit_id = old.id)
     or exists (select 1 from public.iapp_treatments_core where visit_id = old.id) then
    raise exception 'visit % has clinical records and cannot be deleted', old.id using errcode = '23503';
  end if;
  return old;
end $$;

drop trigger if exists trg_iapp_guard_visit_delete on public.iapp_visits_core;
create trigger trg_iapp_guard_visit_delete before delete on public.iapp_visits_core
  for each row execute function public.iapp_guard_visit_delete();

alter table public.iapp_imaging_report_versions_core enable row level security;

drop policy if exists iapp_imaging_report_versions_clinical_insert on public.iapp_imaging_report_versions_core;
create policy iapp_imaging_report_versions_clinical_insert on public.iapp_imaging_report_versions_core
  for insert to authenticated
  with check (public.iapp_has_role(array['admin','doctor']));

drop policy if exists iapp_imaging_report_versions_clinical_update on public.iapp_imaging_report_versions_core;
create policy iapp_imaging_report_versions_clinical_update on public.iapp_imaging_report_versions_core
  for update to authenticated
  using (public.iapp_has_role(array['admin','doctor']))
  with check (public.iapp_has_role(array['admin','doctor']));

create or replace function public.iapp_guard_report_version_immutable()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'imaging report versions cannot be deleted' using errcode = '42501';
  end if;
  if old.status = 'cancelled' then
    raise exception 'cancelled report version is immutable' using errcode = '42501';
  end if;
  if old.status = 'approved' then
    if new.status <> 'cancelled'
       or new.report_text is distinct from old.report_text
       or new.version_no is distinct from old.version_no
       or new.imaging_study_id is distinct from old.imaging_study_id
       or new.created_by is distinct from old.created_by
       or new.created_at is distinct from old.created_at
       or new.approved_by is distinct from old.approved_by
       or new.approved_at is distinct from old.approved_at
       or new.metadata is distinct from old.metadata then
      raise exception 'approved report version is immutable (only supersession to cancelled allowed)' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_iapp_guard_report_version_immutable on public.iapp_imaging_report_versions_core;
create trigger trg_iapp_guard_report_version_immutable before update or delete on public.iapp_imaging_report_versions_core
  for each row execute function public.iapp_guard_report_version_immutable();
