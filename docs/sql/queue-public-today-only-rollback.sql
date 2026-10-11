-- Rollback of queue-public-today-only.sql (restores the old open read policy; deleted stale rows are not restored: they are derived from iapp_appointments).
begin;
drop policy if exists public_read_queue_cache_today on public.iapp_queue_public_cache;
drop policy if exists public_read_queue_cache on public.iapp_queue_public_cache;
create policy public_read_queue_cache on public.iapp_queue_public_cache for select to anon, authenticated using (true);
commit;
