-- Assertions for accounting-hardening.sql (run AFTER harness + accounting-core.sql + accounting-hardening.sql, on an EMPTY throwaway DB).
-- Each block RAISES on failure; the final NOTICE means everything passed.
-- run_as(email, sql, fragment) -- fragment may list alternatives separated by |;: run sql as the 'authenticated' role with that JWT email and require an error containing fragment (null = must succeed).
create or replace function pg_temp.run_as(email text, q text, frag text) returns void language plpgsql as $$
declare ok boolean := false;
begin
  perform set_config('request.jwt.claims', case when email is null then '' else json_build_object('email', email)::text end, false);
  execute 'set role ' || case when email is null then 'anon' else 'authenticated' end;
  begin
    execute q; ok := true;
  exception when others then
    reset role; perform set_config('request.jwt.claims', '', false);
    if frag is null then raise exception 'expected success but failed: [%] -> %', q, sqlerrm; end if;
    if not exists (select 1 from unnest(string_to_array(frag, '|')) f where position(lower(f) in lower(sqlerrm)) > 0) then raise exception 'wrong error for [%]: got "%", wanted "%"', q, sqlerrm, frag; end if;
    return;
  end;
  reset role; perform set_config('request.jwt.claims', '', false);
  if frag is not null then raise exception 'expected failure but succeeded: [%] (wanted "%")', q, frag; end if;
end $$;
create or replace function pg_temp.ln(e text, n int, led text, acct text, d numeric, c numeric) returns jsonb language sql as
$$ select jsonb_build_object('id', e || '-l' || n, 'ledger', led, 'accountId', acct, 'debit', d, 'credit', c) $$;
create or replace function pg_temp.expect_fail(q text, frag text) returns void language plpgsql as $$
begin
  begin execute q; exception when others then
    if position(lower(frag) in lower(sqlerrm)) = 0 then raise exception 'wrong error for [%]: got "%", wanted "%"', q, sqlerrm, frag; end if;
    return;
  end;
  raise exception 'expected failure but succeeded: [%] (wanted "%")', q, frag;
end $$;

-- ---------- fixtures (as superuser; RLS bypassed, guards still fire) ----------
insert into iapp_fin_accounts (id,name,type,opening_balance,is_legacy,active) values
  ('cash','Cash','cash',0,false,true), ('bank','Bank','bank',0,false,true), ('legacy','Legacy','cash',0,true,true), ('dead','Dead','cash',0,false,false), ('cash2','Cash2','cash',0,false,true);
