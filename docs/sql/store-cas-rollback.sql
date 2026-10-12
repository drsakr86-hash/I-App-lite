-- store-cas-rollback.sql — undoes store-cas.sql (drops RPC, trigger, trigger function, rev column). Data in value/updated_at is untouched.
-- Clients fall back to the plain upsert automatically.
begin;
set local lock_timeout = '3s';
lock table public.iapp_store in access exclusive mode;
drop trigger if exists trg_iapp_store_rev on public.iapp_store;
drop function if exists public.iapp_store_cas(text, jsonb, bigint);
drop function if exists public.iapp_store_rev_bump();
alter table public.iapp_store drop column if exists rev;
commit;
