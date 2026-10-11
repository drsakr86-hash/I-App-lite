-- queue-public-today-only.sql  (NOT APPLIED to production — needs the owner's explicit approval)
-- Run ONCE in the SQL editor of project mofdveiwlaymlabvsypu (iapp-clinic).
-- TOPIC 1 of 3 ONLY: restrict ARCHIVE reads (past days). It does NOT mask today's names (topic 2)
-- and does NOT touch the broadcast channel / voice (topic 3). Alone it is NOT a complete queue-privacy fix.
--
-- One transaction, all-or-nothing. Guards:
--  G1 every stale cache row (date < today in Africa/Cairo) must have a NON-cancelled appointment with the same id,
--     the same date AND the same value in every mapped field, i.e. the row equals what a rebuild would produce;
--  G2 exactly those rows are first copied into a private backup table (RLS on, no policy, all grants revoked);
--     a pre-existing backup is never trusted by id: any content difference (G2a) or leftover rows from an earlier run (G2b)
--     abort; before any delete every stale row must have a backup row identical in ALL columns (G2c); no API role (anon, authenticated,
--     service_role, authenticator) may hold any privilege on the backup (G2d);
--  G3 after the delete no stale row remains (so nothing was deleted without a verified backup, and nothing new slipped in).
-- Concurrency design (analysis + real-PostgreSQL tests: QUEUE-POLICY-FINAL-REVIEW.md, section 3):
--  L0 transaction advisory lock: serialises only runs of THESE two scripts.
--  L1 SHARE lock on iapp_appointments, then ACCESS EXCLUSIVE on iapp_queue_public_cache, in the SAME order the app trigger uses
--     (write appointment, then write cache) => no lock cycle with any app transaction. Every check, the backup copy, the policy change and
--     the delete then run on frozen data. Held for the script's run time only (milliseconds for ~100 rows). While held: saving/editing
--     appointments and the TV's cache reads wait; nothing fails. If an in-flight transaction does not finish within lock_timeout=1s the script
--     gives up with SQLSTATE 55P03 and changes nothing (reception waits at most that second, then continues).
--  Defence in depth that does not rely on the locks: the DELETE only removes rows proven identical to their backup row and G3 aborts if any
--  stale row is left.
-- The rollback restores from the backup table (no date range, no assumption about appointments).
-- Side effect: creates ONE new table public.iapp_queue_public_cache_bak_20261011 (same data the cache already exposed, now private). Drop it after the retention period.
-- Does NOT change: grants of the cache, the view, the trigger iapp_refresh_queue_public_cache, queue-display.html.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- L0 + L1: serialise our own scripts, then take the two table locks in the app's own order (appointments, then cache)
select pg_advisory_xact_lock(hashtext('iapp_queue_public_cache_today_only'));
set local lock_timeout = '1s';
lock table public.iapp_appointments in share mode;            -- blocks writers of appointments (readers unaffected)
lock table public.iapp_queue_public_cache in access exclusive mode;   -- required anyway by CREATE/DROP POLICY
set local lock_timeout = '5s';

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

-- G2: private backup. The table is created if absent; if it already exists (earlier run) it is NEVER trusted by id alone.
create table if not exists public.iapp_queue_public_cache_bak_20261011
  (like public.iapp_queue_public_cache including defaults);
alter table public.iapp_queue_public_cache_bak_20261011 enable row level security;
revoke all on public.iapp_queue_public_cache_bak_20261011 from public;
do $$
declare r text;
begin
  foreach r in array array['anon','authenticated','service_role','authenticator'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on table public.iapp_queue_public_cache_bak_20261011 from %I', r);
      if has_table_privilege(r, 'public.iapp_queue_public_cache_bak_20261011', 'select,insert,update,delete,truncate,references,trigger') then
        raise exception 'ABORT G2d: role % still has a privilege on the backup table. Nothing was changed.', r;
      end if;
    end if;
  end loop;
end $$;

-- G2a/G2b: an existing backup must agree with the rows about to be deleted
do $$
declare n_stale int; n_conflict int; n_leftover int;
begin
  select count(*) into n_stale from public.iapp_queue_public_cache c
  where c.date < ((now() at time zone 'Africa/Cairo')::date)::text;

  -- same id, any column (including updated_at) different => the old backup is not a copy of what we are about to delete
  select count(*) into n_conflict
  from public.iapp_queue_public_cache c
  join public.iapp_queue_public_cache_bak_20261011 b on b.id = c.id
  where c.date < ((now() at time zone 'Africa/Cairo')::date)::text
    and row(b.*) is distinct from row(c.*);
  if n_conflict > 0 then
    raise exception 'ABORT G2a: % existing backup row(s) differ from the current stale row(s) (content_conflict=%). Rename the old backup table and rerun. Nothing was changed.', n_conflict, n_conflict;
  end if;

  -- a backup holding rows that are not part of this run would be silently reused by the rollback
  select count(*) into n_leftover
  from public.iapp_queue_public_cache_bak_20261011 b
  where n_stale > 0
    and not exists (select 1 from public.iapp_queue_public_cache c
                    where c.id = b.id and c.date < ((now() at time zone 'Africa/Cairo')::date)::text);
  if n_leftover > 0 then
    raise exception 'ABORT G2b: backup table holds % row(s) from an earlier run that are not in the current stale set (leftover=%). Rename the old backup table and rerun. Nothing was changed.', n_leftover, n_leftover;
  end if;
end $$;

insert into public.iapp_queue_public_cache_bak_20261011
select * from public.iapp_queue_public_cache c
where c.date < ((now() at time zone 'Africa/Cairo')::date)::text
  and not exists (select 1 from public.iapp_queue_public_cache_bak_20261011 b where b.id = c.id);

-- G2c: every stale row must now have a backup row with IDENTICAL content (all columns), not just the same id
do $$
declare not_identical int;
begin
  select count(*) into not_identical
  from public.iapp_queue_public_cache c
  where c.date < ((now() at time zone 'Africa/Cairo')::date)::text
    and not exists (select 1 from public.iapp_queue_public_cache_bak_20261011 b
                    where b.id = c.id and row(b.*) is not distinct from row(c.*));
  if not_identical > 0 then
    raise exception 'ABORT G2c: % stale row(s) have no identical backup row (not_identical=%). Nothing was changed.', not_identical, not_identical;
  end if;
end $$;

-- Policy: anon/authenticated may read only today's Cairo date (same predicate as view iapp_queue_public)
drop policy if exists public_read_queue_cache on public.iapp_queue_public_cache;
drop policy if exists public_read_queue_cache_today on public.iapp_queue_public_cache;
create policy public_read_queue_cache_today on public.iapp_queue_public_cache
  for select to anon, authenticated
  using (date = ((now() at time zone 'Africa/Cairo')::date)::text);

-- delete ONLY rows that are byte-identical to their backup row (a row written after the checks is left alone, and G3 then aborts)
delete from public.iapp_queue_public_cache c
  using public.iapp_queue_public_cache_bak_20261011 b
  where b.id = c.id and row(b.*) is not distinct from row(c.*)
    and c.date < ((now() at time zone 'Africa/Cairo')::date)::text;

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
