-- patient-code-seq-rollback.sql — removes the counter and the RPC (clients fall back to the local rule). Patients are untouched.
begin;
set local lock_timeout = '3s';
drop function if exists public.iapp_next_patient_code(int);
drop table if exists public.iapp_patient_code_counter;
commit;
