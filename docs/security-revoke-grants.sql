-- Least-privilege cleanup for role "authenticated". NOT EXECUTED. Review first.
-- Finding (read-only inspection, project mofdveiwlaymlabvsypu): "authenticated" holds TRUNCATE, TRIGGER and
-- REFERENCES (plus full DML) on every public table. RLS does NOT apply to TRUNCATE: anyone able to run SQL as
-- "authenticated" (a direct DB connection or any future SECURITY DEFINER/exec helper) could empty
-- iapp_patients_core, iapp_visits_core, iapp_store, ... regardless of iapp_is_staff(). The PostgREST API
-- itself never issues TRUNCATE/TRIGGER/REFERENCES, so the app does not need them.
-- Views are security_invoker=true (RLS still applies), so DML on them is not an RLS bypass, only needless.

-- Step 0: record the current state so you can restore it
-- select grantee, table_name, privilege_type from information_schema.role_table_grants
--  where table_schema='public' and grantee='authenticated' order by 2,3;

-- Step 1 (safe, recommended): remove the three privileges the app never uses
REVOKE TRUNCATE, TRIGGER, REFERENCES ON ALL TABLES IN SCHEMA public FROM authenticated;
REVOKE TRUNCATE, TRIGGER, REFERENCES ON ALL TABLES IN SCHEMA public FROM anon;

-- Step 2 (recommended): stop new tables from receiving them again (for objects created by role postgres)
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLES FROM authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLES FROM anon;

-- Step 3 (optional, after testing Step 1): views are read-only in practice, remove DML on them
REVOKE INSERT, UPDATE, DELETE ON
  public.iapp_appointment_linkage_candidates, public.iapp_clinical_workflow_status, public.iapp_core_integrity_status,
  public.iapp_core_linkage_candidates, public.iapp_delete_governance_status, public.iapp_imaging_core_summary,
  public.iapp_investigation_imaging_timeline, public.iapp_investigation_imaging_workflow, public.iapp_patient_360_core,
  public.iapp_patient_360_timeline, public.iapp_patient_file_core, public.iapp_patient_timeline_core,
  public.iapp_queue_core, public.iapp_queue_public
FROM authenticated;

-- Verify: should return 0 rows after Step 1
select grantee, table_name, privilege_type from information_schema.role_table_grants
 where table_schema='public' and grantee in ('authenticated','anon')
   and privilege_type in ('TRUNCATE','TRIGGER','REFERENCES');

-- Rollback of Step 1 (only if something unexpectedly breaks):
-- GRANT TRUNCATE, TRIGGER, REFERENCES ON ALL TABLES IN SCHEMA public TO authenticated;
