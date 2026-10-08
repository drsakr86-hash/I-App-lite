-- Assertions for accounting-core.sql. Each block RAISES on failure; the final NOTICE means all passed.
-- Helper: expect_fail(sql, fragment) runs sql and requires an error containing fragment.
create or replace function pg_temp.expect_fail(q text, frag text) returns void language plpgsql as $$
begin
  begin execute q; exception when others then
    if position(lower(frag) in lower(sqlerrm)) = 0 then raise exception 'wrong error for [%]: got "%", wanted "%"', q, sqlerrm, frag; end if;
    return;
  end;
  raise exception 'expected failure but succeeded: [%] (wanted "%")', q, frag;
end $$;

insert into iapp_fin_accounts (id, name, type, opening_balance, is_legacy) values ('cash','Cash','cash',0,false), ('bank','Bank','bank',1000,false), ('legacy','Legacy','cash',0,true);
select pg_temp.expect_fail($$update iapp_fin_accounts set is_legacy = false where id = 'legacy'$$, 'cannot change');
insert into iapp_charges (id, kind, amount, discount, net_amount, service_date, source, source_ref, service, clinic)
  values ('c1','charge',500,0,500,'2026-10-08','MANUAL','r1','كشف','دمنهور');

-- charge shape + idempotency index
select pg_temp.expect_fail($$insert into iapp_charges (id,kind,amount,discount,net_amount,service_date,source,source_ref) values ('c2','charge',500,0,500,'2026-10-08','MANUAL','r1')$$, 'iapp_charges_source_uq');
select pg_temp.expect_fail($$insert into iapp_charges (id,kind,amount,discount,net_amount,service_date,source) values ('c3','charge',500,600,-100,'2026-10-08','MANUAL')$$, 'iapp_charges_charge_shape');
select pg_temp.expect_fail($$insert into iapp_charges (id,kind,amount,discount,net_amount,service_date,source) values ('c4','charge',0,0,0,'2026-10-08','MANUAL')$$, 'iapp_charges_charge_shape');

-- payments: invariants
insert into iapp_payments (id,kind,charge_id,amount,method,account_id,payment_date,source) values ('p1','payment','c1',200,'cash','cash','2026-10-08','COLLECT_MODAL');
select pg_temp.expect_fail($$insert into iapp_payments (id,kind,charge_id,amount,method,account_id,payment_date,source) values ('p2','payment','c1',400,'cash','cash','2026-10-08','COLLECT_MODAL')$$, 'exceeds the outstanding');
select pg_temp.expect_fail($$insert into iapp_payments (id,kind,charge_id,amount,method,account_id,payment_date,source) values ('p3','payment','c1',10,'cash',null,'2026-10-08','COLLECT_MODAL')$$, 'needs an account');
select pg_temp.expect_fail($$insert into iapp_payments (id,kind,charge_id,amount,method,account_id,payment_date,source) values ('p4','payment','c1',10,'cash','nope','2026-10-08','COLLECT_MODAL')$$, 'needs an account');
select pg_temp.expect_fail($$insert into iapp_payments (id,kind,charge_id,amount,method,account_id,payment_date,source) values ('p5','payment','c1',10,'cash','cash','2026-10-08','')$$, 'iapp_payments_source_check');
select pg_temp.expect_fail($$insert into iapp_payments (id,kind,charge_id,amount,method,account_id,payment_date,source) values ('p6','payment','c1',10,'crypto','cash','2026-10-08','X')$$, 'iapp_payments_method_check');
select pg_temp.expect_fail($$insert into iapp_payments (id,kind,charge_id,amount,method,account_id,payment_date,source) values ('p7','payment','c1',-10,'cash','cash','2026-10-08','X')$$, 'iapp_payments_amount_check');
select pg_temp.expect_fail($$insert into iapp_payments (id,kind,charge_id,amount,method,account_id,payment_date,source) values ('p8','refund','c1',10,'cash','cash','2026-10-08','X')$$, 'iapp_payments_refund_reason');
select pg_temp.expect_fail($$insert into iapp_payments (id,kind,charge_id,amount,method,account_id,payment_date,source,reason) values ('p9','refund','c1',300,'cash','cash','2026-10-08','X','r')$$, 'exceeds the amount paid');
insert into iapp_payments (id,kind,charge_id,amount,method,account_id,payment_date,source,reason) values ('r1','refund','c1',50,'cash','cash','2026-10-08','X','خطأ');

