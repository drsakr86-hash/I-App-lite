-- Phase 3 / Package A: independent OD/OS findings, draft/signed states, author metadata, version history.
-- Additive: existing rows keep status NULL (= legacy, never auto-signed, no invented author).

alter table public.iapp_examinations_core
  add column if not exists findings_od jsonb,
  add column if not exists findings_os jsonb,
  add column if not exists findings_schema text,
  add column if not exists status text,
  add column if not exists version_no integer not null default 1,
  add column if not exists author_email text,
  add column if not exists author_doctor_key text,
  add column if not exists signed_by text,
  add column if not exists signed_by_doctor_key text,
  add column if not exists signed_at timestamptz;
alter table public.iapp_examinations_core drop constraint if exists iapp_examinations_core_status_check;
alter table public.iapp_examinations_core add constraint iapp_examinations_core_status_check
  check (status is null or status in ('draft','signed'));

create table if not exists public.iapp_clinical_record_versions (
  id bigint generated always as identity primary key,
  record_type text not null check (record_type in ('examination')),
  record_id bigint not null,
  version_no integer not null,
  status text not null,
  snapshot jsonb not null,
  reason text,
  author_email text,
  author_doctor_key text,
  created_at timestamptz not null default now(),
  unique (record_type, record_id, version_no)
);
alter table public.iapp_clinical_record_versions enable row level security;
drop policy if exists iapp_crv_select on public.iapp_clinical_record_versions;
create policy iapp_crv_select on public.iapp_clinical_record_versions for select to authenticated
  using (public.iapp_has_role(array['admin','doctor']));

create or replace function public.iapp_guard_crv_append_only() returns trigger
language plpgsql set search_path to 'public' as $$
begin raise exception 'clinical record versions are append-only' using errcode='42501'; end $$;
drop trigger if exists trg_iapp_crv_append_only on public.iapp_clinical_record_versions;
create trigger trg_iapp_crv_append_only before update or delete on public.iapp_clinical_record_versions
  for each row execute function public.iapp_guard_crv_append_only();

-- Signed examinations change only through iapp_sign_examination / iapp_amend_examination (they set iapp.exam_write).
create or replace function public.iapp_guard_exam_signed() returns trigger
language plpgsql set search_path to 'public' as $$
declare g text := coalesce(current_setting('iapp.exam_write', true), '');
begin
  if tg_op = 'DELETE' then
    if old.status = 'signed' then raise exception 'signed examination cannot be deleted' using errcode='42501'; end if;
    return old;
  end if;
  if tg_op = 'INSERT' then
    if new.status = 'signed' and g <> 'sign' then raise exception 'examination can only be signed through iapp_sign_examination' using errcode='42501'; end if;
    return new;
  end if;
  if old.status = 'signed' and g <> 'amend' then
    raise exception 'signed examination is immutable; use iapp_amend_examination' using errcode='42501';
  end if;
  if new.status = 'signed' and old.status is distinct from 'signed' and g <> 'sign' then
    raise exception 'examination can only be signed through iapp_sign_examination' using errcode='42501';
  end if;
  return new;
end $$;
drop trigger if exists trg_iapp_guard_exam_signed on public.iapp_examinations_core;
create trigger trg_iapp_guard_exam_signed before insert or update or delete on public.iapp_examinations_core
  for each row execute function public.iapp_guard_exam_signed();

create or replace function public.iapp_sign_examination(p_legacy_id text)
returns jsonb language plpgsql set search_path to 'public' as $$
declare r public.iapp_examinations_core; v_email text := lower(auth.jwt() ->> 'email'); v_key text := public.iapp_current_doctor_key();
begin
  if not public.iapp_has_role(array['admin','doctor']) then raise exception 'only a doctor or admin can sign' using errcode='42501'; end if;
  select * into r from public.iapp_examinations_core where legacy_id = p_legacy_id for update;
  if not found then raise exception 'examination not found'; end if;
  if r.status = 'signed' then raise exception 'examination already signed'; end if;
  perform set_config('iapp.exam_write', 'sign', true);
  update public.iapp_examinations_core
     set status='signed', signed_by=v_email, signed_by_doctor_key=v_key, signed_at=now(),
         author_email=coalesce(author_email, v_email), author_doctor_key=coalesce(author_doctor_key, v_key), version_no=1
   where id = r.id returning * into r;
  insert into public.iapp_clinical_record_versions(record_type,record_id,version_no,status,snapshot,reason,author_email,author_doctor_key)
  values ('examination', r.id, r.version_no, 'signed', to_jsonb(r), 'signed', v_email, v_key);
  perform set_config('iapp.exam_write', '', true);
  return jsonb_build_object('id', r.id, 'status', r.status, 'version_no', r.version_no, 'signed_at', r.signed_at, 'signed_by', r.signed_by);
