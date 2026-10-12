-- accounting-reset.sql — owner-requested fresh start of the accounting books (2026-10-12). DESTRUCTIVE, but fully backed up. NOT APPLIED until the owner pastes it.
-- WHAT IT DOES (one transaction):
--   1. Copies every row it is about to remove into PRIVATE backup tables (RLS on, all API roles revoked), suffix _reset_20261012.
--   2. Deletes: iapp_payments, iapp_accounting_entry_lines, iapp_accounting_entries, iapp_charges, iapp_expenses, iapp_fin_audit
--      (the append-only triggers are disabled only inside this transaction and re-enabled before COMMIT).
--   3. Deletes the two old accounts 'acc-main-cash' and 'acc-legacy' (balance 0). The 2 recurring-expense templates that pointed at
--      'acc-main-cash' are kept but get account_id = NULL (pick the right cashbox when you next use them).
--   4. Sets opening_balance = 5000 on the Damanhour and Rahmaniya accounts and creates a third cash account 'مركز دمنهور للعيون'
--      with opening balance 0 (for the monthly lump sum).
--   5. Empties the legacy KV blob iapp_expenses (3 old items). Recurring blob, appointments (cost/paid flags), patients, visits: UNTOUCHED.
-- AFTER: books are empty; every device must reload the app once. A device that still holds an unsent finance batch from before could
--   re-send old rows — tell the secretaries to open the app online and wait for "synced" BEFORE you run this.
-- Safety: lock_timeout 3 s on all tables (55P03 = nothing changed); G0 refuses unless the accounts are exactly the 4 known ids and there are
--   no doctor settlements / reconciliations / revenue allocations; G1 verifies the end state. Rollback: accounting-reset-rollback.sql (restores from the backups).
begin;
set local lock_timeout = '3s';
lock table public.iapp_payments, public.iapp_accounting_entry_lines, public.iapp_accounting_entries, public.iapp_charges, public.iapp_expenses,
  public.iapp_fin_audit, public.iapp_recurring_expenses, public.iapp_fin_accounts, public.iapp_doctor_settlements, public.iapp_cash_reconciliations,
  public.iapp_revenue_allocations in access exclusive mode;
set local lock_timeout = '10s';

do $$
declare n_set int; n_rec int; n_alloc int; ids text;
begin
  select string_agg(id, ',' order by id) into ids from public.iapp_fin_accounts;
  if (select count(*) from public.iapp_fin_accounts) <> 4
     or not exists (select 1 from public.iapp_fin_accounts where id = 'acc-main-cash' and opening_balance = 0)
     or not exists (select 1 from public.iapp_fin_accounts where id = 'acc-legacy' and opening_balance = 0)
     or (select count(*) from public.iapp_fin_accounts where id like 'acc-%' and name = 'دمنهور' and type = 'cash' and clinic = 'دمنهور') <> 1
     or (select count(*) from public.iapp_fin_accounts where id like 'acc-%' and name = 'الرحمانية' and type = 'cash' and clinic = 'الرحمانية') <> 1 then
    raise exception 'ABORT G0: accounts are not exactly {Main cashbox, Legacy, دمنهور, الرحمانية} (found: %). Nothing was changed.', ids;
  end if;
  select count(*) into n_set from public.iapp_doctor_settlements;
  select count(*) into n_rec from public.iapp_cash_reconciliations;
  select count(*) into n_alloc from public.iapp_revenue_allocations;
  if n_set + n_rec + n_alloc <> 0 then raise exception 'ABORT G0: settlements/reconciliations/allocations exist (% / % / %). Nothing was changed.', n_set, n_rec, n_alloc; end if;
  if to_regclass('public.iapp_payments_reset_20261012') is not null then raise exception 'ABORT G0: backup tables from a previous reset exist. Nothing was changed.'; end if;
  raise notice 'about to remove: charges=% payments=% entries=% lines=% expenses=% audit=%',
    (select count(*) from public.iapp_charges), (select count(*) from public.iapp_payments), (select count(*) from public.iapp_accounting_entries),
    (select count(*) from public.iapp_accounting_entry_lines), (select count(*) from public.iapp_expenses), (select count(*) from public.iapp_fin_audit);
end $$;

