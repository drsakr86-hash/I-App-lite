-- Fixes for three Core RPCs. NOT EXECUTED. Review, then run in the Supabase SQL editor.
-- Verified against the live definitions and column types (read-only inspection):
--   iapp_patients_core.legacy_id is BIGINT; iapp_visits_core / prescriptions_core legacy_id are TEXT.
--   iapp_followups_core has column followup_date (there is NO column "date").
-- Each function keeps its signature and behaviour; only the type mismatches / column name are fixed.
-- Rollback: before running, copy the current bodies (select pg_get_functiondef(oid) from pg_proc where proname in (...)) so you can restore them.

-- 1) iapp_sync_visit_core: "bigint = text" (patients_core.legacy_id = text)
CREATE OR REPLACE FUNCTION public.iapp_sync_visit_core(p_visit jsonb, p_patient_code text DEFAULT NULL::text)
 RETURNS bigint LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
declare
  v_patient_id bigint;
  v_visit_id bigint;
  v_legacy_id text;
  v_legacy_patient bigint;
  v_date date;
begin
  if p_visit is null then raise exception 'visit payload is required'; end if;
  v_legacy_id := nullif(p_visit->>'id','');
  v_legacy_patient := case when (p_visit->>'patientId') ~ '^[0-9]+$' then (p_visit->>'patientId')::bigint else null end;
  select id into v_patient_id from iapp_patients_core
    where (p_patient_code is not null and patient_code=p_patient_code)
       or (p_visit->>'patientCode') = patient_code
       or (v_legacy_patient is not null and legacy_id = v_legacy_patient)
    order by case when patient_code=coalesce(p_patient_code,'') then 0 else 1 end
    limit 1;
  if v_patient_id is null then raise exception 'patient could not be resolved'; end if;
  v_date := nullif(p_visit->>'date','')::date;
  insert into iapp_visits_core
    (legacy_id,patient_id,doctor_name,visit_date,visit_type,chief_complaint,clinical_summary,notes,status,legacy_patient_id)
  values
    (v_legacy_id,v_patient_id,p_visit->>'doctor',v_date,
     coalesce(nullif(p_visit->>'type',''),'visit'),
     p_visit->>'complaint',p_visit->>'result',p_visit->>'notes','completed',
     v_legacy_patient)
  on conflict (legacy_id) do update set
    patient_id=excluded.patient_id, doctor_name=excluded.doctor_name,
    visit_date=excluded.visit_date, visit_type=excluded.visit_type,
    chief_complaint=excluded.chief_complaint, clinical_summary=excluded.clinical_summary,
    notes=excluded.notes, status=excluded.status, legacy_patient_id=excluded.legacy_patient_id,
    updated_at=now()
  returning id into v_visit_id;
  return v_visit_id;
end $function$;

-- 2) iapp_create_followup_core: "bigint = text" and wrong column name (date -> followup_date)
CREATE OR REPLACE FUNCTION public.iapp_create_followup_core(p_patient_id bigint, p_followup_date date, p_visit_id bigint DEFAULT NULL::bigint, p_reason text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_status text DEFAULT 'planned'::text, p_doctor_name text DEFAULT NULL::text)
 RETURNS bigint LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
declare v_id bigint; v_core_patient bigint;
begin
  select id into v_core_patient from iapp_patients_core
   where id=p_patient_id or legacy_id=p_patient_id or patient_code=p_patient_id::text
   order by case when id=p_patient_id then 0 else 1 end limit 1;
  if v_core_patient is null then raise exception 'patient could not be resolved'; end if;
  select id into v_id from iapp_followups_core
   where patient_id=v_core_patient and coalesce(visit_id,0)=coalesce(p_visit_id,0)
     and followup_date=p_followup_date and coalesce(reason,'')=coalesce(p_reason,'') limit 1;
  if v_id is null then
    insert into iapp_followups_core(patient_id,visit_id,followup_date,reason,notes,status,doctor_name)
    values(v_core_patient,p_visit_id,p_followup_date,p_reason,p_notes,p_status,p_doctor_name) returning id into v_id;
  else
    update iapp_followups_core set notes=p_notes,status=p_status,doctor_name=p_doctor_name,updated_at=now() where id=v_id;
  end if;
  return v_id;
end $function$;

-- 3) iapp_create_prescription_core: "bigint = text" on the patient lookup only
CREATE OR REPLACE FUNCTION public.iapp_create_prescription_core(p_patient_id bigint, p_prescription_date date DEFAULT CURRENT_DATE, p_visit_id bigint DEFAULT NULL::bigint, p_eye text DEFAULT NULL::text, p_sph_od text DEFAULT NULL::text, p_cyl_od text DEFAULT NULL::text, p_axis_od text DEFAULT NULL::text, p_sph_os text DEFAULT NULL::text, p_cyl_os text DEFAULT NULL::text, p_axis_os text DEFAULT NULL::text, p_add_power text DEFAULT NULL::text, p_medicines jsonb DEFAULT '[]'::jsonb, p_notes text DEFAULT NULL::text, p_legacy_id text DEFAULT NULL::text, p_prescription_type text DEFAULT 'mixed'::text)
 RETURNS bigint LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