end $$;

create or replace function public.iapp_amend_examination(p_legacy_id text, p_changes jsonb, p_reason text)
returns jsonb language plpgsql set search_path to 'public' as $$
declare r public.iapp_examinations_core; c jsonb := coalesce(p_changes,'{}'::jsonb); v_email text := lower(auth.jwt() ->> 'email'); v_key text := public.iapp_current_doctor_key();
begin
  if not public.iapp_has_role(array['admin','doctor']) then raise exception 'only a doctor or admin can amend' using errcode='42501'; end if;
  if length(btrim(coalesce(p_reason,''))) < 5 then raise exception 'amendment reason is required'; end if;
  select * into r from public.iapp_examinations_core where legacy_id = p_legacy_id for update;
  if not found then raise exception 'examination not found'; end if;
  if r.status is distinct from 'signed' then raise exception 'only a signed examination is amended'; end if;
  perform set_config('iapp.exam_write', 'amend', true);
  update public.iapp_examinations_core set
     visual_acuity_od = case when c ? 'visual_acuity_od' then c->>'visual_acuity_od' else visual_acuity_od end,
     visual_acuity_os = case when c ? 'visual_acuity_os' then c->>'visual_acuity_os' else visual_acuity_os end,
     iop_od = case when c ? 'iop_od' then c->>'iop_od' else iop_od end,
     iop_os = case when c ? 'iop_os' then c->>'iop_os' else iop_os end,
     anterior_segment = case when c ? 'anterior_segment' then c->>'anterior_segment' else anterior_segment end,
     posterior_segment = case when c ? 'posterior_segment' then c->>'posterior_segment' else posterior_segment end,
     color_vision = case when c ? 'color_vision' then c->>'color_vision' else color_vision end,
     contrast = case when c ? 'contrast' then c->>'contrast' else contrast end,
     cover_test = case when c ? 'cover_test' then c->>'cover_test' else cover_test end,
     notes = case when c ? 'notes' then c->>'notes' else notes end,
     diagnosis_summary = case when c ? 'diagnosis_summary' then c->>'diagnosis_summary' else diagnosis_summary end,
     treatment_plan = case when c ? 'treatment_plan' then c->>'treatment_plan' else treatment_plan end,
     followup_date = case when c ? 'followup_date' then nullif(c->>'followup_date','')::date else followup_date end,
     findings_od = case when c ? 'findings_od' then c->'findings_od' else findings_od end,
     findings_os = case when c ? 'findings_os' then c->'findings_os' else findings_os end,
     version_no = version_no + 1
   where id = r.id returning * into r;
  insert into public.iapp_clinical_record_versions(record_type,record_id,version_no,status,snapshot,reason,author_email,author_doctor_key)
  values ('examination', r.id, r.version_no, 'signed', to_jsonb(r), btrim(p_reason), v_email, v_key);
  perform set_config('iapp.exam_write', '', true);
  return jsonb_build_object('id', r.id, 'status', r.status, 'version_no', r.version_no);
end $$;

revoke all on function public.iapp_sign_examination(text) from public, anon;
revoke all on function public.iapp_amend_examination(text,jsonb,text) from public, anon;
grant execute on function public.iapp_sign_examination(text) to authenticated;
grant execute on function public.iapp_amend_examination(text,jsonb,text) to authenticated;

-- Sync RPC: same signature. Changes: (1) signed examinations are never overwritten by a sync,
-- (2) per-eye findings + author metadata are stored, (3) status 'draft' recorded for new rows only.
create or replace function public.iapp_sync_examination_core(p_exam jsonb, p_patient_code text default null::text)
returns bigint language plpgsql set search_path to 'public' as $function$
declare v_patient_id bigint; v_legacy_patient_id bigint; v_visit_id bigint; v_exam_id bigint; v_legacy_exam_id text; v_date date;
        v_status text; v_fod jsonb; v_fos jsonb; v_email text := lower(auth.jwt() ->> 'email'); v_key text := public.iapp_current_doctor_key();