-- 1. private backups
create table public.iapp_payments_reset_20261012 as table public.iapp_payments;
create table public.iapp_accounting_entry_lines_reset_20261012 as table public.iapp_accounting_entry_lines;
create table public.iapp_accounting_entries_reset_20261012 as table public.iapp_accounting_entries;
create table public.iapp_charges_reset_20261012 as table public.iapp_charges;
create table public.iapp_expenses_reset_20261012 as table public.iapp_expenses;
create table public.iapp_fin_audit_reset_20261012 as table public.iapp_fin_audit;
create table public.iapp_recurring_expenses_reset_20261012 as table public.iapp_recurring_expenses;
create table public.iapp_fin_accounts_reset_20261012 as table public.iapp_fin_accounts;
create table public.iapp_store_reset_20261012 as select key, value from public.iapp_store where key in ('iapp_expenses', 'iapp_recurring_expenses');
do $$
declare t text;
begin
  foreach t in array array['iapp_payments','iapp_accounting_entry_lines','iapp_accounting_entries','iapp_charges','iapp_expenses','iapp_fin_audit','iapp_recurring_expenses','iapp_fin_accounts','iapp_store'] loop
    execute format('alter table public.%I enable row level security', t || '_reset_20261012');
    execute format('revoke all on public.%I from public, anon, authenticated', t || '_reset_20261012');
    if exists (select 1 from pg_roles where rolname = 'service_role') then execute format('revoke all on public.%I from service_role', t || '_reset_20261012'); end if;
  end loop;
end $$;

-- 2. wipe (append-only / guard triggers off only for this transaction)
alter table public.iapp_payments disable trigger user;
alter table public.iapp_accounting_entry_lines disable trigger user;
alter table public.iapp_accounting_entries disable trigger user;
alter table public.iapp_charges disable trigger user;
alter table public.iapp_expenses disable trigger user;
alter table public.iapp_fin_audit disable trigger user;
alter table public.iapp_fin_accounts disable trigger user;

delete from public.iapp_payments;
delete from public.iapp_accounting_entry_lines;
delete from public.iapp_accounting_entries;
delete from public.iapp_charges;
delete from public.iapp_expenses;
delete from public.iapp_fin_audit;

-- 3. old accounts (recurring templates keep existing, unassigned)
update public.iapp_recurring_expenses set account_id = null where account_id in ('acc-main-cash', 'acc-legacy');
delete from public.iapp_fin_accounts where id in ('acc-main-cash', 'acc-legacy');

-- 4. opening balances + the center account
update public.iapp_fin_accounts set opening_balance = 5000, updated_at = now() where name = 'دمنهور' and clinic = 'دمنهور' and id like 'acc-%';
update public.iapp_fin_accounts set opening_balance = 5000, updated_at = now() where name = 'الرحمانية' and clinic = 'الرحمانية' and id like 'acc-%';
insert into public.iapp_fin_accounts (id, name, type, clinic, active, opening_balance, is_legacy, created_by)
  values ('acc-' || gen_random_uuid()::text, 'مركز دمنهور للعيون', 'cash', 'مركز دمنهور للعيون', true, 0, false, 'accounting-reset-20261012');

alter table public.iapp_payments enable trigger user;
alter table public.iapp_accounting_entry_lines enable trigger user;
alter table public.iapp_accounting_entries enable trigger user;
alter table public.iapp_charges enable trigger user;
alter table public.iapp_expenses enable trigger user;
alter table public.iapp_fin_audit enable trigger user;
alter table public.iapp_fin_accounts enable trigger user;

-- 5. legacy KV blob
update public.iapp_store set value = '[]'::jsonb where key = 'iapp_expenses';

do $$
begin
  if (select count(*) from public.iapp_payments) + (select count(*) from public.iapp_accounting_entries) + (select count(*) from public.iapp_accounting_entry_lines)
     + (select count(*) from public.iapp_charges) + (select count(*) from public.iapp_expenses) + (select count(*) from public.iapp_fin_audit) <> 0 then
    raise exception 'ABORT G1: ledger tables are not empty. Nothing was changed.';
  end if;
  if (select count(*) from public.iapp_fin_accounts) <> 3
     or (select count(*) from public.iapp_fin_accounts where name = 'دمنهور' and opening_balance = 5000) <> 1
     or (select count(*) from public.iapp_fin_accounts where name = 'الرحمانية' and opening_balance = 5000) <> 1
     or (select count(*) from public.iapp_fin_accounts where name = 'مركز دمنهور للعيون' and opening_balance = 0 and active) <> 1 then
    raise exception 'ABORT G1: accounts are not the expected three. Nothing was changed.';
  end if;
  if exists (select 1 from pg_trigger where tgrelid in ('public.iapp_payments'::regclass, 'public.iapp_charges'::regclass, 'public.iapp_accounting_entries'::regclass,
       'public.iapp_accounting_entry_lines'::regclass, 'public.iapp_expenses'::regclass, 'public.iapp_fin_audit'::regclass, 'public.iapp_fin_accounts'::regclass)
       and not tgisinternal and tgenabled <> 'O') then
    raise exception 'ABORT G1: a trigger is still disabled. Nothing was changed.';
  end if;
  if (select count(*) from public.iapp_recurring_expenses) <> (select count(*) from public.iapp_recurring_expenses_reset_20261012) then
    raise exception 'ABORT G1: recurring templates changed in number. Nothing was changed.';
  end if;
end $$;
commit;
