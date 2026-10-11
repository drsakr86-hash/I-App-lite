-- patient-code-duplicates-fix.sql  (audit F-19, data cleanup of the 3 duplicated file numbers)
-- Facts verified read-only in production (2026-10-11, aggregates/ids only, no names): P-0062, P-0063, P-0064 are each held by 3 rows of
-- iapp_patients_core. For each code exactly ONE of the 3 is the patient who is active in the app (present in iapp_store 'iapp_patients' with the
-- same patientCode, created last); the other two are patients that were DELETED through the app (they are in 'iapp_trash' with the same code,
-- and in backups). The active patient keeps the code. The 6 deleted ones get an archive code  <old>-D1 / <old>-D2  (suffix = cannot collide with
-- numbers the app issues; nextPatientCode() parses P-0062-D1 as 62, harmless). Nothing is deleted or merged; every clinical row keeps its patient_id.
-- The matching 'iapp_trash' records get the same new patientCode so that restoring from the trash cannot re-create the duplicate.
-- 'iapp_backups' (historical snapshots) is NOT touched. Dependent tables with a patient_code column hold 0 rows for these 6 patients (checked).
-- Safety: one transaction; G0 aborts unless the database is EXACTLY in the verified pre-change state; private backups of the 6 core rows and of
-- the trash blob are taken first (RLS on, all API-role privileges revoked and verified); lock order advisory -> core table -> store row, 2 s timeout.
-- Rollback: patient-code-duplicates-fix-rollback.sql.  The unique index on patient_code is NOT created here (see the review: it would turn a
-- concurrent double issue into a sync error; decide after the server-side sequence exists).
begin;
set local lock_timeout = '2s';
select pg_advisory_xact_lock(hashtext('iapp_patient_code_duplicates_fix'));
lock table public.iapp_patients_core in share row exclusive mode;      -- blocks writers of patients_core only; reads continue
select 1 from public.iapp_store where key = 'iapp_trash' for update;   -- the one blob row we edit
set local lock_timeout = '5s';

create temp table _fix(core_id bigint, legacy_id bigint, old_code text, new_code text) on commit drop;
insert into _fix values
  (445, 1790449049635, 'P-0062', 'P-0062-D1'), (597, 1790455811522, 'P-0062', 'P-0062-D2'),
  (444, 1790451671674, 'P-0063', 'P-0063-D1'), (673, 1790456281540, 'P-0063', 'P-0063-D2'),
  (443, 1790454401665, 'P-0064', 'P-0064-D1'), (712, 1790456943739, 'P-0064', 'P-0064-D2');
create temp table _keep(core_id bigint, legacy_id bigint, code text) on commit drop;
insert into _keep values (866, 1790539973831, 'P-0062'), (904, 1790540114843, 'P-0063'), (943, 1790621009597, 'P-0064');

-- G0: the exact verified pre-change state
do $$
declare bad int; dups int; n_bak_codes int;
begin
  select count(*) into bad from _fix f where not exists
    (select 1 from public.iapp_patients_core c where c.id = f.core_id and c.legacy_id = f.legacy_id and c.patient_code = f.old_code);
  if bad > 0 then raise exception 'ABORT G0a: % of the 6 patients are not in the expected state (already fixed?). Nothing was changed.', bad; end if;

  select count(*) into bad from _keep k where not exists
    (select 1 from public.iapp_patients_core c where c.id = k.core_id and c.legacy_id = k.legacy_id and c.patient_code = k.code)
    or not exists
    (select 1 from public.iapp_store s, jsonb_array_elements(s.value) e
      where s.key = 'iapp_patients' and e->>'id' = k.legacy_id::text and e->>'patientCode' = k.code);
  if bad > 0 then raise exception 'ABORT G0b: % active patient(s) no longer match core/app store. Nothing was changed.', bad; end if;

  select count(*) into bad from _fix f where exists
    (select 1 from public.iapp_store s, jsonb_array_elements(s.value) e where s.key = 'iapp_patients' and e->>'id' = f.legacy_id::text);
  if bad > 0 then raise exception 'ABORT G0c: % of the 6 patients are active in the app store (not deleted). Nothing was changed.', bad; end if;

  select count(*) into bad from _fix f where
    (select count(*) from public.iapp_store s, jsonb_array_elements(s.value) e
      where s.key = 'iapp_trash' and e->>'storeKey' = 'iapp_patients' and e->'record'->>'id' = f.legacy_id::text and e->'record'->>'patientCode' = f.old_code) < 1;
  if bad > 0 then raise exception 'ABORT G0d: % of the 6 patients have no matching trash record. Nothing was changed.', bad; end if;

  select count(*) into dups from (select patient_code from public.iapp_patients_core group by 1 having count(*) > 1) d;
  if dups <> 3 then raise exception 'ABORT G0e: expected exactly 3 duplicated codes, found %. Nothing was changed.', dups; end if;

  select count(*) into n_bak_codes from public.iapp_patients_core where patient_code in (select new_code from _fix);
  if n_bak_codes > 0 then raise exception 'ABORT G0f: archive codes already in use. Nothing was changed.'; end if;