-- append-only
select pg_temp.expect_fail($$update iapp_payments set amount = 1 where id = 'p1'$$, 'append-only');
select pg_temp.expect_fail($$delete from iapp_payments where id = 'p1'$$, 'append-only');
select pg_temp.expect_fail($$update iapp_charges set net_amount = 1 where id = 'c1'$$, 'append-only');
select pg_temp.expect_fail($$delete from iapp_charges where id = 'c1'$$, 'append-only');

-- reversal: once, and it restores the outstanding balance
insert into iapp_payments (id,kind,charge_id,amount,method,account_id,payment_date,source,reversal_of,reason) values ('rev1','reversal','c1',200,'cash','cash','2026-10-08','COLLECT_MODAL','p1','مبلغ خاطئ');
select pg_temp.expect_fail($$insert into iapp_payments (id,kind,charge_id,amount,method,account_id,payment_date,source,reversal_of,reason) values ('rev2','reversal','c1',200,'cash','cash','2026-10-08','X','p1','again')$$, 'iapp_payments_one_reversal_uq');
select pg_temp.expect_fail($$insert into iapp_payments (id,kind,charge_id,amount,method,account_id,payment_date,source,reversal_of) values ('rev3','reversal','c1',200,'cash','cash','2026-10-08','X','r1')$$, 'iapp_payments_shape');
do $$ begin
  if iapp_fin_charge_paid('c1') <> -50 + 0 then raise exception 'paid should be -50 (refund of 50, payment reversed) got %', iapp_fin_charge_paid('c1'); end if;
end $$;

-- adjustments cannot go below what is paid
insert into iapp_payments (id,kind,charge_id,amount,method,account_id,payment_date,source) values ('p10','payment','c1',550,'bank_transfer','bank','2026-10-08','COLLECT_MODAL');
select pg_temp.expect_fail($$insert into iapp_charges (id,kind,parent_id,net_amount,service_date,source,reason) values ('a1','adjustment','c1',-100,'2026-10-08','MANUAL','x')$$, 'below the amount already paid');
select pg_temp.expect_fail($$insert into iapp_charges (id,kind,parent_id,net_amount,service_date,source) values ('a2','adjustment','c1',10,'2026-10-08','MANUAL')$$, 'iapp_charges_adjustment_shape');
insert into iapp_charges (id,kind,parent_id,net_amount,service_date,source,reason) values ('a3','adjustment','c1',50,'2026-10-08','MANUAL','زيادة');

-- ledger: lines travel inside the entry, are validated and expanded server-side
insert into iapp_accounting_entries (id,date,type,lines) values ('e1','2026-10-08','charge',
  '[{"id":"e1-l1","ledger":"RECEIVABLE","debit":"500.00","credit":"0.00"},{"id":"e1-l2","ledger":"REVENUE","debit":"0.00","credit":"500.00"}]');
do $$ begin
  if (select count(*) from iapp_accounting_entry_lines where entry_id = 'e1') <> 2 then raise exception 'lines must be expanded from the entry'; end if;
  if exists (select 1 from iapp_fin_ledger_health) then raise exception 'ledger health must be clean'; end if;
end $$;
select pg_temp.expect_fail($$insert into iapp_accounting_entries (id,date,type,lines) values ('e-bad','2026-10-08','charge','[{"ledger":"RECEIVABLE","debit":"5"},{"ledger":"REVENUE","credit":"4"}]')$$, 'unbalanced');
select pg_temp.expect_fail($$insert into iapp_accounting_entries (id,date,type,lines) values ('e-bad','2026-10-08','charge','[{"ledger":"RECEIVABLE","debit":"5","credit":"5"},{"ledger":"REVENUE","credit":"0"}]')$$, 'one non-zero side');
select pg_temp.expect_fail($$insert into iapp_accounting_entries (id,date,type,lines) values ('e-bad','2026-10-08','payment','[{"ledger":"ASSET","accountId":"ghost","debit":"5"},{"ledger":"RECEIVABLE","credit":"5"}]')$$, 'needs an existing account');
select pg_temp.expect_fail($$insert into iapp_accounting_entries (id,date,type,lines) values ('e-bad','2026-10-08','payment','[{"ledger":"CASHBOX","debit":"5"},{"ledger":"RECEIVABLE","credit":"5"}]')$$, 'invalid ledger');
select pg_temp.expect_fail($$insert into iapp_accounting_entries (id,date,type,lines) values ('e-bad','2026-10-08','payment','[]')$$, 'unbalanced');
do $$ begin if exists (select 1 from iapp_accounting_entries where id = 'e-bad') then raise exception 'rejected entry must not exist'; end if; end $$;
select pg_temp.expect_fail($$update iapp_accounting_entries set memo = 'x' where id = 'e1'$$, 'append-only');
select pg_temp.expect_fail($$delete from iapp_accounting_entries where id = 'e1'$$, 'append-only');
select pg_temp.expect_fail($$update iapp_accounting_entry_lines set debit = 1 where id = 'e1-l1'$$, 'append-only');
-- re-sending the same entry (offline retry) must be ignorable by the client (ON CONFLICT DO NOTHING)
insert into iapp_accounting_entries (id,date,type,lines) values ('e1','2026-10-08','charge',
  '[{"id":"e1-l1","ledger":"RECEIVABLE","debit":"500.00","credit":"0.00"},{"id":"e1-l2","ledger":"REVENUE","debit":"0.00","credit":"500.00"}]') on conflict (id) do nothing;
