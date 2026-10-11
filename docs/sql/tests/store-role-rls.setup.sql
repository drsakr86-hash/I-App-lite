-- Local replica of public.iapp_store with the PRODUCTION policies (read from pg_policies 2026-10-12). Run after accounting-core.harness.sql.
create table public.iapp_store (key text primary key, value jsonb not null, updated_at timestamptz not null default now());
alter table public.iapp_store enable row level security;
grant all on public.iapp_store to authenticated;
create policy staff_read on public.iapp_store for select to authenticated
  using (iapp_is_staff() and (key <> all (array['iapp_expenses','iapp_recurring_expenses']) or iapp_is_admin()));
create policy staff_write on public.iapp_store for all to authenticated
  using (iapp_is_staff() and (key <> all (array['iapp_expenses','iapp_recurring_expenses']) or iapp_is_admin()))
  with check (iapp_is_staff() and (key <> all (array['iapp_expenses','iapp_recurring_expenses']) or iapp_is_admin()));
insert into public.iapp_store (key, value)
  select k, '[{"id":1}]'::jsonb from unnest(array['iapp_appointments','iapp_patients','iapp_prices','iapp_visits','iapp_audit','iapp_trash','iapp_users','iapp_doctors',
    'iapp_clinic','iapp_exams','iapp_prescriptions','iapp_imaging_orders','iapp_imgmeta_1','iapp_injections','iapp_custom_tests','iapp_backups','iapp_followup_hidden',
    'iapp_expenses','iapp_recurring_expenses','iapp_future_key']) k;
