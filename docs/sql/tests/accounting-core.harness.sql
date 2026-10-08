-- Local test harness for accounting-core.sql (NOT for Supabase). Recreates just enough of the
-- production environment: roles, auth.jwt(), iapp_staff, the three role helpers (copied from the
-- live definitions) and the two legacy expense tables. Run against an EMPTY throwaway database:
--   psql -v ON_ERROR_STOP=1 -f harness.sql -f ../accounting-core.sql -f assertions.sql
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;
create schema if not exists auth;
create or replace function auth.jwt() returns jsonb language sql stable as
$$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
grant usage on schema public, auth to authenticated, anon;

create table public.iapp_staff (email text primary key, role text not null check (role in ('admin','doctor','secretary','employee')), created_at timestamptz default now());
insert into public.iapp_staff values ('admin@x.com','admin'),('sec@x.com','secretary'),('doc@x.com','doctor');

create or replace function public.iapp_has_role(p_roles text[]) returns boolean language sql stable security definer set search_path to 'public' as
$$ select exists (select 1 from public.iapp_staff s where lower(s.email) = lower(auth.jwt() ->> 'email') and s.role = any(p_roles)); $$;
create or replace function public.iapp_is_admin() returns boolean language sql stable security definer set search_path to 'public' as
$$ select exists (select 1 from public.iapp_staff where lower(email)=lower(auth.jwt()->>'email') and role='admin') $$;
create or replace function public.iapp_is_staff() returns boolean language sql stable security definer set search_path to 'public' as
$$ select exists (select 1 from public.iapp_staff where lower(email) = lower(auth.jwt()->>'email')) $$;

create table public.iapp_expenses (id text primary key, date date, category text, amount text, notes text, clinic text, recurring_id text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.iapp_recurring_expenses (id text primary key, category text, amount text, notes text, clinic text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
alter table public.iapp_expenses enable row level security;
create policy admin_expenses on public.iapp_expenses for all to authenticated using (public.iapp_is_admin()) with check (public.iapp_is_admin());
grant all on public.iapp_expenses, public.iapp_recurring_expenses to authenticated;
insert into public.iapp_expenses (id, date, category, amount) values ('legacy-e1', '2026-09-10', 'إيجار', '3000');
insert into public.iapp_recurring_expenses (id, category, amount) values ('legacy-r1', 'إيجار', '3000');
