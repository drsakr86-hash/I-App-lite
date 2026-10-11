-- Rollback of queue-public-today-only.sql. Safe to run more than once. Not applied to production.
-- There is NO hardcoded lower bound: history is restored from public.iapp_queue_public_cache_bak_20261011,
-- the private table created by the apply script from exactly the rows it deleted.
-- Aborts (changes nothing) if that backup table does not exist.
-- Part 2 alone (without Part 1) is fine if you only need the data back: the today-only policy keeps past days hidden.
-- After you are sure no rollback is needed, drop the backup:  drop table public.iapp_queue_public_cache_bak_20261011;
begin;
set local lock_timeout = '5s';

do $$
begin
  if to_regclass('public.iapp_queue_public_cache_bak_20261011') is null then
    raise exception 'ABORT: backup table public.iapp_queue_public_cache_bak_20261011 not found. Nothing was changed.';
  end if;
end $$;

-- Part 1: old (open) policy
drop policy if exists public_read_queue_cache_today on public.iapp_queue_public_cache;
drop policy if exists public_read_queue_cache on public.iapp_queue_public_cache;
create policy public_read_queue_cache on public.iapp_queue_public_cache
  for select to anon, authenticated using (true);

-- Part 2: history, byte-for-byte from the backup
insert into public.iapp_queue_public_cache
select * from public.iapp_queue_public_cache_bak_20261011
on conflict (id) do nothing;

do $$
declare missing int;
begin
  select count(*) into missing from public.iapp_queue_public_cache_bak_20261011 b
  where not exists (select 1 from public.iapp_queue_public_cache c where c.id = b.id);
  if missing > 0 then raise exception 'ABORT: % backed-up row(s) not restored. Nothing was changed.', missing; end if;
end $$;
commit;
