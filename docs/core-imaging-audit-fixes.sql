-- Review of 4 Core functions. NOT EXECUTED. None of them is called by the current app (see docs/REPORT.md note),
-- so applying this is not urgent; apply it before wiring imaging-report approval or delete auditing into the UI.
-- Findings (read-only inspection of project mofdveiwlaymlabvsypu):
--  * iapp_create_imaging_report_version / iapp_approve_imaging_report / iapp_audit_delete_event are SECURITY INVOKER.
--    Their tables have only a SELECT policy, so RLS (default deny) blocks the write for every user:
--      create_imaging_report_version -> INSERT blocked  -> "new row violates row-level security policy"
--      audit_delete_event            -> INSERT blocked  -> same error
--      approve_imaging_report        -> UPDATE matches 0 rows silently -> function raises the misleading
--                                       "report cannot be approved" for every report.
--  * iapp_sync_investigation_order_core fails on every call: the variable patient_code collides with the column
--    patient_code ("column reference patient_code is ambiguous", reproduced with a harmless lookup-only payload).

-- 1) Policies (least privilege): staff may create report versions / audit rows (and only as themselves);
--    only the admin (the reporting doctor) may change a report version, which includes approving it.
--    There is deliberately no DELETE policy: report versions and deletion audit rows are append-only.
CREATE POLICY iapp_imaging_report_versions_staff_insert ON public.iapp_imaging_report_versions_core
  FOR INSERT TO authenticated
  WITH CHECK (public.iapp_is_staff() AND created_by = auth.uid());

CREATE POLICY iapp_imaging_report_versions_admin_update ON public.iapp_imaging_report_versions_core
  FOR UPDATE TO authenticated
  USING (public.iapp_is_admin())
  WITH CHECK (public.iapp_is_admin());

CREATE POLICY iapp_record_deletions_staff_insert ON public.iapp_record_deletions
  FOR INSERT TO authenticated
  WITH CHECK (public.iapp_is_staff() AND deleted_by = auth.uid());

-- 2) iapp_sync_investigation_order_core: rename the colliding variable and qualify the column.
--    Behaviour is otherwise unchanged.
CREATE OR REPLACE FUNCTION public.iapp_sync_investigation_order_core(p_order jsonb)
 RETURNS jsonb LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
declare
  pid bigint;
  vid bigint;
  test jsonb;
  test_id text;
  test_name text;
  test_eye text;
  legacy_base text := coalesce(p_order->>'id', 'legacy-'||extract(epoch from clock_timestamp())::bigint::text);
  ids jsonb := '[]'::jsonb;
  one_id bigint;
  v_patient_legacy text := p_order->>'patientId';
  v_patient_code text := nullif(p_order->>'patientCode','');
begin
  if v_patient_legacy ~ '^[0-9]+$' then
    select p.id into pid from public.iapp_patients_core p where p.legacy_id = v_patient_legacy::bigint limit 1;
  end if;
  if pid is null and v_patient_code is not null then
    select p.id into pid from public.iapp_patients_core p where p.patient_code = v_patient_code limit 1;
  end if;
  if pid is null then raise exception 'patient not found for investigation order'; end if;

  if p_order->>'visitId' is not null and p_order->>'visitId' ~ '^[0-9]+$' then
    select v.id into vid from public.iapp_visits_core v where v.legacy_id = p_order->>'visitId' limit 1;
  end if;

  for test in select value from jsonb_array_elements(coalesce(p_order->'tests',p_order->'requestedTests','[]'::jsonb))
  loop
    test_id := coalesce(test->>'id', 'test');
    test_name := coalesce(test->>'name_ar',test->>'name',p_order->>'testType','Investigation');
    test_eye := coalesce(test->>'eye',p_order->>'eye','OU');

    insert into public.iapp_investigation_orders_core
      (legacy_id,patient_id,visit_id,patient_code,doctor_name,test_name,investigation_type,status,
       requested_by,clinical_note,eye,priority,order_source,ordered_at)
    values
      (legacy_base||':'||test_id,pid,vid,
       coalesce(v_patient_code,(select p.patient_code from public.iapp_patients_core p where p.id=pid)),
       nullif(p_order->>'doctor',''),test_name,coalesce(p_order->>'testType','Investigation'),
       coalesce(p_order->>'status','requested'),nullif(p_order->>'doctor',''),
       nullif(p_order->>'notes',''),test_eye,'routine','legacy_dual_write',
       coalesce(nullif(p_order->>'createdAt','')::timestamptz,now()))
    on conflict (legacy_id) do update set
      patient_id=excluded.patient_id,visit_id=excluded.visit_id,patient_code=excluded.patient_code,
      doctor_name=excluded.doctor_name,test_name=excluded.test_name,investigation_type=excluded.investigation_type,
      status=excluded.status,requested_by=excluded.requested_by,clinical_note=excluded.clinical_note,
      eye=excluded.eye,priority=excluded.priority,ordered_at=excluded.ordered_at
    returning id into one_id;

    ids := ids || jsonb_build_array(one_id);
  end loop;

  if jsonb_array_length(ids)=0 then
    insert into public.iapp_investigation_orders_core
      (legacy_id,patient_id,visit_id,patient_code,doctor_name,test_name,investigation_type,status,requested_by,clinical_note,eye,priority,order_source,ordered_at)
    values
      (legacy_base,pid,vid,
       coalesce(v_patient_code,(select p.patient_code from public.iapp_patients_core p where p.id=pid)),
       nullif(p_order->>'doctor',''),coalesce(p_order->>'testType','Investigation'),
       coalesce(p_order->>'testType','Investigation'),coalesce(p_order->>'status','requested'),
       nullif(p_order->>'doctor',''),nullif(p_order->>'notes',''),coalesce(p_order->>'eye','OU'),'routine','legacy_dual_write',
       coalesce(nullif(p_order->>'createdAt','')::timestamptz,now()))
    on conflict (legacy_id) do update set status=excluded.status,clinical_note=excluded.clinical_note,updated_at=now()
    returning id into one_id;
    ids := ids || jsonb_build_array(one_id);
  end if;

  return ids;
end;
$function$;

-- Verify after applying (read-only):
-- select polname, polcmd from pg_policy where polrelid in ('public.iapp_imaging_report_versions_core'::regclass,'public.iapp_record_deletions'::regclass);
