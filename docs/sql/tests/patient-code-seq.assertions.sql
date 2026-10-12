-- Assertions for patient-code-seq.sql. Run after harness + a replica iapp_patients_core + the script.
create or replace function pg_temp.as_user(email text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claims', case when email is null then '' else json_build_object('email', email)::text end, false); execute 'set role ' || case when email is null then 'anon' else 'authenticated' end; end $$;
do $$ declare a text; b text; c text; n int;
begin
  if (select last_no from public.iapp_patient_code_counter) <> 64 then raise exception 'seed must be 64 (max of P-0064, P-0062-D1...)'; end if;
  perform pg_temp.as_user('sec@x.com');
  a := public.iapp_next_patient_code(0); b := public.iapp_next_patient_code(0);
  if a <> 'P-0065' or b <> 'P-0066' then raise exception 'sequence wrong: % %', a, b; end if;
  c := public.iapp_next_patient_code(100);                 -- a device that is ahead pulls the counter up
  if c <> 'P-0101' then raise exception 'floor not honoured: %', c; end if;
  c := public.iapp_next_patient_code(5);                   -- a device that is behind never lowers it
  if c <> 'P-0102' then raise exception 'counter went backwards: %', c; end if;
  reset role; perform set_config('request.jwt.claims','',false);
  -- anon / unknown user cannot call; nobody can read the counter table
  begin perform pg_temp.as_user(null); perform public.iapp_next_patient_code(0); raise exception 'anon allowed'; exception when insufficient_privilege then reset role; end;
  begin perform pg_temp.as_user('sec@x.com'); perform 1 from public.iapp_patient_code_counter; raise exception 'counter readable'; exception when insufficient_privilege then reset role; end;
  begin perform pg_temp.as_user('stranger@x.com'); perform public.iapp_next_patient_code(0); raise exception 'non-staff allowed'; exception when insufficient_privilege then reset role; end;
end $$;
select 'PATIENT-CODE-SEQ ASSERTIONS OK' as result;