do $$ begin if (select count(*) from iapp_accounting_entry_lines where entry_id = 'e1') <> 2 then raise exception 'retry must not duplicate lines'; end if; end $$;

-- expenses: legacy row migrates to paid; paid is immutable; reversal; no delete
update iapp_expenses set status='paid', account_id='legacy', payment_method='legacy', paid_at='2026-09-10', source='LEGACY_EXPENSE' where id='legacy-e1';
select pg_temp.expect_fail($$update iapp_expenses set amount='1' where id='legacy-e1'$$, 'immutable');
select pg_temp.expect_fail($$delete from iapp_expenses where id='legacy-e1'$$, 'cannot be deleted');
select pg_temp.expect_fail($$insert into iapp_expenses (id,date,category,amount,status) values ('x1','2026-10-08','أخرى','5','paid')$$, 'needs an account');
select pg_temp.expect_fail($$insert into iapp_expenses (id,date,category,amount,status,account_id,payment_method,paid_at) values ('x2','2026-10-08','أخرى','5','paid','ghost','cash','2026-10-08')$$, 'needs an account');
insert into iapp_expenses (id,date,category,amount,status) values ('x3','2026-10-08','أخرى','5','pending');
update iapp_expenses set status='paid', account_id='cash', payment_method='cash', paid_at='2026-10-08' where id='x3';
insert into iapp_expenses (id,date,category,amount,status,account_id,payment_method,paid_at,reversal_of) values ('x3r','2026-10-08','أخرى','5','paid','cash','cash','2026-10-08','x3');
select pg_temp.expect_fail($$insert into iapp_expenses (id,date,category,amount,status,account_id,payment_method,paid_at,reversal_of) values ('x3r2','2026-10-08','أخرى','5','paid','cash','cash','2026-10-08','x3')$$, 'iapp_expenses_one_reversal_uq');
-- a pending one may still be edited and deleted
insert into iapp_expenses (id,date,category,amount,status) values ('x4','2026-10-08','أخرى','5','pending');
update iapp_expenses set amount='6' where id='x4';
delete from iapp_expenses where id='x4';
-- an old client that re-sends an unchanged paid legacy row (no-op upsert) must not break
update iapp_expenses set updated_at = now() where id='legacy-e1';

-- accounts: never deleted; opening balance locked once it has movements
select pg_temp.expect_fail($$delete from iapp_fin_accounts where id='cash'$$, 'never deleted');
insert into iapp_accounting_entries (id,date,type,lines) values ('e2','2026-10-08','payment','[{"ledger":"ASSET","accountId":"bank","debit":"1"},{"ledger":"RECEIVABLE","credit":"1"}]');
select pg_temp.expect_fail($$update iapp_fin_accounts set opening_balance = 5 where id='bank'$$, 'locked');
update iapp_fin_accounts set name = 'Bank (main)', active = true where id = 'bank';

-- reconciliation locks the period
insert into iapp_cash_reconciliations (id,account_id,period_from,period_to,opening,expected,counted,difference,note) values ('rc1','cash','2026-10-01','2026-10-08',0,0,0,0,'');
select pg_temp.expect_fail($$insert into iapp_payments (id,kind,charge_id,amount,method,account_id,payment_date,source) values ('p20','payment','c1',1,'cash','cash','2026-10-07','X')$$, 'reconciled and closed');
select pg_temp.expect_fail($$insert into iapp_cash_reconciliations (id,account_id,period_from,period_to,opening,expected,counted,difference,note) values ('rc2','cash','2026-10-09','2026-10-09',0,0,5,5,'')$$, 'iapp_recon_note');
select pg_temp.expect_fail($$update iapp_cash_reconciliations set counted = 1 where id='rc1'$$, 'append-only');

