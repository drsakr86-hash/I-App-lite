create or replace function pg_temp.anon_insert(phone text, d int, t text) returns text language plpgsql as $$
begin
  set role anon;
  begin
    insert into public.iapp_booking_requests (patient_name, phone, clinic, date, time) values ('اختبار اختبار', phone, 'دمنهور', current_date + d, t);
    reset role; return 'ok';
  exception when others then reset role; return sqlerrm; end;
end $$;
create or replace function pg_temp.expect(got text, want text, what text) returns void language plpgsql as $$
begin if position(want in got) = 0 then raise exception '% : got "%", wanted "%"', what, got, want; end if; end $$;
-- a normal patient: 3 pending requests are fine, the 4th is refused
select pg_temp.expect(pg_temp.anon_insert('01000000001', 1, '09:00'), 'ok', 'req 1');
select pg_temp.expect(pg_temp.anon_insert('01000000001', 1, '09:20'), 'ok', 'req 2');
select pg_temp.expect(pg_temp.anon_insert('01000000001', 1, '09:40'), 'ok', 'req 3');
select pg_temp.expect(pg_temp.anon_insert('01000000001', 1, '10:00'), 'booking_rate_limit', 'req 4 same phone');
-- another phone is not affected
select pg_temp.expect(pg_temp.anon_insert('01000000002', 2, '09:00'), 'ok', 'other phone');
-- after the staff accepts/rejects two of them, the phone may book again (pending < 3) until the 24 h cap (5)
update public.iapp_booking_requests set status = 'accepted' where phone = '01000000001' and time in ('09:00','09:20');
select pg_temp.expect(pg_temp.anon_insert('01000000001', 3, '09:00'), 'ok', 'after accept 4th total');
select pg_temp.expect(pg_temp.anon_insert('01000000001', 3, '09:20'), 'ok', 'after accept 5th total');
select pg_temp.expect(pg_temp.anon_insert('01000000001', 3, '09:40'), 'booking_rate_limit', '6th in 24h');
-- the 24 h window slides: old rows no longer count
update public.iapp_booking_requests set created_at = now() - interval '2 days', status = 'accepted' where phone = '01000000001';
select pg_temp.expect(pg_temp.anon_insert('01000000001', 4, '09:00'), 'ok', 'window slid');
-- existing validation still applies (policy), trigger does not replace it
select pg_temp.expect(pg_temp.anon_insert('123', 1, '11:00'), 'row-level security', 'short phone still refused by the policy');
-- global flood guard: 60 in an hour (distinct phones, spread over dates/times so the slot index is not the limiter)
do $$ declare i int; r text; begin
  delete from public.iapp_booking_requests;
  for i in 1..60 loop
    r := pg_temp.anon_insert('0100001' || lpad(i::text, 4, '0'), 1 + (i / 24), lpad((i % 24)::text, 2, '0') || ':00');
    if r <> 'ok' then raise exception 'flood setup request % failed: %', i, r; end if;
  end loop;
  perform pg_temp.expect(pg_temp.anon_insert('01000099999', 5, '12:00'), 'booking_rate_limit', 'global hourly cap');
end $$;
-- the table is still unreadable to anon, and the trigger function is not callable by it
do $$ begin
  if has_table_privilege('anon', 'public.iapp_booking_requests', 'select') then raise exception 'anon can read the table'; end if;
  if has_function_privilege('anon', 'public.iapp_booking_rate_limit()', 'execute') then raise exception 'anon can execute the trigger function'; end if;
  raise notice 'booking-rate-limit assertions: ALL PASSED';
end $$;
