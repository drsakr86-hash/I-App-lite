-- Assertions for store-cas.sql. Run AFTER harness + store-role-rls.setup + store-role-rls.sql + store-cas.sql on a throwaway DB.
create or replace function pg_temp.as_user(email text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claims', json_build_object('email', email)::text, false); execute 'set role authenticated'; end $$;
create or replace function pg_temp.back() returns void language plpgsql as $$
begin reset role; perform set_config('request.jwt.claims', '', false); end $$;
do $$
declare r jsonb; rev0 bigint; rev1 bigint; v jsonb;
begin
  -- existing rows got rev 0
  if exists (select 1 from public.iapp_store where rev <> 0) then raise exception 'existing rows must start at rev 0'; end if;
  -- anon cannot call the RPC
  begin set role anon; perform public.iapp_store_cas('iapp_patients','[]'::jsonb,0); reset role; raise exception 'anon must not execute';
  exception when insufficient_privilege then reset role; end;

  -- secretary reads (value, rev) then writes with that rev: ok, rev bumps
  perform pg_temp.as_user('sec@x.com');
  select rev into rev0 from public.iapp_store where key='iapp_patients';
  r := public.iapp_store_cas('iapp_patients', '[{"id":10}]', rev0);
  if not (r->>'ok')::boolean or (r->>'rev')::bigint <> rev0 + 1 then raise exception 'first CAS should succeed with rev+1: %', r; end if;
  -- stale second writer (same rev0) gets a conflict and the value is NOT overwritten
  r := public.iapp_store_cas('iapp_patients', '[{"id":99}]', rev0);
  if (r->>'conflict') is distinct from 'true' then raise exception 'stale CAS must conflict: %', r; end if;
  perform pg_temp.back();
  select value into v from public.iapp_store where key='iapp_patients';
  if v <> '[{"id":10}]' then raise exception 'stale write overwrote data: %', v; end if;

  -- re-read, merge, write: succeeds
  perform pg_temp.as_user('sec@x.com');
  select rev into rev1 from public.iapp_store where key='iapp_patients';
  r := public.iapp_store_cas('iapp_patients', '[{"id":10},{"id":99}]', rev1);
  if not (r->>'ok')::boolean then raise exception 'retry after merge must succeed: %', r; end if;

end $$;

-- RLS still enforced through the RPC (SECURITY INVOKER)
do $$
declare r jsonb; ok boolean := false;
begin
  perform pg_temp.as_user('sec@x.com');
  -- a key outside the secretary list: 0 rows match -> conflict (no data change, no leak)
  r := public.iapp_store_cas('iapp_exams', '[{"hack":1}]', 0);
  perform pg_temp.back();
  if (r->>'conflict') is distinct from 'true' then raise exception 'secretary must not write iapp_exams via CAS: %', r; end if;
  if (select value from public.iapp_store where key='iapp_exams') <> '[{"id":1}]' then raise exception 'iapp_exams changed'; end if;
  -- admin can
  perform pg_temp.as_user('admin@x.com');
  r := public.iapp_store_cas('iapp_exams', '[{"id":2}]', 0);
  perform pg_temp.back();
  if not (r->>'ok')::boolean then raise exception 'admin CAS on iapp_exams should work: %', r; end if;
  -- insert-if-absent as admin, then repeat -> conflict
  perform pg_temp.as_user('admin@x.com');
  r := public.iapp_store_cas('iapp_brand_new', '[1]', null);
  if not (r->>'ok')::boolean then raise exception 'insert-if-absent failed: %', r; end if;
  r := public.iapp_store_cas('iapp_brand_new', '[2]', null);
  perform pg_temp.back();
  if (r->>'conflict') is distinct from 'true' then raise exception 'second insert-if-absent must conflict: %', r; end if;
  -- the legacy upsert path (old clients) still works and bumps rev
  perform pg_temp.as_user('sec@x.com');
  insert into public.iapp_store (key, value) values ('iapp_audit','[{"a":1}]') on conflict (key) do update set value = excluded.value;
  perform pg_temp.back();
  if (select rev from public.iapp_store where key='iapp_audit') <> 1 then raise exception 'legacy upsert must bump rev'; end if;
end $$;
select 'STORE-CAS ASSERTIONS OK' as result;
