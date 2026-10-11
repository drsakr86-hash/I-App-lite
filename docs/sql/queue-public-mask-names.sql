-- queue-public-mask-names.sql  (topic 2 of 3: mask TODAY's patient names in the public queue cache — option M1)
-- NOT APPLIED until the owner approves. Run once in the SQL editor of project mofdveiwlaymlabvsypu (iapp-clinic).
-- The public cache (read by anyone with the public key) will store the SAME shortened name the TV already displays:
-- first word + initial of the second word ("محمد ع."), "مريض" if empty. appointments keep the full name; staff screens are unaffected.
-- Topic 3 (public broadcast channel + TV voice) is the client change in src/modules/realtime/call-channel.js and public/queue-display.html:
-- it only takes effect once that code is merged and deployed.
-- Safety: one transaction; same lock order as queue-public-today-only.sql (advisory, SHARE on appointments, SHARE ROW EXCLUSIVE on the cache so
-- the TV can keep reading); G0 aborts unless the live trigger function is exactly the expected one (whitespace-insensitive md5) or already masked;
-- G1 aborts unless every cache row ends up masked. Rollback: queue-public-mask-names-rollback.sql.
begin;
set local lock_timeout = '5s';
select pg_advisory_xact_lock(hashtext('iapp_queue_public_cache_today_only'));
set local lock_timeout = '1s';
lock table public.iapp_appointments in share mode;
lock table public.iapp_queue_public_cache in share row exclusive mode;
set local lock_timeout = '5s';

-- G0: only replace the function we know
do $$
declare src text; n text;
begin
  select prosrc into src from pg_proc where proname = 'iapp_refresh_queue_public_cache' and pronamespace = 'public'::regnamespace;
  if src is null then raise exception 'ABORT G0: trigger function not found. Nothing was changed.'; end if;
  n := md5(regexp_replace(src, '\s+', '', 'g'));
  if src not like '%iapp_mask_name%' and n <> '5244eca89080861e6f5c0b3e805f738f' then
    raise exception 'ABORT G0: trigger function differs from the reviewed definition (md5 %). Nothing was changed.', n;
  end if;
end $$;

create or replace function public.iapp_mask_name(p_name text) returns text
language sql immutable set search_path = public as $$
  select case
    when coalesce(array_length(w.a, 1), 0) = 0 then 'مريض'
    when array_length(w.a, 1) = 1 then w.a[1]
    else w.a[1] || ' ' || left(w.a[2], 1) || '.'
  end
  from (select array_remove(regexp_split_to_array(btrim(regexp_replace(regexp_replace(coalesce(p_name, ''), '[<>]', '', 'g'), '[،,؛;]+', ' ', 'g')), '\s+'), '') as a) w
$$;
revoke all on function public.iapp_mask_name(text) from public, anon, authenticated;
grant execute on function public.iapp_mask_name(text) to postgres, service_role;

-- self-test of the function before anything depends on it
do $$
begin
  if public.iapp_mask_name('محمد علي السيد') is distinct from 'محمد ع.' or public.iapp_mask_name('') is distinct from 'مريض'
     or public.iapp_mask_name('أحمد') is distinct from 'أحمد' then
    raise exception 'ABORT: iapp_mask_name self-test failed. Nothing was changed.';
  end if;
end $$;

-- the existing trigger function with ONE change: patient -> public.iapp_mask_name(patient)
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

-- mask rows already in the cache (idempotent)
update public.iapp_queue_public_cache set patient = public.iapp_mask_name(patient)
 where patient is distinct from public.iapp_mask_name(patient);

-- G1: nothing unmasked left, trigger still attached
do $$
declare bad int; trg int;
begin
  select count(*) into bad from public.iapp_queue_public_cache where patient is distinct from public.iapp_mask_name(patient);
  select count(*) into trg from pg_trigger where tgname = 'trg_iapp_refresh_queue_public_cache' and not tgisinternal;
  if bad > 0 or trg <> 1 then raise exception 'ABORT G1: unmasked rows=% trigger count=%. Nothing was changed.', bad, trg; end if;
end $$;
commit;
