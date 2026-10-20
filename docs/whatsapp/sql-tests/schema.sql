-- Synthetic replica of the production objects the WhatsApp migration depends on (columns/defaults copied from the live catalog on 2026-10-18).
-- NO real data. Used only on a throwaway local PostgreSQL.
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
grant usage on schema public to anon, authenticated, service_role;
-- Supabase gives service_role full table access through default privileges; the migration revokes only from public/anon/authenticated.
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
create schema auth;
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('test.jwt', true), ''), '{}')::jsonb $$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.jwt() to anon, authenticated, service_role;
create table public.iapp_staff (email text primary key, role text not null, created_at timestamptz not null default now());
create function public.iapp_has_role(p_roles text[]) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.iapp_staff s where lower(s.email) = lower(coalesce(auth.jwt() ->> 'email', '')) and s.role = any (p_roles)) $$;
grant execute on function public.iapp_has_role(text[]) to anon, authenticated, service_role;
create table public.iapp_appointments (
  id bigint primary key, patient_id bigint, patient text not null default '', phone text, date date not null, time text, type text, doctor text, clinic text, notes text,
  confirmed boolean not null default false, from_patient boolean not null default false, cancelled boolean not null default false, wait_status text,
  arrived_at bigint, called_at bigint, in_at bigint, done_at bigint, no_show_at bigint, queue_number int, cost text, paid boolean not null default false, reminded text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.iapp_booking_requests (
  id bigint generated always as identity primary key, created_at timestamptz default now(), patient_name text not null, phone text not null, clinic text not null,
  date date not null, time text not null, note text, visit_type text, status text not null default 'pending');
