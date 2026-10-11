-- Rollback of queue-public-today-only.sql. Safe to run more than once. Not applied to production.
-- Restores from public.iapp_queue_public_cache_bak_20261011 (created by the apply script from exactly the rows it deleted). No date range.
-- All-or-nothing: any ABORT leaves the policy and the data exactly as they were.
-- Locks: same as the apply script (advisory lock, SHARE on iapp_appointments, then ACCESS EXCLUSIVE on the cache; 1 s timeout => 55P03, nothing changed).
--  R1 backup table must exist;
--  R2 DRIFT check: each backup row must still equal its appointment (exists, not cancelled, same date and fields). If an old appointment
--     was edited/deleted/cancelled since the apply, the backup is an outdated snapshot and is NOT restored silently.
--     To restore the snapshot anyway, deliberately change `allow_drift boolean := false` to `true` below;
--  R3 after the insert, every backup row must be IDENTICAL (all columns) to the cache row with its id; an id that exists with different
--     content is a conflict (content_conflict=N) and aborts, it is never counted as restored.
-- After you are sure no rollback is needed, drop the backup:  drop table public.iapp_queue_public_cache_bak_20261011;
begin;
select pg_advisory_xact_lock(hashtext('iapp_queue_public_cache_today_only'));   -- serialises with the apply script
set local lock_timeout = '1s';
lock table public.iapp_appointments in share mode;                    -- same order as the apply script and the app trigger
lock table public.iapp_queue_public_cache in access exclusive mode;
set local lock_timeout = '5s';

-- R1
do $$
begin
  if to_regclass('public.iapp_queue_public_cache_bak_20261011') is null then
    raise exception 'ABORT: backup table public.iapp_queue_public_cache_bak_20261011 not found. Nothing was changed.';
  end if;
end $$;

-- R2
do $$
declare
  allow_drift boolean := false;   -- <<EDIT ONLY FOR A DELIBERATE RESTORE OF THE OLD SNAPSHOT>>
  drift int;
begin
  select count(*) into drift
  from public.iapp_queue_public_cache_bak_20261011 b
  where not exists (
    select 1 from public.iapp_appointments a
    where a.id::text = b.id and not a.cancelled
      and a.date::text is not distinct from b.date and a.patient is not distinct from b.patient
      and a.clinic is not distinct from b.clinic and a.doctor is not distinct from b.doctor
      and a.wait_status is not distinct from b.wait_status and a.time is not distinct from b.time
      and a.arrived_at::text is not distinct from b.arrived_at and a.called_at::text is not distinct from b.called_at
      and a.queue_number::text is not distinct from b.queue_number);
  if drift > 0 and not allow_drift then
    raise exception 'ABORT drift: % backup row(s) no longer match their appointment (drift=%). The backup is outdated. Nothing was changed.', drift, drift;
  end if;
end $$;

-- Part 1: old (open) policy
drop policy if exists public_read_queue_cache_today on public.iapp_queue_public_cache;
drop policy if exists public_read_queue_cache on public.iapp_queue_public_cache;
create policy public_read_queue_cache on public.iapp_queue_public_cache
  for select to anon, authenticated using (true);

-- Part 2: history from the backup
insert into public.iapp_queue_public_cache
select * from public.iapp_queue_public_cache_bak_20261011
on conflict (id) do nothing;

-- R3
do $$
declare missing int; conflict int;
begin
  select count(*) into missing from public.iapp_queue_public_cache_bak_20261011 b
  where not exists (select 1 from public.iapp_queue_public_cache c where c.id = b.id);
  select count(*) into conflict from public.iapp_queue_public_cache_bak_20261011 b
  join public.iapp_queue_public_cache c on c.id = b.id
  where row(c.*) is distinct from row(b.*);
  if missing > 0 or conflict > 0 then
    raise exception 'ABORT R3: not restored=% content_conflict=%. Nothing was changed.', missing, conflict;
  end if;
end $$;
commit;