end $$;

-- private backups (PII: same data that already lives in these tables)
create table public.iapp_patients_core_codefix_bak_20261011 (like public.iapp_patients_core including defaults);
create table public.iapp_store_trash_codefix_bak_20261011 (like public.iapp_store including defaults);
alter table public.iapp_patients_core_codefix_bak_20261011 enable row level security;
alter table public.iapp_store_trash_codefix_bak_20261011 enable row level security;
revoke all on public.iapp_patients_core_codefix_bak_20261011, public.iapp_store_trash_codefix_bak_20261011 from public;
do $$
declare r text; t text;
begin
  foreach t in array array['public.iapp_patients_core_codefix_bak_20261011', 'public.iapp_store_trash_codefix_bak_20261011'] loop
    foreach r in array array['anon','authenticated','service_role','authenticator'] loop
      if exists (select 1 from pg_roles where rolname = r) then
        execute format('revoke all on table %s from %I', t, r);
        if has_table_privilege(r, t, 'select,insert,update,delete,truncate,references,trigger') then
          raise exception 'ABORT: role % still has a privilege on %. Nothing was changed.', r, t;
        end if;
      end if;
    end loop;
  end loop;
end $$;
insert into public.iapp_patients_core_codefix_bak_20261011 select c.* from public.iapp_patients_core c where c.id in (select core_id from _fix);
insert into public.iapp_store_trash_codefix_bak_20261011 select s.* from public.iapp_store s where s.key = 'iapp_trash';
do $$
begin
  if (select count(*) from public.iapp_patients_core_codefix_bak_20261011) <> 6 or (select count(*) from public.iapp_store_trash_codefix_bak_20261011) <> 1 then
    raise exception 'ABORT: backup incomplete. Nothing was changed.';
  end if;
end $$;

create temp table _n on commit drop as select (select count(*)::int from public.iapp_patients_core) as core_before,
  -- a patient can have more than one trash record (deleted, restored, deleted again): all of them are renumbered
  (select count(*)::int from public.iapp_store s, jsonb_array_elements(s.value) e, _fix f
    where s.key = 'iapp_trash' and e->>'storeKey' = 'iapp_patients' and e->'record'->>'id' = f.legacy_id::text and e->'record'->>'patientCode' = f.old_code) as trash_match;

-- the change
update public.iapp_patients_core c set patient_code = f.new_code from _fix f where c.id = f.core_id and c.patient_code = f.old_code;

update public.iapp_store s set updated_at = now(), value = (
  select jsonb_agg(
    case when e->>'storeKey' = 'iapp_patients' and f.legacy_id is not null
         then jsonb_set(e, '{record,patientCode}', to_jsonb(f.new_code))
         else e end
    order by t.ord)
  from jsonb_array_elements(s.value) with ordinality t(e, ord)
  left join _fix f on e->>'storeKey' = 'iapp_patients' and e->'record'->>'id' = f.legacy_id::text and e->'record'->>'patientCode' = f.old_code)
where s.key = 'iapp_trash';

-- G1: verify
do $$
declare dups int; changed int; n_core int; n_trash_before int; n_trash_after int;
begin
  select count(*) into dups from (select patient_code from public.iapp_patients_core group by 1 having count(*) > 1) d;
  select count(*) into changed from _fix f join public.iapp_patients_core c on c.id = f.core_id and c.patient_code = f.new_code;
  select count(*) into n_core from public.iapp_patients_core;
  select jsonb_array_length(value) into n_trash_after from public.iapp_store where key = 'iapp_trash';
  select jsonb_array_length(value) into n_trash_before from public.iapp_store_trash_codefix_bak_20261011 where key = 'iapp_trash';
  if dups <> 0 or changed <> 6 or n_core <> (select core_before from _n) or n_trash_after <> n_trash_before then
    raise exception 'ABORT G1: dups=% renumbered=% trash_len_before=% after=%. Nothing was changed.', dups, changed, n_trash_before, n_trash_after;
  end if;
  if (select count(*) from public.iapp_store s, jsonb_array_elements(s.value) e, _fix f
       where s.key = 'iapp_trash' and e->>'storeKey' = 'iapp_patients' and e->'record'->>'id' = f.legacy_id::text and e->'record'->>'patientCode' = f.new_code) <> (select trash_match from _n) then
    raise exception 'ABORT G1: trash records not updated. Nothing was changed.';
  end if;
  -- everything else in the trash blob is identical to the backup
  if (select count(*) from (
        select e from public.iapp_store s, jsonb_array_elements(s.value) e where s.key = 'iapp_trash'
        except select e from public.iapp_store_trash_codefix_bak_20261011 b, jsonb_array_elements(b.value) e) d) <> (select count(distinct e) from public.iapp_store s, jsonb_array_elements(s.value) e, _fix f
        where s.key = 'iapp_trash' and e->>'storeKey' = 'iapp_patients' and e->'record'->>'id' = f.legacy_id::text and e->'record'->>'patientCode' = f.new_code) then
    raise exception 'ABORT G1: trash blob changed in more than the renumbered records. Nothing was changed.';
  end if;
end $$;
commit;
