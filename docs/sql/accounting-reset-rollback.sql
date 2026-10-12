-- accounting-reset-rollback.sql — restores the books exactly as they were before accounting-reset.sql, from the private backup tables.
-- Run only if the reset was applied and you want the OLD books back (anything entered after the reset is removed by this restore).
begin;
set local lock_timeout = '3s';
lock table public.iapp_payments, public.iapp_accounting_entry_lines, public.iapp_accounting_entries, public.iapp_charges, public.iapp_expenses,
  public.iapp_fin_audit, public.iapp_recurring_expenses, public.iapp_fin_accounts in access exclusive mode;
do $$ begin
  if to_regclass('public.iapp_payments_reset_20261012') is null then raise exception 'ABORT: backup tables not found. Nothing was changed.'; end if;
end $$;
alter table public.iapp_payments disable trigger user; alter table public.iapp_accounting_entry_lines disable trigger user;
alter table public.iapp_accounting_entries disable trigger user; alter table public.iapp_charges disable trigger user;
alter table public.iapp_expenses disable trigger user; alter table public.iapp_fin_audit disable trigger user; alter table public.iapp_fin_accounts disable trigger user;
delete from public.iapp_payments; delete from public.iapp_accounting_entry_lines; delete from public.iapp_accounting_entries; delete from public.iapp_charges;
delete from public.iapp_expenses; delete from public.iapp_fin_audit;
delete from public.iapp_fin_accounts;
insert into public.iapp_fin_accounts select * from public.iapp_fin_accounts_reset_20261012;
update public.iapp_recurring_expenses r set account_id = b.account_id from public.iapp_recurring_expenses_reset_20261012 b where b.id = r.id;
insert into public.iapp_charges select * from public.iapp_charges_reset_20261012;
insert into public.iapp_payments select * from public.iapp_payments_reset_20261012;
insert into public.iapp_accounting_entries select * from public.iapp_accounting_entries_reset_20261012;
insert into public.iapp_accounting_entry_lines select * from public.iapp_accounting_entry_lines_reset_20261012;
insert into public.iapp_expenses select * from public.iapp_expenses_reset_20261012;
insert into public.iapp_fin_audit select * from public.iapp_fin_audit_reset_20261012;
update public.iapp_store s set value = b.value from public.iapp_store_reset_20261012 b where b.key = s.key and s.key = 'iapp_expenses';
alter table public.iapp_payments enable trigger user; alter table public.iapp_accounting_entry_lines enable trigger user;
alter table public.iapp_accounting_entries enable trigger user; alter table public.iapp_charges enable trigger user;
alter table public.iapp_expenses enable trigger user; alter table public.iapp_fin_audit enable trigger user; alter table public.iapp_fin_accounts enable trigger user;
commit;
-- the *_reset_20261012 backup tables are kept; drop them yourself when no longer needed.
