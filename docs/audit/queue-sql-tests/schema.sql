-- Replica of the production objects used by the queue tests (read from the catalog). Shared by test-queue.mjs (PGlite) and test-concurrency.mjs (real PostgreSQL).
create role anon nologin; create role authenticated nologin; create role service_role nologin;
grant usage on schema public to anon, authenticated;
create table public.iapp_appointments (id bigint primary key, patient text, clinic text, doctor text, wait_status text, date date, time text,
  arrived_at bigint, called_at bigint, queue_number integer, cancelled boolean not null default false);
alter table public.iapp_appointments enable row level security;
create table public.iapp_queue_public_cache (id text primary key, patient text, clinic text, doctor text, wait_status text, date text, time text,
  arrived_at text, called_at text, queue_number text, updated_at timestamptz not null default now());
create index idx_iapp_queue_public_cache_date_clinic on public.iapp_queue_public_cache (date, clinic);
alter table public.iapp_queue_public_cache enable row level security;
create policy public_read_queue_cache on public.iapp_queue_public_cache for select to anon, authenticated using (true);
grant select on public.iapp_queue_public_cache to anon;
grant select, insert, update, delete on public.iapp_queue_public_cache to authenticated;
create view public.iapp_queue_public with (security_invoker = true) as
  select id, patient, clinic, doctor, wait_status, date, "time", arrived_at, called_at, queue_number
  from public.iapp_queue_public_cache where (date = (((now() at time zone 'Africa/Cairo'))::date)::text);
grant select on public.iapp_queue_public to anon, authenticated;
create or replace function public.iapp_refresh_queue_public_cache() returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare r record;
begin
  if tg_op in ('DELETE','UPDATE') then
    delete from iapp_queue_public_cache where id=old.id::text;
  end if;
  if tg_op in ('INSERT','UPDATE') then
    if new.date=(now() at time zone 'Africa/Cairo')::date and not new.cancelled then
      insert into iapp_queue_public_cache
        (id,patient,clinic,doctor,wait_status,date,time,arrived_at,called_at,queue_number,updated_at)
      values
        (new.id::text,new.patient,new.clinic,new.doctor,new.wait_status,new.date::text,new.time,
         new.arrived_at::text,new.called_at::text,new.queue_number::text,now())
      on conflict(id) do update set
        patient=excluded.patient,clinic=excluded.clinic,doctor=excluded.doctor,
        wait_status=excluded.wait_status,date=excluded.date,time=excluded.time,
        arrived_at=excluded.arrived_at,called_at=excluded.called_at,queue_number=excluded.queue_number,
        updated_at=now();
    end if;
  end if;
  return coalesce(new,old);
end;
$function$;
create trigger trg_iapp_refresh_queue_public_cache after insert or delete or update on public.iapp_appointments for each row execute function public.iapp_refresh_queue_public_cache();