declare v_id bigint; v_patient bigint; begin
 select id into v_patient from iapp_patients_core where id=p_patient_id or legacy_id=p_patient_id
   order by case when id=p_patient_id then 0 else 1 end limit 1;
 if v_patient is null then raise exception 'patient_not_found'; end if;
 if p_visit_id is not null and not exists(select 1 from iapp_visits_core where id=p_visit_id and patient_id=v_patient) then raise exception 'visit_not_found'; end if;
 if p_legacy_id is not null then select id into v_id from iapp_prescriptions_core where legacy_id=p_legacy_id limit 1; end if;
 if v_id is not null then
  update iapp_prescriptions_core set patient_id=v_patient,visit_id=p_visit_id,prescription_date=p_prescription_date,eye=p_eye,sph_od=p_sph_od,cyl_od=p_cyl_od,axis_od=p_axis_od,sph_os=p_sph_os,cyl_os=p_cyl_os,axis_os=p_axis_os,add_power=p_add_power,medicines=coalesce(p_medicines,'[]'::jsonb),notes=p_notes,prescription_type=p_prescription_type where id=v_id;
 else
  insert into iapp_prescriptions_core(legacy_id,patient_id,visit_id,prescription_date,eye,sph_od,cyl_od,axis_od,sph_os,cyl_os,axis_os,add_power,medicines,notes,prescription_type)
  values(p_legacy_id,v_patient,p_visit_id,p_prescription_date,p_eye,p_sph_od,p_cyl_od,p_axis_od,p_sph_os,p_cyl_os,p_axis_os,p_add_power,coalesce(p_medicines,'[]'::jsonb),p_notes,p_prescription_type) returning id into v_id;
 end if; return v_id;
end $function$;

-- 4) iapp_create_clinical_bundle: wrong positional arguments when a follow-up date is given.
-- The bundle called iapp_create_followup_core(p_patient_id, v_id, p_followup_date, ...) but the real
-- signature is (p_patient_id, p_followup_date, p_visit_id, ...). The visit id (bigint) landed in the
-- date parameter, so every bundle WITH a follow-up date failed and, because the bundle is a single
-- transaction, rolled back the visit, diagnosis and treatment as well. Fixed with named arguments.
-- Requires fix 2 above (the follow-up function itself also had bugs). Everything else is unchanged.
CREATE OR REPLACE FUNCTION public.iapp_create_clinical_bundle(p_patient_id bigint, p_doctor_name text DEFAULT NULL::text, p_visit_date date DEFAULT CURRENT_DATE, p_visit_type text DEFAULT 'clinic'::text, p_chief_complaint text DEFAULT NULL::text, p_diagnosis text DEFAULT NULL::text, p_diagnosis_eye text DEFAULT NULL::text, p_treatment text DEFAULT NULL::text, p_treatment_eye text DEFAULT NULL::text, p_followup_date date DEFAULT NULL::date, p_followup_reason text DEFAULT NULL::text, p_notes text DEFAULT NULL::text)
 RETURNS jsonb LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
declare v_id bigint; d_id bigint; t_id bigint; f_id bigint;
begin
  v_id:=public.iapp_create_clinical_visit(
    p_patient_id := p_patient_id, p_appointment_id := null, p_doctor_name := p_doctor_name,
    p_visit_date := p_visit_date, p_visit_type := p_visit_type, p_chief_complaint := p_chief_complaint,
    p_clinical_summary := null, p_notes := p_notes, p_status := 'completed');
  if nullif(trim(p_diagnosis),'') is not null then
    d_id:=public.iapp_create_diagnosis_core(
      p_visit_id := v_id, p_diagnosis := p_diagnosis, p_laterality := p_diagnosis_eye,
      p_is_primary := true, p_status := 'active', p_notes := p_notes);
  end if;
  if nullif(trim(p_treatment),'') is not null then
    t_id:=public.iapp_create_treatment_core(
      p_visit_id := v_id, p_treatment := p_treatment, p_eye := p_treatment_eye,
      p_instructions := p_notes, p_notes := p_notes);
  end if;
  if p_followup_date is not null then
    f_id:=public.iapp_create_followup_core(
      p_patient_id := p_patient_id, p_followup_date := p_followup_date, p_visit_id := v_id,
      p_reason := p_followup_reason, p_notes := p_notes, p_status := 'planned', p_doctor_name := p_doctor_name);
  end if;
  return jsonb_build_object('visit_id',v_id,'diagnosis_id',d_id,'treatment_id',t_id,'followup_id',f_id);
end $function$;
