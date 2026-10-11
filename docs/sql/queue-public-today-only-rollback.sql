-- Rollback of queue-public-today-only.sql — restores BOTH the old policy and the deleted history. Safe to run more than once.
-- Part 1 restores the old (open) policy. Part 2 rebuilds past-day cache rows from public.iapp_appointments with the same mapping as the trigger
-- iapp_refresh_queue_public_cache. Verified in production before the change: the 66 stale rows were identical to this rebuild (66/66), and the number of
-- non-cancelled appointments since 2026-10-01 equals the number of cache rows (no extra rows would appear).
-- Adjust the date on the line marked <<LOWER BOUND>> to the earliest date that existed before the change (the pre-flight query prints it).
-- Part 2 alone (without Part 1) is also fine if you only need the data back: the new policy keeps past days hidden from anon.
begin;
set local lock_timeout = '5s';

-- Part 1: old policy
drop policy if exists public_read_queue_cache_today on public.iapp_queue_public_cache;
drop policy if exists public_read_queue_cache on public.iapp_queue_public_cache;
create policy public_read_queue_cache on public.iapp_queue_public_cache for select to anon, authenticated using (true);

-- Part 2: history
insert into public.iapp_queue_public_cache (id, patient, clinic, doctor, wait_status, date, time, arrived_at, called_at, queue_number, updated_at)
select a.id::text, a.patient, a.clinic, a.doctor, a.wait_status, a.date::text, a.time, a.arrived_at::text, a.called_at::text, a.queue_number::text, now()
from public.iapp_appointments a
where not a.cancelled
  and a.date >= date '2026-10-01'                                  -- <<LOWER BOUND>>
  and a.date <  (now() at time zone 'Africa/Cairo')::date
on conflict (id) do nothing;
commit;
