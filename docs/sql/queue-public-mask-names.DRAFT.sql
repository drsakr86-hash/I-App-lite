-- DRAFT — NOT FOR EXECUTION until the product decision in docs/audit/QUEUE-POLICY-FINAL-REVIEW.md (option M1) is taken AND the client change
-- (broadcast payload, see the review) is deployed. Tested locally only (PGlite), never run on production.
-- Goal: the public queue cache stores the SAME shortened name the TV already displays ("first name + initial of the 2nd word"), so anyone holding
-- the public key can no longer read full patient names. Parity with displayName() in public/queue-display.html is asserted by the local test.
begin;
set local lock_timeout = '5s';

create or replace function public.iapp_mask_name(p_name text) returns text
language sql immutable set search_path = public as $$
  select case
    when coalesce(array_length(w.a, 1), 0) = 0 then 'مريض'
    when array_length(w.a, 1) = 1 then w.a[1]
    else w.a[1] || ' ' || left(w.a[2], 1) || '.'
  end
  from (select array_remove(regexp_split_to_array(btrim(regexp_replace(regexp_replace(coalesce(p_name, ''), '[<>]', '', 'g'), '[،,؛;]+', ' ', 'g')), '\s+'), '') as a) w
$$;

-- the trigger function is the existing one with ONE change: patient -> public.iapp_mask_name(patient)
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
        (new.id::text,public.iapp_mask_name(new.patient),new.clinic,new.doctor,new.wait_status,new.date::text,new.time,
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

-- mask rows already in the cache (idempotent: masking a masked name returns it unchanged)
update public.iapp_queue_public_cache set patient = public.iapp_mask_name(patient);
commit;

-- ROLLBACK (full names again; run only if the TV voice needs them): recreate the function from docs/sql/queue-public-today-only.sql's
-- original body (the production definition is quoted in docs/audit/QUEUE-POLICY-FINAL-REVIEW.md) and then
--   update public.iapp_queue_public_cache c set patient = a.patient from public.iapp_appointments a where a.id::text = c.id;
