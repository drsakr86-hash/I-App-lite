-- booking-rate-limit.sql  (audit F-12) — flood guard for the PUBLIC booking form. NOT APPLIED until the owner approves.
-- Today anon can insert into iapp_booking_requests with only field-length checks: a script can post thousands of rows (fills the table,
-- hides real requests, fills every slot of iapp_slots_taken). Real volume is tiny (8 requests ever, max 1 per phone).
-- The trigger (SECURITY DEFINER because anon cannot read the table) rejects an insert when:
--   * the same phone already has >= 3 requests still 'pending', or >= 5 requests in the last 24 hours;
--   * the whole table received >= 60 requests in the last hour, or holds >= 300 pending rows.
-- It never touches existing rows and never affects staff updates (INSERT only). The error text contains 'booking_rate_limit'.
-- Safety: one transaction, 3 s lock timeout, G0 (trigger absent), G1 (trigger present). Rollback: booking-rate-limit-rollback.sql.
begin;
set local lock_timeout = '3s';
lock table public.iapp_booking_requests in share row exclusive mode;
set local lock_timeout = '10s';

do $$ begin
  if exists (select 1 from pg_trigger where tgrelid = 'public.iapp_booking_requests'::regclass and tgname = 'iapp_booking_rate_limit_trg' and not tgisinternal) then
    raise exception 'ABORT G0: trigger already exists. Nothing was changed.';
  end if;
end $$;

create or replace function public.iapp_booking_rate_limit() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_phone int; v_phone_day int; v_hour int; v_pending int;
begin
  select count(*) filter (where status = 'pending'), count(*) filter (where created_at > now() - interval '24 hours')
    into v_phone, v_phone_day from public.iapp_booking_requests where phone = new.phone;
  if v_phone >= 3 or v_phone_day >= 5 then raise exception 'booking_rate_limit: too many requests for this phone' using errcode = 'P0001'; end if;
  select count(*) filter (where created_at > now() - interval '1 hour'), count(*) filter (where status = 'pending')
    into v_hour, v_pending from public.iapp_booking_requests;
  if v_hour >= 60 or v_pending >= 300 then raise exception 'booking_rate_limit: too many requests, try later' using errcode = 'P0001'; end if;
  return new;
end $$;
revoke all on function public.iapp_booking_rate_limit() from public, anon, authenticated;

create trigger iapp_booking_rate_limit_trg before insert on public.iapp_booking_requests
  for each row execute function public.iapp_booking_rate_limit();

do $$ begin
  if not exists (select 1 from pg_trigger where tgrelid = 'public.iapp_booking_requests'::regclass and tgname = 'iapp_booking_rate_limit_trg' and not tgisinternal) then
    raise exception 'ABORT G1: trigger missing. Nothing was changed.';
  end if;
end $$;
commit;
