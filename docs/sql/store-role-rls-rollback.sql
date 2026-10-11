-- Rollback of store-role-rls.sql: restores the two original policies (staff_read / staff_write). Safe to run twice.
begin;
set local lock_timeout = '3s';
lock table public.iapp_store in access exclusive mode;
drop policy if exists store_admin_all on public.iapp_store;
drop policy if exists store_secretary_rw on public.iapp_store;
drop policy if exists store_secretary_ro on public.iapp_store;
drop policy if exists staff_read on public.iapp_store;
drop policy if exists staff_write on public.iapp_store;
create policy staff_read on public.iapp_store for select to authenticated
  using (iapp_is_staff() and (key <> all (array['iapp_expenses','iapp_recurring_expenses']) or iapp_is_admin()));
create policy staff_write on public.iapp_store for all to authenticated
  using (iapp_is_staff() and (key <> all (array['iapp_expenses','iapp_recurring_expenses']) or iapp_is_admin()))
  with check (iapp_is_staff() and (key <> all (array['iapp_expenses','iapp_recurring_expenses']) or iapp_is_admin()));
commit;
-- afterwards (when no rollback is needed any more): drop table public.iapp_store_policies_pre_20261012;
