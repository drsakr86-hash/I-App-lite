-- Assertions for store-role-rls.sql. Run AFTER harness + setup + the apply script, on a throwaway DB. Raises on failure.
create or replace function pg_temp.run_as(email text, q text, frag text) returns void language plpgsql as $$
declare ok boolean := false;
begin
  perform set_config('request.jwt.claims', case when email is null then '' else json_build_object('email', email)::text end, false);
  execute 'set role ' || case when email is null then 'anon' else 'authenticated' end;
  begin execute q; ok := true;
  exception when others then
    reset role; perform set_config('request.jwt.claims', '', false);
    if frag is null then raise exception 'expected success but failed: [%] -> %', q, sqlerrm; end if;
    if position(lower(frag) in lower(sqlerrm)) = 0 then raise exception 'wrong error for [%]: got "%", wanted "%"', q, sqlerrm, frag; end if;
    return;
  end;
  reset role; perform set_config('request.jwt.claims', '', false);
  if frag is not null then raise exception 'expected failure but succeeded: [%] (wanted "%")', q, frag; end if;
end $$;
-- rows visible to a role, as a count: raise unless equal to n
create or replace function pg_temp.visible(email text, keys text[], n int) returns void language plpgsql as $$
declare c int;
begin
  perform set_config('request.jwt.claims', case when email is null then '' else json_build_object('email', email)::text end, false);
  execute 'set role ' || case when email is null then 'anon' else 'authenticated' end;
  select count(*) into c from public.iapp_store where key = any(keys);
  reset role; perform set_config('request.jwt.claims', '', false);
  if c <> n then raise exception '% sees % of % keys %, wanted %', coalesce(email,'anon'), c, cardinality(keys), keys, n; end if;
end $$;
-- how many rows an UPDATE touched (RLS filters silently)
create or replace function pg_temp.updated(email text, k text, n int) returns void language plpgsql as $$
declare c int;
begin
  perform set_config('request.jwt.claims', json_build_object('email', email)::text, false);
  set role authenticated;
  update public.iapp_store set value = '[{"id":2}]'::jsonb where key = k;
  get diagnostics c = row_count;
  reset role; perform set_config('request.jwt.claims', '', false);
  if c <> n then raise exception '% updated % rows of key %, wanted %', email, c, k, n; end if;
end $$;

-- ---- secretary: read+write set
select pg_temp.visible('sec@x.com', array['iapp_appointments','iapp_patients','iapp_prices','iapp_visits','iapp_audit','iapp_trash'], 6);
select pg_temp.updated('sec@x.com', 'iapp_patients', 1);
select pg_temp.updated('sec@x.com', 'iapp_audit', 1);
select pg_temp.updated('sec@x.com', 'iapp_trash', 1);
-- the client writes with INSERT .. ON CONFLICT (key) DO UPDATE (upsert)
select pg_temp.run_as('sec@x.com', $$insert into public.iapp_store (key, value) values ('iapp_patients','[{"id":3}]') on conflict (key) do update set value = excluded.value$$, null);
select pg_temp.run_as('sec@x.com', $$insert into public.iapp_store (key, value) values ('iapp_appointments','[{"id":3}]') on conflict (key) do update set value = excluded.value returning key$$, null);
-- ---- secretary: read-only set
select pg_temp.visible('sec@x.com', array['iapp_users','iapp_doctors','iapp_clinic'], 3);
select pg_temp.updated('sec@x.com', 'iapp_users', 0);
select pg_temp.updated('sec@x.com', 'iapp_clinic', 0);
select pg_temp.updated('sec@x.com', 'iapp_doctors', 0);
select pg_temp.run_as('sec@x.com', $$insert into public.iapp_store (key, value) values ('iapp_users','[]') on conflict (key) do update set value = excluded.value$$, 'row-level security');
select pg_temp.run_as('sec@x.com', $$delete from public.iapp_store where key = 'iapp_users'$$, null);   -- filtered: deletes nothing
do $$ begin if not exists (select 1 from public.iapp_store where key='iapp_users') then raise exception 'secretary deleted iapp_users'; end if; end $$;
-- ---- secretary: everything else is invisible and untouchable
select pg_temp.visible('sec@x.com', array['iapp_exams','iapp_prescriptions','iapp_imaging_orders','iapp_imgmeta_1','iapp_injections','iapp_custom_tests','iapp_backups',
                                         'iapp_followup_hidden','iapp_expenses','iapp_recurring_expenses','iapp_future_key'], 0);
select pg_temp.updated('sec@x.com', 'iapp_exams', 0);
select pg_temp.updated('sec@x.com', 'iapp_backups', 0);
select pg_temp.run_as('sec@x.com', $$insert into public.iapp_store (key, value) values ('iapp_new_blob','[]')$$, 'row-level security');
select pg_temp.run_as('sec@x.com', $$insert into public.iapp_store (key, value) values ('iapp_exams','[]') on conflict (key) do update set value = excluded.value$$, 'row-level security');
select pg_temp.run_as('sec@x.com', $$insert into public.iapp_store (key, value) values ('iapp_backups','[]') on conflict (key) do update set value = excluded.value$$, 'row-level security');
do $$ begin
  if (select value from public.iapp_store where key='iapp_exams') <> '[{"id":1}]'::jsonb then raise exception 'exams changed'; end if;
  if (select value from public.iapp_store where key='iapp_backups') <> '[{"id":1}]'::jsonb then raise exception 'backups changed'; end if;
end $$;
-- ---- admin keeps everything (including expenses) and can write everything
select pg_temp.visible('admin@x.com', (select array_agg(key) from public.iapp_store), (select count(*)::int from public.iapp_store));
select pg_temp.updated('admin@x.com', 'iapp_exams', 1);
select pg_temp.updated('admin@x.com', 'iapp_users', 1);
select pg_temp.updated('admin@x.com', 'iapp_expenses', 1);
select pg_temp.run_as('admin@x.com', $$insert into public.iapp_store (key, value) values ('iapp_new_blob','[]')$$, null);
-- ---- doctor account (role exists only in the test replica) and unknown / anonymous users: nothing
select pg_temp.visible('doc@x.com', (select array_agg(key) from public.iapp_store), 0);
select pg_temp.visible('stranger@x.com', (select array_agg(key) from public.iapp_store), 0);
select pg_temp.run_as(null, 'select count(*) from public.iapp_store', 'permission denied');   -- anon has no table privilege at all
select pg_temp.run_as('stranger@x.com', $$insert into public.iapp_store (key, value) values ('iapp_patients','[]') on conflict (key) do update set value = excluded.value$$, 'row-level security');
-- ---- private snapshot of the old policies exists and nobody but the owner can read it
do $$ begin
  if (select count(*) from public.iapp_store_policies_pre_20261012) <> 2 then raise exception 'snapshot missing'; end if;
  if has_table_privilege('authenticated','public.iapp_store_policies_pre_20261012','select') or has_table_privilege('anon','public.iapp_store_policies_pre_20261012','select') then raise exception 'snapshot readable'; end if;
end $$;
do $$ begin raise notice 'store-role-rls assertions: ALL PASSED'; end $$;
