-- Rollback of booking-rate-limit.sql (safe to run twice).
begin;
set local lock_timeout = '3s';
drop trigger if exists iapp_booking_rate_limit_trg on public.iapp_booking_requests;
drop function if exists public.iapp_booking_rate_limit();
commit;
