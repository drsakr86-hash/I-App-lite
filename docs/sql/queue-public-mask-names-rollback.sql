-- Rollback of queue-public-mask-names.sql: restores the reviewed (unmasked) trigger function and puts the full names back into TODAY's cache rows.
-- Full names become publicly readable again through the cache. Not applied. Same lock order as the other queue scripts.
begin;
set local lock_timeout = '5s';
select pg_advisory_xact_lock(hashtext('iapp_queue_public_cache_today_only'));
set local lock_timeout = '1s';
lock table public.iapp_appointments in share mode;
lock table public.iapp_queue_public_cache in share row exclusive mode;
set local lock_timeout = '5s';

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

update public.iapp_queue_public_cache c set patient = a.patient
  from public.iapp_appointments a
 where a.id::text = c.id and not a.cancelled and c.patient is distinct from a.patient;

do $$
declare src text;
begin
  select prosrc into src from pg_proc where proname = 'iapp_refresh_queue_public_cache' and pronamespace = 'public'::regnamespace;
  if src like '%iapp_mask_name%' then raise exception 'ABORT: trigger function still masks. Nothing was changed.'; end if;
end $$;
-- public.iapp_mask_name() is left in place (harmless); drop it with: drop function public.iapp_mask_name(text);
commit;
