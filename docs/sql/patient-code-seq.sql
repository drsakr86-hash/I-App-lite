-- patient-code-seq.sql  (audit F-19b) — server-side patient file number counter. NOT APPLIED until the owner approves.
-- Today every device computes "highest local number + 1", so two devices (or one device offline) can issue the same P-00NN.
-- Adds: a one-row counter table (private, RLS on, no API grants) seeded from the highest number in iapp_patients_core, and the RPC
--   iapp_next_patient_code(p_floor int) -> text   e.g. 'P-0065'
-- which atomically sets counter = greatest(counter, p_floor) + 1 and returns it (p_floor = highest number the calling device has seen, so the
-- counter can never fall behind a device that created patients offline). Staff only (iapp_is_staff()). Gaps are possible (a number issued but
-- the patient never saved) — acceptable; duplicates are not.
-- The client asks the RPC when online (3 s timeout) and falls back to the old local rule otherwise / until this SQL exists.
-- Impact: 1 new table (1 row), 1 new function; no existing table, policy or row is touched. Safety: one transaction, 3 s lock timeout,
-- G0 (absent) / G1 (present, counter >= current max). Rollback: patient-code-seq-rollback.sql.
begin;
set local lock_timeout = '3s';
do $$ begin
  if to_regclass('public.iapp_patient_code_counter') is not null or to_regprocedure('public.iapp_next_patient_code(integer)') is not null then
    raise exception 'ABORT G0: counter/function already exists. Nothing was changed.';
  end if;
  if to_regprocedure('public.iapp_is_staff()') is null then raise exception 'ABORT G0: iapp_is_staff() missing. Nothing was changed.'; end if;
end $$;

create table public.iapp_patient_code_counter (id boolean primary key default true check (id), last_no int not null check (last_no >= 0));
alter table public.iapp_patient_code_counter enable row level security;   -- no policy + no grants: only the SECURITY DEFINER function touches it
revoke all on public.iapp_patient_code_counter from public, anon, authenticated;
do $$ begin if exists (select 1 from pg_roles where rolname='service_role') then execute 'revoke all on public.iapp_patient_code_counter from service_role'; end if; end $$;

insert into public.iapp_patient_code_counter (last_no)
  select coalesce(max((substring(patient_code from '^P-(\d+)'))::int), 0) from public.iapp_patients_core;

create or replace function public.iapp_next_patient_code(p_floor int default 0) returns text
language plpgsql security definer set search_path = public as $$
declare v int;
begin
  if not public.iapp_is_staff() then raise exception 'not allowed' using errcode = '42501'; end if;
  update public.iapp_patient_code_counter set last_no = greatest(last_no, coalesce(p_floor, 0)) + 1 returning last_no into v;
  return 'P-' || lpad(v::text, 4, '0');
end $$;
revoke all on function public.iapp_next_patient_code(int) from public, anon;
grant execute on function public.iapp_next_patient_code(int) to authenticated;

do $$ begin
  if (select count(*) from public.iapp_patient_code_counter) <> 1
     or (select last_no from public.iapp_patient_code_counter) < coalesce((select max((substring(patient_code from '^P-(\d+)'))::int) from public.iapp_patients_core), 0)
     or to_regprocedure('public.iapp_next_patient_code(integer)') is null then
    raise exception 'ABORT G1: unexpected state after change. Nothing was changed.';
  end if;
end $$;
commit;