begin
  if p_exam is null or jsonb_typeof(p_exam) <> 'object' then raise exception 'Invalid examination payload'; end if;
  v_legacy_patient_id := nullif((p_exam->>'patientId'),'')::bigint;
  select id into v_patient_id from public.iapp_patients_core
   where (v_legacy_patient_id is not null and legacy_id=v_legacy_patient_id) or (p_patient_code is not null and patient_code=p_patient_code)
   order by case when p_patient_code is not null and patient_code=p_patient_code then 0 else 1 end limit 1;
  if v_patient_id is null then raise exception 'Core patient not found for examination'; end if;
  v_legacy_exam_id := nullif(p_exam->>'id','');
  v_date := nullif(p_exam->>'date','')::date;
  if v_legacy_exam_id is not null then
    select id, status into v_exam_id, v_status from public.iapp_examinations_core where legacy_id=v_legacy_exam_id limit 1;
    if v_status = 'signed' then return v_exam_id; end if;   -- signed records are never overwritten by a sync
  end if;
  v_fod := case when jsonb_typeof(p_exam->'findingsOd') = 'object' then p_exam->'findingsOd' end;
  v_fos := case when jsonb_typeof(p_exam->'findingsOs') = 'object' then p_exam->'findingsOs' end;
  select id into v_visit_id from public.iapp_visits_core where legacy_id=case when v_legacy_exam_id is not null then 'exam:'||v_legacy_exam_id else null end limit 1;
  if v_visit_id is null then
    insert into public.iapp_visits_core(legacy_id,patient_id,doctor_name,visit_date,visit_type,chief_complaint,clinical_summary,notes,status,legacy_patient_id,source_type)
    values(case when v_legacy_exam_id is not null then 'exam:'||v_legacy_exam_id else null end,v_patient_id,nullif(p_exam->>'doctor',''),v_date,'examination',nullif(p_exam->>'chiefComplaint',''),nullif(p_exam->>'diagnosis',''),nullif(p_exam->>'notes',''),'completed',v_legacy_patient_id,'core_sync') returning id into v_visit_id;
  else
    update public.iapp_visits_core set doctor_name=nullif(p_exam->>'doctor',''),visit_date=v_date,visit_type='examination',chief_complaint=nullif(p_exam->>'chiefComplaint',''),clinical_summary=nullif(p_exam->>'diagnosis',''),notes=nullif(p_exam->>'notes',''),status='completed',legacy_patient_id=v_legacy_patient_id,source_type='core_sync' where id=v_visit_id;
  end if;
  if v_exam_id is null then
    insert into public.iapp_examinations_core(legacy_id,visit_id,examination_date,doctor_name,visual_acuity_od,visual_acuity_os,iop_od,iop_os,anterior_segment,posterior_segment,color_vision,contrast,cover_test,refraction_od,refraction_os,notes,diagnosis_summary,treatment_plan,followup_date,findings_od,findings_os,findings_schema,status,author_email,author_doctor_key)
    values(v_legacy_exam_id,v_visit_id,v_date,nullif(p_exam->>'doctor',''),nullif(p_exam->>'visualAcuityR',''),nullif(p_exam->>'visualAcuityL',''),nullif(p_exam->>'iopR',''),nullif(p_exam->>'iopL',''),nullif(p_exam->>'anteriorSegment',''),nullif(p_exam->>'posteriorSegment',''),nullif(p_exam->>'colorVision',''),nullif(p_exam->>'contrast',''),nullif(p_exam->>'coverTest',''),'{}'::jsonb,'{}'::jsonb,nullif(p_exam->>'notes',''),nullif(p_exam->>'diagnosis',''),nullif(p_exam->>'treatmentPlan',''),nullif(p_exam->>'followUp','')::date,v_fod,v_fos,case when v_fod is not null or v_fos is not null then 'ophth-eye-v1' end,'draft',v_email,v_key)
    returning id into v_exam_id;
  else
    update public.iapp_examinations_core set visit_id=v_visit_id,examination_date=v_date,doctor_name=nullif(p_exam->>'doctor',''),visual_acuity_od=nullif(p_exam->>'visualAcuityR',''),visual_acuity_os=nullif(p_exam->>'visualAcuityL',''),iop_od=nullif(p_exam->>'iopR',''),iop_os=nullif(p_exam->>'iopL',''),anterior_segment=nullif(p_exam->>'anteriorSegment',''),posterior_segment=nullif(p_exam->>'posteriorSegment',''),color_vision=nullif(p_exam->>'colorVision',''),contrast=nullif(p_exam->>'contrast',''),cover_test=nullif(p_exam->>'coverTest',''),notes=nullif(p_exam->>'notes',''),diagnosis_summary=nullif(p_exam->>'diagnosis',''),treatment_plan=nullif(p_exam->>'treatmentPlan',''),followup_date=nullif(p_exam->>'followUp','')::date,
      findings_od=coalesce(v_fod, findings_od), findings_os=coalesce(v_fos, findings_os),
      findings_schema=coalesce(case when v_fod is not null or v_fos is not null then 'ophth-eye-v1' end, findings_schema),
      status=coalesce(status,'draft'), author_email=coalesce(author_email, v_email), author_doctor_key=coalesce(author_doctor_key, v_key)
    where id=v_exam_id;
  end if;
  return v_exam_id;
end; $function$;