-- settlements: amounts frozen, only drafts deletable
insert into iapp_doctor_settlements (id,doctor,period_from,period_to,gross_revenue,doctor_share,center_share,remaining_amount) values ('s1','د','2026-10-01','2026-10-31',1000,400,600,400);
select pg_temp.expect_fail($$update iapp_doctor_settlements set doctor_share = 999 where id='s1'$$, 'fixed once created');
update iapp_doctor_settlements set status='approved' where id='s1';
select pg_temp.expect_fail($$delete from iapp_doctor_settlements where id='s1'$$, 'only a draft');
select pg_temp.expect_fail($$insert into iapp_doctor_share_rules (id,mode,value) values ('rule-bad','percent',150)$$, 'iapp_doctor_share_rules_check');

insert into iapp_charges (id,kind,amount,discount,net_amount,service_date,source,source_ref) values ('c-open','charge',500,0,500,'2026-10-08','MANUAL','open-1');
-- RLS ------------------------------------------------------------------------------------
create or replace function pg_temp.as_user(p_email text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claims', json_build_object('email', p_email)::text, false); end $$;

set role authenticated;
select pg_temp.as_user('doc@x.com');
do $$ begin if (select count(*) from iapp_charges) <> 0 then raise exception 'doctor must not read charges'; end if; end $$;
select pg_temp.expect_fail($$insert into iapp_charges (id,kind,amount,discount,net_amount,service_date,source) values ('d1','charge',5,0,5,'2026-10-08','MANUAL')$$, 'row-level security');
select pg_temp.as_user('sec@x.com');
do $$ begin if (select count(*) from iapp_fin_accounts) = 0 then raise exception 'secretary must read accounts'; end if; end $$;
do $$ begin if (select count(*) from iapp_accounting_entries) <> 0 then raise exception 'secretary must not read the ledger'; end if; end $$;
do $$ begin if (select count(*) from iapp_expenses) <> 0 then raise exception 'secretary must not read expenses'; end if; end $$;
insert into iapp_charges (id,kind,amount,discount,net_amount,service_date,source,source_ref) values ('s-c1','charge',100,0,100,'2026-10-08','COLLECT_MODAL','apt-1');
insert into iapp_payments (id,kind,charge_id,amount,method,account_id,payment_date,source) values ('s-p1','payment','s-c1',100,'cash','cash','2026-10-09','COLLECT_MODAL');
insert into iapp_accounting_entries (id,date,type,lines) values ('s-e1','2026-10-09','payment','[{"ledger":"ASSET","accountId":"cash","debit":"100"},{"ledger":"RECEIVABLE","credit":"100"}]');
select pg_temp.expect_fail($$insert into iapp_payments (id,kind,charge_id,amount,method,account_id,payment_date,source,reason) values ('s-r','refund','s-c1',10,'cash','cash','2026-10-09','X','r')$$, 'row-level security');
select pg_temp.expect_fail($$insert into iapp_payments (id,kind,charge_id,amount,method,account_id,payment_date,source) values ('s-l','payment','c-open',1,'legacy','cash','2026-10-09','LEGACY_VISIT')$$, 'row-level security');
select pg_temp.expect_fail($$insert into iapp_accounting_entries (id,date,type,lines) values ('s-e2','2026-10-09','adjustment','[{"ledger":"ASSET","accountId":"cash","debit":"9"},{"ledger":"OVER_SHORT","credit":"9"}]')$$, 'row-level security');
select pg_temp.expect_fail($$insert into iapp_fin_accounts (id,name,type) values ('s-a','x','cash')$$, 'row-level security');
select pg_temp.expect_fail($$insert into iapp_accounting_entry_lines (id,entry_id,ledger,debit) values ('s-l','s-e1','RECEIVABLE',1)$$, 'permission denied');
select pg_temp.expect_fail($$insert into iapp_doctor_settlements (id,period_from,period_to,gross_revenue,doctor_share,center_share,remaining_amount) values ('s-s','2026-10-01','2026-10-02',1,1,0,1)$$, 'row-level security');
do $$ begin if (select count(*) from iapp_payments where id = 's-p1') <> 1 then raise exception 'secretary must see her own fresh payment'; end if; end $$;
select pg_temp.as_user('admin@x.com');
select pg_temp.expect_fail($$insert into iapp_accounting_entry_lines (id,entry_id,ledger,debit) values ('a-l','s-e1','RECEIVABLE',1)$$, 'permission denied');
do $$ begin if (select count(*) from iapp_payments) < 3 then raise exception 'admin reads all payments'; end if; end $$;
reset role;

do $$ begin raise notice 'ALL ACCOUNTING-CORE ASSERTIONS PASSED'; end $$;
