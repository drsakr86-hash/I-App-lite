-- Phase 3 / Package D: Order -> Study -> Report -> Versions chain (additive; no storage migration, no auto-linking).
create table public.iapp_imaging_link_audit (
  id bigint generated always as identity primary key,
  study_id bigint not null,
  order_id bigint,
  visit_id bigint,
  linked_by text,
  note text not null,
  created_at timestamptz not null default now()
);
alter table public.iapp_imaging_link_audit enable row level security;
create policy iapp_imaging_link_audit_select on public.iapp_imaging_link_audit for select to authenticated
  using (public.iapp_has_role(array['admin','doctor']));
create or replace function public.iapp_guard_link_audit() returns trigger language plpgsql set search_path to 'public' as $$
begin raise exception 'link audit is append-only' using errcode='42501'; end $$;
create trigger trg_iapp_link_audit_append_only before update or delete on public.iapp_imaging_link_audit
  for each row execute function public.iapp_guard_link_audit();

-- Read-only report of unlinked records with SUGGESTIONS (same patient, nearest date). Nothing is changed.
create or replace function public.iapp_imaging_linkage_report()
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare r jsonb;
begin
  if not public.iapp_has_role(array['admin','doctor']) then raise exception 'admin or doctor only' using errcode='42501'; end if;
  select jsonb_build_object(
    'studies_without_order', coalesce((select jsonb_agg(jsonb_build_object('study_id', s.id, 'patient_id', s.patient_id, 'date', coalesce(s.performed_date::text, s.created_at::date::text),
        'suggested_order_ids', (select coalesce(jsonb_agg(o.id order by abs(o.ordered_at::date - coalesce(s.performed_date, s.created_at::date))), '[]'::jsonb)
           from (select o2.* from public.iapp_investigation_orders_core o2 where o2.patient_id = s.patient_id order by abs(o2.ordered_at::date - coalesce(s.performed_date, s.created_at::date)) limit 3) o)))
        from public.iapp_imaging_studies_core s where s.order_id is null), '[]'::jsonb),
    'studies_without_visit', coalesce((select jsonb_agg(jsonb_build_object('study_id', s.id, 'patient_id', s.patient_id)) from public.iapp_imaging_studies_core s where s.visit_id is null), '[]'::jsonb),
    'orders_without_visit', coalesce((select jsonb_agg(jsonb_build_object('order_id', o.id, 'patient_id', o.patient_id)) from public.iapp_investigation_orders_core o where o.visit_id is null), '[]'::jsonb),
    'orders_without_study', coalesce((select jsonb_agg(jsonb_build_object('order_id', o.id, 'patient_id', o.patient_id, 'status', o.status)) from public.iapp_investigation_orders_core o
        where not exists (select 1 from public.iapp_imaging_studies_core s where s.order_id = o.id)), '[]'::jsonb),
    'note', 'suggestions only; link manually with iapp_link_imaging_study after verification'
  ) into r;
  return r;
end $$;

-- Verified manual link: same patient only, fills EMPTY links only (never overwrites), audited.
create or replace function public.iapp_link_imaging_study(p_study_id bigint, p_order_id bigint, p_visit_id bigint, p_note text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare s public.iapp_imaging_studies_core; o public.iapp_investigation_orders_core; v public.iapp_visits_core; email text := lower(auth.jwt() ->> 'email');
begin
  if not public.iapp_has_role(array['admin','doctor']) then raise exception 'admin or doctor only' using errcode='42501'; end if;
  if length(btrim(coalesce(p_note,''))) < 5 then raise exception 'verification note is required'; end if;
  select * into s from public.iapp_imaging_studies_core where id = p_study_id for update;
  if not found then raise exception 'study not found'; end if;
  if p_order_id is not null then
    select * into o from public.iapp_investigation_orders_core where id = p_order_id;
    if not found then raise exception 'order not found'; end if;
    if o.patient_id is distinct from s.patient_id then raise exception 'order belongs to a different patient'; end if;
    if s.order_id is not null and s.order_id <> p_order_id then raise exception 'study already linked to another order'; end if;
  end if;
  if p_visit_id is not null then
    select * into v from public.iapp_visits_core where id = p_visit_id;
    if not found then raise exception 'visit not found'; end if;
    if v.patient_id is distinct from s.patient_id then raise exception 'visit belongs to a different patient'; end if;
    if s.visit_id is not null and s.visit_id <> p_visit_id then raise exception 'study already linked to another visit'; end if;
  end if;
  update public.iapp_imaging_studies_core set order_id = coalesce(order_id, p_order_id), visit_id = coalesce(visit_id, p_visit_id) where id = s.id;
  insert into public.iapp_imaging_link_audit(study_id, order_id, visit_id, linked_by, note) values (s.id, p_order_id, p_visit_id, email, btrim(p_note));
  return jsonb_build_object('study_id', s.id, 'order_id', coalesce(s.order_id, p_order_id), 'visit_id', coalesce(s.visit_id, p_visit_id));
end $$;

-- Longitudinal comparison: one patient's studies of a modality/eye in date order (read-only).
create or replace function public.iapp_imaging_history(p_patient_id bigint, p_modality text default null, p_eye text default null)
returns table(study_id bigint, performed_date date, modality text, eye text, status text, has_report boolean, report_versions integer)
language sql stable set search_path to 'public' as $$
  select s.id, coalesce(s.performed_date, s.created_at::date), s.modality, s.eye, s.status, coalesce(btrim(s.report),'') <> '',
         (select count(*)::int from public.iapp_imaging_report_versions_core v where v.imaging_study_id = s.id)
  from public.iapp_imaging_studies_core s
  where s.patient_id = p_patient_id and (p_modality is null or s.modality = p_modality) and (p_eye is null or s.eye = p_eye)
  order by 2, s.id $$;

revoke all on function public.iapp_imaging_linkage_report() from public, anon;
revoke all on function public.iapp_link_imaging_study(bigint,bigint,bigint,text) from public, anon;
revoke all on function public.iapp_imaging_history(bigint,text,text) from public, anon;
grant execute on function public.iapp_imaging_linkage_report() to authenticated;
grant execute on function public.iapp_link_imaging_study(bigint,bigint,bigint,text) to authenticated;
grant execute on function public.iapp_imaging_history(bigint,text,text) to authenticated;
