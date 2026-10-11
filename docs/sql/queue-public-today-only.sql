-- I-App Lite — audit F-05: the public queue cache may expose only TODAY's rows (Africa/Cairo).
-- NOT APPLIED to production (two apply attempts via the assistant were cancelled before running). Run once in the Supabase SQL editor.
-- Why: policy public_read_queue_cache was USING (true) for anon, so anyone with the public key could read patient names of past days.
-- Same predicate as view public.iapp_queue_public (security_invoker), so the waiting-room TV screen keeps working.
-- Pre-check (read-only):  select count(*) filter (where date < ((now() at time zone 'Africa/Cairo')::date)::text) as stale, count(*) as total from public.iapp_queue_public_cache;
-- Rollback: docs/sql/queue-public-today-only-rollback.sql. The deleted rows are derived copies (source of truth: iapp_appointments).
begin;
drop policy if exists public_read_queue_cache on public.iapp_queue_public_cache;
drop policy if exists public_read_queue_cache_today on public.iapp_queue_public_cache;
create policy public_read_queue_cache_today on public.iapp_queue_public_cache
  for select to anon, authenticated
  using (date = ((now() at time zone 'Africa/Cairo')::date)::text);
delete from public.iapp_queue_public_cache where date < ((now() at time zone 'Africa/Cairo')::date)::text;
commit;
-- Verify: as anon (REST or "set local role anon") rows with date < today -> 0; today's rows are returned; open queue-display.html: today's queue shows.
