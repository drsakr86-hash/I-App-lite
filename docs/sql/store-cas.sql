-- store-cas.sql  (audit F-18) — optimistic concurrency for public.iapp_store blobs. NOT APPLIED until the owner approves.
-- Problem: each synced key is one jsonb blob rewritten whole; two devices (e.g. secretary + doctor) that read, edit and upsert the same
-- key at nearly the same time silently overwrite each other (last writer wins, the other's edit is lost).
-- Fix: a revision counter. The client reads (value, rev) and writes through iapp_store_cas(key, value, rev); the write only succeeds if the
-- row still has that rev, otherwise the client re-reads, merges and retries (client change already in the branch, falls back to the plain upsert
-- while this SQL is absent, so client and SQL can be deployed in either order).
-- Impact analysis (production, 23 rows, 4 columns today): adds ONE column rev bigint NOT NULL DEFAULT 0 (constant default = metadata-only
-- in PG11+, no table rewrite), ONE BEFORE UPDATE trigger (bumps rev, sets updated_at), ONE function. Existing rows keep their data; the two
-- existing triggers (core sync, imaging sync) are untouched and keep working. RLS policies are NOT changed: the RPC is SECURITY INVOKER,
-- so admin/secretary key boundaries from store-role-rls.sql still apply. Old clients keep working (plain upsert still allowed, still bumps rev).
-- Safety: one transaction, 3 s lock timeout (55P03 = nothing changed), G0 (column/function/trigger absent), G1 (all present). Rollback: store-cas-rollback.sql.
begin;
set local lock_timeout = '3s';
lock table public.iapp_store in access exclusive mode;
set local lock_timeout = '10s';

do $$ begin
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='iapp_store' and column_name='rev')
     or to_regprocedure('public.iapp_store_cas(text,jsonb,bigint)') is not null
     or exists (select 1 from pg_trigger where tgrelid='public.iapp_store'::regclass and tgname='trg_iapp_store_rev') then
    raise exception 'ABORT G0: rev column / iapp_store_cas / trg_iapp_store_rev already exists. Nothing was changed.';
  end if;
  perform set_config('iapp.trg_n', (select count(*) from pg_trigger where tgrelid='public.iapp_store'::regclass and not tgisinternal)::text, true);
end $$;

alter table public.iapp_store add column rev bigint not null default 0;

create or replace function public.iapp_store_rev_bump() returns trigger
language plpgsql set search_path = public as $$
begin
  new.rev := coalesce(old.rev, 0) + 1;
  new.updated_at := now();
  return new;
end $$;
revoke all on function public.iapp_store_rev_bump() from public, anon, authenticated;

create trigger trg_iapp_store_rev before update on public.iapp_store
  for each row execute function public.iapp_store_rev_bump();

-- p_rev NULL  : the client saw no row -> insert only if still absent.
-- p_rev = N   : update only if the row is still at revision N.
create or replace function public.iapp_store_cas(p_key text, p_value jsonb, p_rev bigint) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare v_rev bigint;
begin
  if p_rev is null then
    insert into public.iapp_store (key, value) values (p_key, p_value)
      on conflict (key) do nothing returning rev into v_rev;
  else
    update public.iapp_store set value = p_value where key = p_key and rev = p_rev returning rev into v_rev;
  end if;
  if v_rev is null then return jsonb_build_object('ok', false, 'conflict', true); end if;
  return jsonb_build_object('ok', true, 'rev', v_rev);
end $$;
revoke all on function public.iapp_store_cas(text, jsonb, bigint) from public, anon;
grant execute on function public.iapp_store_cas(text, jsonb, bigint) to authenticated;

do $$ begin
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='iapp_store' and column_name='rev')
     or to_regprocedure('public.iapp_store_cas(text,jsonb,bigint)') is null
     or not exists (select 1 from pg_trigger where tgrelid='public.iapp_store'::regclass and tgname='trg_iapp_store_rev' and not tgisinternal)
     or (select count(*) from pg_trigger where tgrelid='public.iapp_store'::regclass and not tgisinternal) <> current_setting('iapp.trg_n')::int + 1 then
    raise exception 'ABORT G1: unexpected state after change. Nothing was changed.';
  end if;
end $$;
commit;
