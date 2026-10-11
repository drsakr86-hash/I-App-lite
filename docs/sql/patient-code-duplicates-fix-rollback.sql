-- Rollback of patient-code-duplicates-fix.sql: gives the 6 deleted patients their old (duplicated) codes back, in iapp_patients_core and in the trash records.
-- Uses the same row mapping as the fix (does NOT overwrite the whole trash blob, so deletions made since are kept). Not applied.
begin;
set local lock_timeout = '2s';
select pg_advisory_xact_lock(hashtext('iapp_patient_code_duplicates_fix'));
lock table public.iapp_patients_core in share row exclusive mode;
select 1 from public.iapp_store where key = 'iapp_trash' for update;
set local lock_timeout = '5s';

create temp table _fix(core_id bigint, legacy_id bigint, old_code text, new_code text) on commit drop;
insert into _fix values
  (445, 1790449049635, 'P-0062', 'P-0062-D1'), (597, 1790455811522, 'P-0062', 'P-0062-D2'),
  (444, 1790451671674, 'P-0063', 'P-0063-D1'), (673, 1790456281540, 'P-0063', 'P-0063-D2'),
  (443, 1790454401665, 'P-0064', 'P-0064-D1'), (712, 1790456943739, 'P-0064', 'P-0064-D2');

update public.iapp_patients_core c set patient_code = f.old_code from _fix f where c.id = f.core_id and c.patient_code = f.new_code;
update public.iapp_store s set updated_at = now(), value = (
  select jsonb_agg(
    case when e->>'storeKey' = 'iapp_patients' and f.legacy_id is not null
         then jsonb_set(e, '{record,patientCode}', to_jsonb(f.old_code))
         else e end
    order by t.ord)
  from jsonb_array_elements(s.value) with ordinality t(e, ord)
  left join _fix f on e->>'storeKey' = 'iapp_patients' and e->'record'->>'id' = f.legacy_id::text and e->'record'->>'patientCode' = f.new_code)
where s.key = 'iapp_trash';
-- drop the backups when no longer needed: drop table public.iapp_patients_core_codefix_bak_20261011, public.iapp_store_trash_codefix_bak_20261011;
commit;
