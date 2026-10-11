-- queue-public-today-only.sql  (NOT APPLIED to production — needs the owner's explicit approval)
-- Run ONCE in the SQL editor of project mofdveiwlaymlabvsypu (iapp-clinic).
-- TOPIC 1 of 3 ONLY: restrict ARCHIVE reads (past days). It does NOT mask today's names (topic 2)
-- and does NOT touch the broadcast channel / voice (topic 3). Alone it is NOT a complete queue-privacy fix.
--
-- One transaction, all-or-nothing. Guards:
--  G1 every stale cache row (date < today in Africa/Cairo) must have a NON-cancelled appointment with the same id,
--     the same date AND the same value in every mapped field, i.e. the row equals what a rebuild would produce;
--  G2 exactly those rows are first copied into a private backup table (RLS on, no policy, all grants revoked),
--     and every one must be present in the backup before anything is deleted;
--  G3 after the delete no stale row remains.
-- The rollback restores from the backup table (no date range, no assumption about appointments).
-- Side effect: creates ONE new table public.iapp_queue_public_cache_bak_20261011 (same data the cache already exposed, now private). Drop it after the retention period.
-- Does NOT change: grants of the cache, the view, the trigger iapp_refresh_queue_public_cache, queue-display.html.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- G1
do $$
declare n_total int; n_nomatch int; n_date int; n_field int;
begin
  select count(*) into n_total
  from public.iapp_queue_public_cache c
  where c.date < ((now() at time zone 'Africa/Cairo')::date)::text;

  select count(*) into n_nomatch
  from public.iapp_queue_public_cache c
  where c.date < ((now() at time zone 'Africa/Cairo')::date)::text
    and not exists (select 1 from public.iapp_appointments a where a.id::text = c.id and not a.cancelled);

  select count(*) into n_date
  from public.iapp_queue_public_cache c
  join public.iapp_appointments a on a.id::text = c.id and not a.cancelled
  where c.date < ((now() at time zone 'Africa/Cairo')::date)::text
    and c.date is distinct from a.date::text;

  select count(*) into n_field
  from public.iapp_queue_public_cache c
  join public.iapp_appointments a on a.id::text = c.id and not a.cancelled
  where c.date < ((now() at time zone 'Africa/Cairo')::date)::text
    and (c.patient is distinct from a.patient or c.clinic is distinct from a.clinic
      or c.doctor is distinct from a.doctor or c.wait_status is distinct from a.wait_status
      or c.time is distinct from a.time or c.arrived_at is distinct from a.arrived_at::text
      or c.called_at is distinct from a.called_at::text or c.queue_number is distinct from a.queue_number::text);

  if n_nomatch > 0 or n_date > 0 or n_field > 0 then
    raise exception 'ABORT G1: stale=% no_matching_appointment=% date_mismatch=% field_mismatch=%. Nothing was changed.',
      n_total, n_nomatch, n_date, n_field;
  end if;
end $$;

-- G2
create table if not exists public.iapp_queue_public_cache_bak_20261011
  (like public.iapp_queue_public_cache including defaults);
alter table public.iapp_queue_public_cache_bak_20261011 enable row level security;
revoke all on public.iapp_queue_public_cache_bak_20261011 from public, anon, authenticated;

insert into public.iapp_queue_public_cache_bak_20261011
select * from public.iapp_queue_public_cache c
where c.date < ((now() at time zone 'Africa/Cairo')::date)::text
  and not exists (select 1 from public.iapp_queue_public_cache_bak_20261011 b where b.id = c.id);

do $$
declare missing int;
begin
  select count(*) into missing
  from public.iapp_queue_public_cache c
  where c.date < ((now() at time zone 'Africa/Cairo')::date)::text
    and not exists (select 1 from public.iapp_queue_public_cache_bak_20261011 b where b.id = c.id);
  if missing > 0 then
    raise exception 'ABORT G2: % row(s) not backed up. Nothing was changed.', missing;
  end if;
end $$;

-- Policy: anon/authenticated may read only today's Cairo date (same predicate as view iapp_queue_public)
drop policy if exists public_read_queue_cache on public.iapp_queue_public_cache;
drop policy if exists public_read_queue_cache_today on public.iapp_queue_public_cache;
create policy public_read_queue_cache_today on public.iapp_queue_public_cache
  for select to anon, authenticated
  using (date = ((now() at time zone 'Africa/Cairo')::date)::text);

delete from public.iapp_queue_public_cache
  where date < ((now() at time zone 'Africa/Cairo')::date)::text;

-- G3
do $$
declare left_rows int;
begin
  select count(*) into left_rows from public.iapp_queue_public_cache
  where date < ((now() at time zone 'Africa/Cairo')::date)::text;
  if left_rows > 0 then
    raise exception 'ABORT G3: % stale row(s) remain. Nothing was changed.', left_rows;
  end if;
end $$;
commit;
-- AFTER: run the post-checks from docs/audit/QUEUE-POLICY-FINAL-REVIEW.md.
