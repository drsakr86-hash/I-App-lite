-- I-App Lite — audit F-05: the public (anon) queue cache may expose only TODAY's rows (Africa/Cairo).
-- Status: NOT APPLIED to production. Reviewed + tested locally (see docs/audit/QUEUE-POLICY-FINAL-REVIEW.md). Run ONCE in the SQL editor of project mofdveiwlaymlabvsypu (iapp-clinic).
--
-- What it does (single transaction, all-or-nothing):
--   1. aborts if any stale cache row could NOT be rebuilt from public.iapp_appointments (so the delete is always reversible)
--   2. replaces the open policy `public_read_queue_cache` (USING true) with one that returns only today's rows (same predicate as view iapp_queue_public)
--   3. deletes cache rows of past days (derived copies; the rollback file rebuilds them)
-- It does NOT change: grants, the view, the trigger iapp_refresh_queue_public_cache (SECURITY DEFINER), queue-display.html, or any other table.
--
-- BEFORE (read-only, save the output): see "pre-flight" in docs/audit/QUEUE-POLICY-FINAL-REVIEW.md. Optional extra safety: in the SQL editor run
--   select * from public.iapp_queue_public_cache;   and download the result as CSV (contains patient names: keep it private, delete afterwards).
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $$
declare missing int;
begin
  select count(*) into missing
  from public.iapp_queue_public_cache c
  where c.date < ((now() at time zone 'Africa/Cairo')::date)::text
    and not exists (select 1 from public.iapp_appointments a where a.id::text = c.id and not a.cancelled);
  if missing > 0 then
    raise exception 'ABORT: % stale cache row(s) have no matching non-cancelled appointment and could not be rebuilt. Nothing was changed.', missing;
  end if;
end $$;

drop policy if exists public_read_queue_cache on public.iapp_queue_public_cache;
drop policy if exists public_read_queue_cache_today on public.iapp_queue_public_cache;
create policy public_read_queue_cache_today on public.iapp_queue_public_cache
  for select to anon, authenticated
  using (date = ((now() at time zone 'Africa/Cairo')::date)::text);

delete from public.iapp_queue_public_cache
  where date < ((now() at time zone 'Africa/Cairo')::date)::text;
commit;
-- AFTER: run the post-checks from the review document (anon must see 0 stale rows; today's queue still shows on the TV screen).