-- charge for appointment A1: 500, collected in 3 payments, two of them OLD (older than the secretary's former 36h window)
insert into iapp_charges (id,kind,amount,discount,net_amount,service_date,source,source_ref,appointment_id,visit_id,clinic) values
  ('chg-1','charge',500,0,500,'2026-10-01','COLLECT_MODAL','apt-A1','A1','apt-A1','دمنهور'),
  ('chg-other','charge',300,0,300,'2026-10-01','COLLECT_MODAL','apt-B2','B2','apt-B2','دمنهور'),
  ('chg-manual','charge',200,0,200,'2026-10-01','MANUAL','m1',null,null,'دمنهور');
insert into iapp_payments (id,kind,charge_id,amount,method,account_id,payment_date,source,created_at) values
  ('pay-old1','payment','chg-1',100,'cash','cash','2026-10-01','COLLECT_MODAL', now() - interval '5 days'),
  ('pay-old2','payment','chg-1',150,'bank_transfer','bank','2026-10-02','COLLECT_MODAL', now() - interval '3 days'),
  ('pay-new1','payment','chg-1',100,'cash','cash','2026-10-08','COLLECT_MODAL', now());

insert into iapp_doctor_settlements (id,doctor,period_from,period_to,gross_revenue,doctor_share,center_share,remaining_amount,status) values
  ('st-draft','Dr','2026-10-01','2026-10-08',1000,300,700,300,'draft'), ('st-ok','Dr','2026-10-01','2026-10-08',1000,300,700,300,'approved');

-- ---------- H2: the secretary reads NOTHING directly ----------
do $outer$ begin
  perform pg_temp.run_as('sec@x.com', $q$do $x$ begin
     if (select count(*) from iapp_charges) <> 0 then raise exception 'secretary can read charges'; end if;
     if (select count(*) from iapp_payments) <> 0 then raise exception 'secretary can read payments'; end if;
     if (select count(*) from iapp_fin_accounts) <> 0 then raise exception 'secretary can read accounts'; end if;
     if (select count(*) from iapp_accounting_entries) <> 0 then raise exception 'secretary can read entries'; end if;
     if (select count(*) from iapp_accounting_entry_lines) <> 0 then raise exception 'secretary can read lines'; end if;
     if (select count(*) from iapp_fin_audit) <> 0 then raise exception 'secretary can read audit'; end if;
  end $x$$q$, null);
end $outer$;

-- ---------- H2: RPC returns correct totals from the FULL ledger (old + multiple + partial) ----------
create or replace function pg_temp.state_of(email text, apt text) returns jsonb language plpgsql as $$
declare r jsonb;
begin
  perform set_config('request.jwt.claims', json_build_object('email', email)::text, false);
  set role authenticated;
  select public.iapp_fin_collection_state(array[apt]) into r;
  reset role; perform set_config('request.jwt.claims', '', false);
  return r;
end $$;
do $$ declare s jsonb; c jsonb; begin
  s := pg_temp.state_of('sec@x.com', 'A1');
  if jsonb_array_length(s->'charges') <> 1 then raise exception 'RPC must return exactly the charge of A1, got %', s->'charges'; end if;
  c := s->'charges'->0;
  if (c->>'net')::numeric <> 500 or (c->>'paid')::numeric <> 350 or (c->>'refunded')::numeric <> 0 or (c->>'outstanding')::numeric <> 150 then
    raise exception 'wrong totals (old+multiple+partial): %', c;
  end if;
  if (select count(*) from jsonb_array_elements(s->'accounts') a where a->>'id' in ('legacy','dead')) <> 0 then raise exception 'legacy/inactive accounts must not be offered'; end if;
  if jsonb_array_length(s->'accounts') <> 3 then raise exception 'expected cash, bank, cash2 only: %', s->'accounts'; end if;
  if s::text like '%chg-other%' or s::text like '%chg-manual%' then raise exception 'RPC leaked other charges'; end if;
  if s::text like '%pay-old%' then raise exception 'RPC must return aggregates, not payment rows'; end if;
end $$;

-- pending (offline-queue) ids: the server echoes back only the ones it already holds
do $$ declare s jsonb; begin
  perform set_config('request.jwt.claims', '{"email":"sec@x.com"}', false); set role authenticated;
  select public.iapp_fin_collection_state(array['A1'], array['pay-old1','not-synced-yet','chg-1']) into s;
  reset role; perform set_config('request.jwt.claims', '', false);
  if not (s->'known_ids' @> '["pay-old1","chg-1"]'::jsonb) or s->'known_ids' @> '["not-synced-yet"]'::jsonb or jsonb_array_length(s->'known_ids') <> 2 then raise exception 'known_ids wrong: %', s->'known_ids'; end if;
end $$;
-- admin may call it too; doctor / anon may not; too many ids rejected
select pg_temp.run_as('admin@x.com', $$select public.iapp_fin_collection_state(array['A1'])$$, null);
select pg_temp.run_as('doc@x.com', $$select public.iapp_fin_collection_state(array['A1'])$$, 'not allowed');
select pg_temp.run_as(null, $$select public.iapp_fin_collection_state(array['A1'])$$, 'permission denied');
select pg_temp.run_as('sec@x.com', $$select public.iapp_fin_collection_state(array[]::text[])$$, 'between 1 and 20');

-- ---------- H1: overpayment seen through OLD payments, by the secretary ----------
select pg_temp.run_as('sec@x.com', $$insert into iapp_payments (id,kind,charge_id,amount,method,account_id,payment_date,source) values ('sec-over','payment','chg-1',200,'cash','cash','2026-10-09','COLLECT_MODAL')$$, 'exceeds the outstanding');
select pg_temp.run_as('sec@x.com', $$insert into iapp_payments (id,kind,charge_id,amount,method,account_id,payment_date,source) values ('sec-ok','payment','chg-1',150,'cash','cash','2026-10-09','COLLECT_MODAL')$$, null);
select pg_temp.run_as('sec@x.com', $$insert into iapp_payments (id,kind,charge_id,amount,method,account_id,payment_date,source) values ('sec-over2','payment','chg-1',1,'cash','cash','2026-10-09','COLLECT_MODAL')$$, 'exceeds the outstanding');
do $$ declare c jsonb; begin
  c := pg_temp.state_of('sec@x.com','A1')->'charges'->0;
  if (c->>'paid')::numeric <> 500 or (c->>'outstanding')::numeric <> 0 then raise exception 'after full collection: %', c; end if;
end $$;

-- ---------- secretary payment restrictions (RLS) ----------
select pg_temp.run_as('sec@x.com', $$insert into iapp_payments (id,kind,charge_id,amount,method,account_id,payment_date,source) values ('s1','payment','chg-other',10,'cash','legacy','2026-10-09','COLLECT_MODAL')$$, 'migration-only');
select pg_temp.run_as('sec@x.com', $$insert into iapp_payments (id,kind,charge_id,amount,method,account_id,payment_date,source) values ('s2','payment','chg-other',10,'legacy','cash','2026-10-09','COLLECT_MODAL')$$, 'migration-only');
select pg_temp.run_as('sec@x.com', $$insert into iapp_payments (id,kind,charge_id,amount,method,account_id,payment_date,source) values ('s3','payment','chg-other',10,'cash','dead','2026-10-09','COLLECT_MODAL')$$, 'inactive');
select pg_temp.run_as('sec@x.com', $$insert into iapp_payments (id,kind,charge_id,amount,method,account_id,payment_date,source) values ('s4','payment','chg-other',10,'cash','cash','2026-10-09','MANUAL')$$, 'row-level security');
select pg_temp.run_as('sec@x.com', $$insert into iapp_payments (id,kind,charge_id,amount,method,account_id,payment_date,source,reason) values ('s5','refund','chg-1',10,'cash','cash','2026-10-09','COLLECT_MODAL','x')$$, 'row-level security');
select pg_temp.run_as('sec@x.com', $$insert into iapp_payments (id,kind,amount,method,account_id,to_account_id,payment_date,source) values ('s6','transfer',10,'cash','cash','bank','2026-10-09','COLLECT_MODAL')$$, 'row-level security');
select pg_temp.run_as('sec@x.com', $$insert into iapp_payments (id,kind,charge_id,amount,method,account_id,payment_date,source,reversal_of,reason) values ('s7','reversal','chg-1',100,'cash','cash','2026-10-09','COLLECT_MODAL','pay-old1','x')$$, 'row-level security');
select pg_temp.run_as('sec@x.com', $$insert into iapp_payments (id,kind,settlement_id,amount,method,account_id,payment_date,source) values ('s8','doctor_payment','st-ok',10,'cash','cash','2026-10-09','COLLECT_MODAL')$$, 'row-level security');
select pg_temp.run_as('sec@x.com', $$insert into iapp_payments (id,kind,charge_id,amount,method,account_id,payment_date,source) values ('s9','payment','nope',10,'cash','cash','2026-10-09','COLLECT_MODAL')$$, 'a payment must reference a base charge');
select pg_temp.run_as('sec@x.com', $$update iapp_payments set amount = 1 where id = 'sec-ok'$$, null); -- RLS hides the row: 0 rows updated, never an error that leaks
do $$ begin if (select amount from iapp_payments where id='sec-ok') <> 150 then raise exception 'secretary changed a payment'; end if; end $$;
-- secretary charges
select pg_temp.run_as('sec@x.com', $$insert into iapp_charges (id,kind,amount,discount,net_amount,service_date,source,source_ref) values ('sc1','charge',100,0,100,'2026-10-09','MANUAL','x')$$, 'row-level security');
select pg_temp.run_as('sec@x.com', $$insert into iapp_charges (id,kind,parent_id,net_amount,service_date,source,reason) values ('sc2','adjustment','chg-other',10,'2026-10-09','COLLECT_MODAL','x')$$, 'row-level security');
select pg_temp.run_as('sec@x.com', $$insert into iapp_charges (id,kind,amount,discount,net_amount,service_date,source,source_ref) values ('chg-sec','charge',100,0,100,'2026-10-09','COLLECT_MODAL','apt-C3')$$, null);

-- ---------- H3: entries must match their origin row ----------
-- secretary: the documented charge entry is accepted ...
select pg_temp.run_as('sec@x.com', format($$insert into iapp_accounting_entries (id,date,type,source,source_ref,lines) values ('ent-chg-sec','2026-10-09','charge','COLLECT_MODAL','chg-sec', %L::jsonb)$$,
  jsonb_build_array(pg_temp.ln('ent-chg-sec',1,'RECEIVABLE',null,100,0), pg_temp.ln('ent-chg-sec',2,'REVENUE',null,0,100))), null);
-- ... the payment entry too
select pg_temp.run_as('sec@x.com', format($$insert into iapp_accounting_entries (id,date,type,source,source_ref,lines) values ('ent-sec-ok','2026-10-09','payment','COLLECT_MODAL','sec-ok', %L::jsonb)$$,
  jsonb_build_array(pg_temp.ln('ent-sec-ok',1,'ASSET','cash',150,0), pg_temp.ln('ent-sec-ok',2,'RECEIVABLE',null,0,150))), null);
-- wrong amount / wrong account / swapped sides / wrong date / wrong source / unknown origin / unlinked / wrong id
select pg_temp.run_as('sec@x.com', format($$insert into iapp_accounting_entries (id,date,type,source,source_ref,lines) values ('ent-pay-old1','2026-10-01','payment','COLLECT_MODAL','pay-old1', %L::jsonb)$$,
  jsonb_build_array(pg_temp.ln('a',1,'ASSET','cash',999,0), pg_temp.ln('a',2,'RECEIVABLE',null,0,999))), 'lines do not match');
select pg_temp.run_as('sec@x.com', format($$insert into iapp_accounting_entries (id,date,type,source,source_ref,lines) values ('ent-pay-old1','2026-10-01','payment','COLLECT_MODAL','pay-old1', %L::jsonb)$$,
  jsonb_build_array(pg_temp.ln('a',1,'ASSET','bank',100,0), pg_temp.ln('a',2,'RECEIVABLE',null,0,100))), 'lines do not match');
select pg_temp.run_as('sec@x.com', format($$insert into iapp_accounting_entries (id,date,type,source,source_ref,lines) values ('ent-pay-old1','2026-10-01','payment','COLLECT_MODAL','pay-old1', %L::jsonb)$$,
  jsonb_build_array(pg_temp.ln('a',1,'RECEIVABLE',null,100,0), pg_temp.ln('a',2,'ASSET','cash',0,100))), 'lines do not match');
select pg_temp.run_as('sec@x.com', format($$insert into iapp_accounting_entries (id,date,type,source,source_ref,lines) values ('ent-pay-old1','2026-10-09','payment','COLLECT_MODAL','pay-old1', %L::jsonb)$$,
  jsonb_build_array(pg_temp.ln('a',1,'ASSET','cash',100,0), pg_temp.ln('a',2,'RECEIVABLE',null,0,100))), 'date does not match');
select pg_temp.run_as('sec@x.com', format($$insert into iapp_accounting_entries (id,date,type,source,source_ref,lines) values ('ent-ghost','2026-10-09','payment','COLLECT_MODAL','ghost', %L::jsonb)$$,
  jsonb_build_array(pg_temp.ln('a',1,'ASSET','cash',100,0), pg_temp.ln('a',2,'RECEIVABLE',null,0,100))), 'no matching payment');
select pg_temp.run_as('sec@x.com', format($$insert into iapp_accounting_entries (id,date,type,source,lines) values ('ent-free','2026-10-09','payment','COLLECT_MODAL', %L::jsonb)$$,
  jsonb_build_array(pg_temp.ln('a',1,'ASSET','cash',100,0), pg_temp.ln('a',2,'RECEIVABLE',null,0,100))), 'must reference its origin row');
select pg_temp.run_as('sec@x.com', format($$insert into iapp_accounting_entries (id,date,type,source,source_ref,lines) values ('anything','2026-10-01','payment','COLLECT_MODAL','pay-old1', %L::jsonb)$$,
  jsonb_build_array(pg_temp.ln('a',1,'ASSET','cash',100,0), pg_temp.ln('a',2,'RECEIVABLE',null,0,100))), 'entry id must be');
-- secretary: types she may never post (RLS), and entries for admin-created MANUAL charges (source mismatch with policy)
select pg_temp.run_as('sec@x.com', format($$insert into iapp_accounting_entries (id,date,type,source,source_ref,clinic,lines) values ('ent-chg-manual','2026-10-01','charge','MANUAL','chg-manual','دمنهور', %L::jsonb)$$,
  jsonb_build_array(pg_temp.ln('a',1,'RECEIVABLE',null,200,0), pg_temp.ln('a',2,'REVENUE',null,0,200))), 'can only post entries for her own');
select pg_temp.run_as('sec@x.com', format($$insert into iapp_accounting_entries (id,date,type,source,source_ref,lines) values ('ent-x','2026-10-09','expense','COLLECT_MODAL','x', %L::jsonb)$$,
  jsonb_build_array(pg_temp.ln('a',1,'EXPENSE',null,5,0), pg_temp.ln('a',2,'ASSET','cash',0,5))), 'row-level security|needs a paid');
select pg_temp.run_as('sec@x.com', format($$insert into iapp_accounting_entries (id,date,type,source,source_ref,lines) values ('ent-adj','2026-10-09','adjustment','COLLECT_MODAL','recadj-1', %L::jsonb)$$,
  jsonb_build_array(pg_temp.ln('a',1,'ASSET','cash',5,0), pg_temp.ln('a',2,'OVER_SHORT',null,0,5))), 'row-level security|needs a reconciliation|entry id must be');
-- one entry per origin row (no double revenue)
select pg_temp.run_as('sec@x.com', format($$insert into iapp_accounting_entries (id,date,type,source,source_ref,lines) values ('ent-chg-sec','2026-10-09','charge','COLLECT_MODAL','chg-sec', %L::jsonb)$$,
  jsonb_build_array(pg_temp.ln('ent-chg-sec',1,'RECEIVABLE',null,100,0), pg_temp.ln('ent-chg-sec',2,'REVENUE',null,0,100))), 'duplicate key');
-- the admin is held to the same integrity rules
select pg_temp.run_as('admin@x.com', format($$insert into iapp_accounting_entries (id,date,type,source,source_ref,lines) values ('ent-pay-old1','2026-10-01','payment','COLLECT_MODAL','pay-old1', %L::jsonb)$$,
  jsonb_build_array(pg_temp.ln('a',1,'ASSET','cash',100,0), pg_temp.ln('a',2,'REVENUE',null,0,100))), 'lines do not match');
select pg_temp.run_as('admin@x.com', format($$insert into iapp_accounting_entries (id,date,type,source,source_ref,lines) values ('ent-chg-manual','2026-10-01','charge','MANUAL','chg-manual', %L::jsonb)$$,
  jsonb_build_array(pg_temp.ln('a',1,'RECEIVABLE',null,200,0), pg_temp.ln('a',2,'REVENUE',null,0,200))), 'clinic does not match');
select pg_temp.run_as('admin@x.com', format($$insert into iapp_accounting_entries (id,date,type,source,source_ref,clinic,lines) values ('ent-chg-manual','2026-10-01','charge','MANUAL','chg-manual','دمنهور', %L::jsonb)$$,
  jsonb_build_array(pg_temp.ln('a',1,'RECEIVABLE',null,200,0), pg_temp.ln('a',2,'REVENUE',null,0,200))), null);
select pg_temp.run_as('admin@x.com', format($$insert into iapp_accounting_entries (id,date,type,source,source_ref,clinic,lines) values ('ent-chg-1','2026-10-01','charge','COLLECT_MODAL','chg-1','دمنهور', %L::jsonb)$$,
  jsonb_build_array(pg_temp.ln('a',1,'RECEIVABLE',null,500,0), pg_temp.ln('a',2,'REVENUE',null,0,500))), null);
-- order-independent line comparison; every line of every entry is stored, whatever ids the client sent
do $$ begin if (select sum(credit) from iapp_accounting_entry_lines where ledger='REVENUE') <> 800 then raise exception 'revenue lines must equal charges (500 + 200 + 100)'; end if; end $$;

-- ---------- reversal entries mirror the original ----------
insert into iapp_payments (id,kind,charge_id,amount,method,account_id,payment_date,source,reversal_of,reason) values ('rev-new1','reversal','chg-1',100,'cash','cash','2026-10-09','COLLECT_MODAL','pay-new1','خطأ');
insert into iapp_accounting_entries (id,date,type,source,source_ref,lines) values ('ent-pay-new1','2026-10-08','payment','COLLECT_MODAL','pay-new1',
  jsonb_build_array(pg_temp.ln('p',1,'ASSET','cash',100,0), pg_temp.ln('p',2,'RECEIVABLE',null,0,100)));
select pg_temp.expect_fail(format($$insert into iapp_accounting_entries (id,date,type,source,source_ref,reversal_of,reversal_of_type,lines) values ('ent-rev-new1','2026-10-09','reversal','COLLECT_MODAL','rev-new1','ent-pay-new1','payment', %L::jsonb)$$,
  jsonb_build_array(pg_temp.ln('r',1,'ASSET','cash',100,0), pg_temp.ln('r',2,'RECEIVABLE',null,0,100))), 'lines do not match');   -- not swapped
select pg_temp.expect_fail(format($$insert into iapp_accounting_entries (id,date,type,source,source_ref,reversal_of,reversal_of_type,lines) values ('ent-rev-new1','2026-10-09','reversal','COLLECT_MODAL','rev-new1','ent-pay-old1','payment', %L::jsonb)$$,
  jsonb_build_array(pg_temp.ln('r',1,'RECEIVABLE',null,100,0), pg_temp.ln('r',2,'ASSET','cash',0,100))), 'wrong entry');          -- reverses another entry
select pg_temp.expect_fail(format($$insert into iapp_accounting_entries (id,date,type,source,source_ref,reversal_of,reversal_of_type,lines) values ('ent-rev-new1','2026-10-09','reversal','COLLECT_MODAL','rev-new1','ent-pay-new1','charge', %L::jsonb)$$,
  jsonb_build_array(pg_temp.ln('r',1,'RECEIVABLE',null,100,0), pg_temp.ln('r',2,'ASSET','cash',0,100))), 'reversal_of_type');
insert into iapp_accounting_entries (id,date,type,source,source_ref,reversal_of,reversal_of_type,lines) values ('ent-rev-new1','2026-10-09','reversal','COLLECT_MODAL','rev-new1','ent-pay-new1','payment',
  jsonb_build_array(pg_temp.ln('r',1,'RECEIVABLE',null,100,0), pg_temp.ln('r',2,'ASSET','cash',0,100)));
do $$ begin
  if (select count(*) from iapp_accounting_entry_lines where entry_id='ent-rev-new1') <> 2 then raise exception 'reversal lines not expanded'; end if;
  if exists (select 1 from iapp_fin_ledger_health) then raise exception 'ledger health must be clean'; end if;
end $$;
-- payment reversals must mirror the original row
select pg_temp.expect_fail($$insert into iapp_payments (id,kind,charge_id,amount,method,account_id,payment_date,source,reversal_of,reason) values ('rev-bad1','reversal','chg-1',50,'cash','cash','2026-10-09','X','pay-old1','x')$$, 'mirror');
select pg_temp.expect_fail($$insert into iapp_payments (id,kind,charge_id,amount,method,account_id,payment_date,source,reversal_of,reason) values ('rev-bad2','reversal','chg-1',100,'cash','bank','2026-10-09','X','pay-old1','x')$$, 'mirror');
select pg_temp.expect_fail($$insert into iapp_payments (id,kind,charge_id,amount,method,account_id,payment_date,source,reversal_of,reason) values ('rev-bad3','reversal','chg-1',100,'cash','cash','2026-10-09','X','rev-new1','x')$$, 'original money row');

-- ---------- payments: legacy account is migration-only; refunds ----------
select pg_temp.expect_fail($$insert into iapp_payments (id,kind,charge_id,amount,method,account_id,payment_date,source) values ('lg1','payment','chg-other',10,'cash','legacy','2026-10-09','MANUAL')$$, 'migration-only');
select pg_temp.expect_fail($$insert into iapp_payments (id,kind,charge_id,amount,method,account_id,payment_date,source) values ('lg2','payment','chg-other',10,'legacy','cash','2026-10-09','MANUAL')$$, 'migration-only');
insert into iapp_payments (id,kind,charge_id,amount,method,account_id,payment_date,source,source_ref) values ('lg3','payment','chg-other',100,'legacy','legacy','2026-10-01','LEGACY_VISIT','apt-B2');  -- the migration still works
select pg_temp.expect_fail($$insert into iapp_payments (id,kind,charge_id,amount,method,account_id,payment_date,source) values ('dd1','payment','chg-other',10,'cash','dead','2026-10-09','MANUAL')$$, 'inactive');

-- ---------- doctor payments need an approved settlement and cannot exceed it ----------
select pg_temp.expect_fail($$insert into iapp_payments (id,kind,settlement_id,amount,method,account_id,payment_date,source) values ('dp0','doctor_payment','st-draft',10,'cash','cash','2026-10-09','X')$$, 'not payable');
select pg_temp.expect_fail($$insert into iapp_payments (id,kind,settlement_id,amount,method,account_id,payment_date,source) values ('dp1','doctor_payment','ghost',10,'cash','cash','2026-10-09','X')$$, 'existing settlement');
select pg_temp.expect_fail($$insert into iapp_payments (id,kind,settlement_id,amount,method,account_id,payment_date,source) values ('dp2','doctor_payment','st-ok',301,'cash','cash','2026-10-09','X')$$, 'exceeds the remaining settlement');
insert into iapp_payments (id,kind,settlement_id,amount,method,account_id,payment_date,source) values ('dp3','doctor_payment','st-ok',200,'cash','cash','2026-10-09','X');
select pg_temp.expect_fail($$insert into iapp_payments (id,kind,settlement_id,amount,method,account_id,payment_date,source) values ('dp4','doctor_payment','st-ok',101,'cash','cash','2026-10-09','X')$$, 'exceeds the remaining settlement');
insert into iapp_accounting_entries (id,date,type,source,source_ref,lines) values ('ent-dp3','2026-10-09','doctor_payment','X','dp3', jsonb_build_array(pg_temp.ln('d',1,'DOCTOR_SHARE',null,200,0), pg_temp.ln('d',2,'ASSET','cash',0,200)));
select pg_temp.expect_fail(format($$insert into iapp_accounting_entries (id,date,type,source,source_ref,lines) values ('ent-dp3b','2026-10-09','doctor_payment','X','dp3', %L::jsonb)$$, jsonb_build_array(pg_temp.ln('d',1,'EXPENSE',null,200,0), pg_temp.ln('d',2,'ASSET','cash',0,200))), 'entry id must be');
-- transfer
select pg_temp.expect_fail($$insert into iapp_payments (id,kind,amount,method,account_id,to_account_id,payment_date,source) values ('tr0','transfer',10,'cash','cash','dead','2026-10-09','X')$$, 'missing or inactive');
insert into iapp_payments (id,kind,amount,method,account_id,to_account_id,payment_date,source) values ('tr1','transfer',10,'cash','cash','bank','2026-10-09','X');
insert into iapp_accounting_entries (id,date,type,source,source_ref,lines) values ('ent-tr1','2026-10-09','transfer','X','tr1', jsonb_build_array(pg_temp.ln('t',1,'ASSET','bank',10,0), pg_temp.ln('t',2,'ASSET','cash',0,10)));
-- expense entry must match the expense (category, account, amount)
insert into iapp_expenses (id,date,category,amount,status,account_id,payment_method,paid_at,source) values ('ex1','2026-10-09','إيجار','40','paid','cash','cash','2026-10-09','MANUAL');
select pg_temp.expect_fail(format($$insert into iapp_accounting_entries (id,date,type,source,source_ref,lines) values ('ent-ex1','2026-10-09','expense','MANUAL','ex1', %L::jsonb)$$, jsonb_build_array(pg_temp.ln('e',1,'EXPENSE',null,50,0), pg_temp.ln('e',2,'ASSET','cash',0,50))), 'lines do not match');
insert into iapp_accounting_entries (id,date,type,source,source_ref,lines) values ('ent-ex1','2026-10-09','expense','MANUAL','ex1', jsonb_build_array(jsonb_build_object('id','e-l1','ledger','EXPENSE','category','إيجار','debit',40,'credit',0), pg_temp.ln('e',2,'ASSET','cash',0,40)));
select pg_temp.expect_fail($$insert into iapp_expenses (id,date,category,amount,status,account_id,payment_method,paid_at,source) values ('ex2','2026-10-09','أخرى','5','paid','legacy','cash','2026-10-09','MANUAL')$$, 'migration-only');
select pg_temp.expect_fail($$insert into iapp_expenses (id,date,category,amount,status,account_id,payment_method,paid_at,source) values ('ex3','2026-10-09','أخرى','5','paid','cash','legacy','2026-10-09','MANUAL')$$, 'migration-only');
select pg_temp.expect_fail($$insert into iapp_expenses (id,date,category,amount,status,account_id,payment_method,paid_at,reversal_of) values ('ex4','2026-10-09','إيجار','41','paid','cash','cash','2026-10-09','ex1')$$, 'mirror');
insert into iapp_expenses (id,date,category,amount,status,account_id,payment_method,paid_at,reversal_of) values ('ex5','2026-10-09','إيجار','40','paid','cash','cash','2026-10-09','ex1');
insert into iapp_accounting_entries (id,date,type,source,source_ref,reversal_of,reversal_of_type,lines) values ('ent-ex5','2026-10-09','reversal',null,'ex5','ent-ex1','expense',
  jsonb_build_array(jsonb_build_object('id','x-l1','ledger','EXPENSE','category','إيجار','debit',0,'credit',40), pg_temp.ln('x',2,'ASSET','cash',40,0)));


-- ---------- H6: an offline retry (same ids) is harmless for the secretary ----------
-- The client uses a plain INSERT; "id already exists" (pkey 23505) is treated as success. The guards do not re-judge an
-- existing row, so the retry of a payment that FULLY paid the charge ends in a pkey duplicate, not 'exceeds the outstanding'.
select pg_temp.run_as('sec@x.com', $$insert into iapp_payments (id,kind,charge_id,amount,method,account_id,payment_date,source) values ('sec-ok','payment','chg-1',150,'cash','cash','2026-10-09','COLLECT_MODAL')$$, 'iapp_payments_pkey');
select pg_temp.run_as('sec@x.com', $$insert into iapp_charges (id,kind,amount,discount,net_amount,service_date,source,source_ref) values ('chg-sec','charge',100,0,100,'2026-10-09','COLLECT_MODAL','apt-C3')$$, 'iapp_charges_pkey');
select pg_temp.run_as('sec@x.com', format($$insert into iapp_accounting_entries (id,date,type,source,source_ref,lines) values ('ent-sec-ok','2026-10-09','payment','COLLECT_MODAL','sec-ok', %L::jsonb)$$,
  jsonb_build_array(pg_temp.ln('ent-sec-ok',1,'ASSET','cash',150,0), pg_temp.ln('ent-sec-ok',2,'RECEIVABLE',null,0,150))), 'iapp_accounting_entries_pkey');
select pg_temp.run_as('sec@x.com', $$insert into iapp_fin_audit (id,actor,role,entity,entity_id,action) values ('au1','sec','secretary','payment','sec-ok','create')$$, null);   -- first send
-- ON CONFLICT would need a SELECT policy the secretary does not have, so it is refused (the client never uses it)
select pg_temp.run_as('sec@x.com', $$insert into iapp_payments (id,kind,charge_id,amount,method,account_id,payment_date,source) values ('sec-ok','payment','chg-1',150,'cash','cash','2026-10-09','COLLECT_MODAL') on conflict (id) do nothing$$, 'row-level security');
do $$ begin
  if (select count(*) from iapp_payments where id='sec-ok') <> 1 or (select count(*) from iapp_accounting_entry_lines where entry_id='ent-sec-ok') <> 2 then raise exception 'retry duplicated rows'; end if;
end $$;

-- ---------- reconciliation: period lock (definer) blocks the secretary; adjustment entry matches the reconciliation ----------
insert into iapp_cash_reconciliations (id,account_id,period_from,period_to,opening,expected,counted,difference,note) values ('rc1','cash2','2026-09-01','2026-09-30',0,0,5,5,'زيادة');
select pg_temp.run_as('sec@x.com', $$insert into iapp_payments (id,kind,charge_id,amount,method,account_id,payment_date,source) values ('lock1','payment','chg-other',10,'cash','cash2','2026-09-15','COLLECT_MODAL')$$, 'reconciled and closed');
select pg_temp.expect_fail($$insert into iapp_expenses (id,date,category,amount,status,account_id,payment_method,paid_at,source) values ('lock2','2026-09-15','أخرى','5','paid','cash2','cash','2026-09-15','MANUAL')$$, 'reconciled and closed');
select pg_temp.expect_fail(format($$insert into iapp_accounting_entries (id,date,type,source,source_ref,lines) values ('ent-recadj-rc1','2026-09-30','adjustment','RECONCILIATION','recadj-rc1', %L::jsonb)$$, jsonb_build_array(pg_temp.ln('a',1,'ASSET','cash2',9,0), pg_temp.ln('a',2,'OVER_SHORT',null,0,9))), 'lines do not match');
insert into iapp_accounting_entries (id,date,type,source,source_ref,lines) values ('ent-recadj-rc1','2026-09-30','adjustment','RECONCILIATION','recadj-rc1', jsonb_build_array(pg_temp.ln('a',1,'ASSET','cash2',5,0), pg_temp.ln('a',2,'OVER_SHORT',null,0,5)));
select pg_temp.run_as('sec@x.com', format($$insert into iapp_accounting_entries (id,date,type,source,source_ref,lines) values ('ent-recadj-rc9','2026-09-30','adjustment','RECONCILIATION','recadj-rc9', %L::jsonb)$$, jsonb_build_array(pg_temp.ln('a',1,'ASSET','cash2',5,0), pg_temp.ln('a',2,'OVER_SHORT',null,0,5))), 'row-level security|needs a reconciliation|entry id must be');

-- ---------- audit: secretary may only log create of a real charge / payment ----------
select pg_temp.run_as('sec@x.com', $$insert into iapp_fin_audit (id,actor,role,entity,entity_id,action) values ('au1','sec','secretary','payment','sec-ok','create')$$, 'iapp_fin_audit_pkey');   -- retry
select pg_temp.run_as('sec@x.com', $$insert into iapp_fin_audit (id,actor,role,entity,entity_id,action) values ('au2','sec','secretary','payment','ghost','create')$$, 'audit row must reference');
select pg_temp.run_as('sec@x.com', $$insert into iapp_fin_audit (id,actor,role,entity,entity_id,action) values ('au3','sec','secretary','expense','ex1','create')$$, 'row-level security|audit row must');
select pg_temp.run_as('sec@x.com', $$insert into iapp_fin_audit (id,actor,role,entity,entity_id,action) values ('au4','sec','secretary','payment','sec-ok','delete')$$, 'row-level security');

-- ---------- helpers/guards cannot be called by clients ----------
select pg_temp.run_as('sec@x.com', $$select public.iapp_fin_charge_paid('chg-1')$$, 'permission denied');
select pg_temp.run_as('sec@x.com', $$select public.iapp_fin_period_closed('cash2','2026-09-01')$$, 'permission denied');
select pg_temp.run_as(null, $$select public.iapp_fin_charge_net('chg-1')$$, 'permission denied');
select pg_temp.run_as('doc@x.com', $$select public.iapp_fin_account_usable('cash')$$, 'permission denied');

-- ---------- charges guard still protects paid charges (definer sees old payments) ----------
select pg_temp.run_as('admin@x.com', $$insert into iapp_charges (id,kind,parent_id,net_amount,service_date,source,reason) values ('adj-bad','adjustment','chg-1',-300,'2026-10-09','MANUAL','x')$$, 'below the amount already paid');

-- ---------- idempotent re-run of the migration file itself ----------
\ir ../accounting-hardening.sql
do $$ begin
  if exists (select 1 from iapp_fin_ledger_health) then raise exception 'ledger health must be clean after re-run'; end if;
  raise notice 'ACCOUNTING HARDENING ASSERTIONS: ALL PASSED';
end $$;
