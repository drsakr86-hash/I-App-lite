-- replica of the production booking table + anon insert policy (read from pg_policies 2026-10-12)
do $$ begin if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if; end $$;
create table public.iapp_booking_requests (id bigint generated always as identity primary key, created_at timestamptz default now(), patient_name text not null,
  phone text not null, clinic text not null, date date not null, time text not null, note text, visit_type text, status text not null default 'pending');
create unique index on public.iapp_booking_requests (clinic, date, time) where status = 'pending';
alter table public.iapp_booking_requests enable row level security;
grant usage on schema public to anon;
grant insert on public.iapp_booking_requests to anon;
create policy public_insert on public.iapp_booking_requests for insert to anon with check (status = 'pending' and date >= current_date and date <= current_date + 60
  and length(patient_name) between 3 and 80 and length(phone) between 8 and 20 and (note is null or length(note) <= 300));
