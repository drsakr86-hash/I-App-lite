-- =====================================================================================
-- ROLLBACK of docs/sql/accounting-core.sql
--
-- READ FIRST
--   1. This DELETES every finance row (charges, payments, ledger, settlements, audit ...).
--      The legacy data (iapp_visits.cost/paid, iapp_appointments, iapp_expenses amounts,
--      iapp_recurring_expenses amounts) is NOT touched, so the old screens keep working.
--   2. Export first if the finance tables contain real data:
--        select * from iapp_charges; select * from iapp_payments; ...   (or run iapp-backup.mjs)
--   3. Roll back the app code too (git revert of the accounting commit) — a new app build talking
--      to a database without these tables will show sync errors for the finance keys.
--   4. Legacy expenses that were converted to status='paid' lose their new columns here; their
--      original date/category/amount/notes/clinic remain, so the old Accounting screen shows them again.
-- =====================================================================================

begin;

drop view if exists public.iapp_fin_ledger_health;

drop trigger if exists iapp_fin_expenses_guard on public.iapp_expenses;
drop index if exists public.iapp_expenses_one_reversal_uq;

alter table public.iapp_expenses drop constraint if exists iapp_expenses_status_chk;
alter table public.iapp_expenses drop constraint if exists iapp_expenses_paid_chk;
alter table public.iapp_recurring_expenses drop constraint if exists iapp_recurring_freq_chk;

-- rows that the new code appended to iapp_expenses (recurring generation, expense reversals) are finance rows
delete from public.iapp_expenses where source in ('RECURRING') or reversal_of is not null;

alter table public.iapp_expenses
  drop column if exists due_date, drop column if exists status, drop column if exists account_id,
  drop column if exists payment_method, drop column if exists created_by, drop column if exists approved_by,
  drop column if exists paid_at, drop column if exists reversal_of, drop column if exists source;

alter table public.iapp_recurring_expenses
  drop column if exists frequency, drop column if exists start_date, drop column if exists end_date,
  drop column if exists next_due_date, drop column if exists active, drop column if exists account_id;

-- append-only guards must go before the tables can be emptied
do $$
declare t text;
begin
  foreach t in array array['iapp_charges','iapp_payments','iapp_accounting_entries','iapp_accounting_entry_lines','iapp_revenue_allocations','iapp_cash_reconciliations','iapp_fin_audit'] loop
    execute format('drop trigger if exists iapp_fin_append_only on public.%I', t);
  end loop;
end $$;

drop trigger if exists iapp_fin_entries_guard on public.iapp_accounting_entries;
drop trigger if exists iapp_fin_entries_expand on public.iapp_accounting_entries;
drop table if exists public.iapp_fin_audit;
drop table if exists public.iapp_cash_reconciliations;
drop table if exists public.iapp_revenue_allocations;
drop table if exists public.iapp_doctor_settlements;
drop table if exists public.iapp_doctor_share_rules;
drop table if exists public.iapp_accounting_entry_lines;
drop table if exists public.iapp_accounting_entries;
drop table if exists public.iapp_payments;
drop table if exists public.iapp_charges;
drop table if exists public.iapp_fin_accounts;

drop function if exists public.iapp_fin_entries_guard();
drop function if exists public.iapp_fin_entries_expand();
drop function if exists public.iapp_fin_block_mutation();
drop function if exists public.iapp_fin_charges_guard();
drop function if exists public.iapp_fin_payments_guard();
drop function if exists public.iapp_fin_expenses_guard();
drop function if exists public.iapp_fin_accounts_guard();
drop function if exists public.iapp_fin_settlements_guard();
drop function if exists public.iapp_fin_charge_net(text);
drop function if exists public.iapp_fin_charge_paid(text);
drop function if exists public.iapp_fin_period_closed(text, date);

commit;
