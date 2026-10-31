-- Assertions for messenger-channels.sql (run after assertions.sql on the same throwaway DB, with the migration applied).
create function pg_temp.eq(got anyelement, want anyelement, what text) returns void language plpgsql as $$
begin if got is distinct from want then raise exception 'ASSERT FAILED: % : got [%], wanted [%]', what, got, want; end if; end $$;
create function pg_temp.fails(sql text, want text, what text) returns void language plpgsql as $$
begin
  begin execute sql; exception when others then
    if position(want in sqlerrm) = 0 then raise exception 'ASSERT FAILED: % : wrong error [%] (wanted [%])', what, sqlerrm, want; end if; return; end;
  raise exception 'ASSERT FAILED: % : did not fail', what;
end $$;

-- ---- existing WhatsApp rows were kept as channel whatsapp
select pg_temp.eq((select count(*) from public.wa_contacts where channel <> 'whatsapp')::int, 0, 'existing contacts = whatsapp');

-- ---- Messenger / Instagram ingest: own contact per channel, idempotent, the same numeric id on two channels = two people
do $$ declare r jsonb; c0 int; begin
  c0 := (select count(*) from public.wa_contacts);
  set local role service_role;
  r := public.wa_ingest_inbound_ch('messenger', '24816357900112233', null, 'm_AAA1', 'text', 'السلام عليكم', now());
  perform pg_temp.eq(r ->> 'duplicate', 'false', 'messenger first ingest');
  r := public.wa_ingest_inbound_ch('messenger', '24816357900112233', null, 'm_AAA1', 'text', 'السلام عليكم', now());
  perform pg_temp.eq(r ->> 'duplicate', 'true', 'messenger duplicate');
  r := public.wa_ingest_inbound_ch('instagram', '24816357900112233', null, 'ig_AAA1', 'text', 'hi', now());
  perform pg_temp.eq(r ->> 'duplicate', 'false', 'instagram first ingest');
  reset role;
  perform pg_temp.eq((select count(*) from public.wa_contacts)::int, c0 + 2, 'two new contacts');
  perform pg_temp.eq((select count(*) from public.wa_contacts where wa_id = '24816357900112233')::int, 2, 'same id, two channels');
end $$;
select pg_temp.fails($$ select public.wa_ingest_inbound_ch('telegram', '123456', null, 'x1', 'text', 'b', now()) $$, 'missing ids', 'unknown channel rejected');
select pg_temp.fails($$ select public.wa_ingest_inbound_ch('messenger', 'abc', null, 'x2', 'text', 'b', now()) $$, 'wa_contacts_wa_id_digits', 'non-numeric psid rejected');
-- a 17-digit PSID is fine for Messenger but still not a valid WhatsApp number
select pg_temp.fails($$ select public.wa_ingest_inbound('24816357900112299', null, 'wamid.LONG', 'text', 'b', now()) $$, 'wa_contacts_wa_id_digits', 'whatsapp keeps 8..15 digits');

-- ---- old WhatsApp entry points still work and keep their de-duplication key
do $$ declare r jsonb; begin
  set local role service_role;
  r := public.wa_ingest_inbound('201055566677', 'سارة', 'wamid.M1', 'text', 'ازيك', now());
  perform pg_temp.eq(r ->> 'duplicate', 'false', 'wa via old function');
  r := public.wa_ingest_inbound_ch('whatsapp', '201055566677', 'سارة', 'wamid.M1', 'text', 'ازيك', now());
  perform pg_temp.eq(r ->> 'duplicate', 'true', 'same wamid through the new function = duplicate');
  reset role;
  perform pg_temp.eq((select channel from public.wa_contacts where wa_id = '201055566677'), 'whatsapp', 'channel whatsapp');
end $$;

-- ---- echo from Meta Business Suite: human reply, AI stops, nobody auto-assigned
do $$ declare v_conv bigint; begin
  select cv.id into v_conv from public.wa_conversations cv join public.wa_contacts ct on ct.id = cv.contact_id where ct.channel = 'messenger' and ct.wa_id = '24816357900112233';
  set local role service_role;
  perform public.wa_ingest_echo_ch('messenger', '24816357900112233', 'm_ECHO1', 'text', 'أهلا بحضرتك', now());
  reset role;
  perform pg_temp.eq((select sent_by from public.wa_messages where provider_message_id = 'm_ECHO1'), 'meta-inbox', 'echo sent_by');
  perform pg_temp.eq((select status from public.wa_conversations where id = v_conv), 'handoff', 'echo hands over');
  perform pg_temp.eq((select assigned_to from public.wa_conversations where id = v_conv), null::text, 'echo assigns nobody');
end $$;

-- ---- outbound claim carries the channel
do $$ declare v_conv bigint; r record; begin
  select cv.id into v_conv from public.wa_conversations cv join public.wa_contacts ct on ct.id = cv.contact_id where ct.channel = 'instagram';
  set local role service_role;
  perform public.wa_enqueue_text(v_conv, 'staff', 'manual', 'رد السكرتارية', 'test:ig:1', 'sec@x.com');
  update public.wa_messages set next_attempt_at = now() + interval '1 hour' where direction = 'out' and status = 'queued' and idempotency_key <> 'test:ig:1';
  select * into r from public.wa_claim_outbound(10) where conversation_id = v_conv;
  -- Instagram echoes our own reply before we stored its id: recognised as ours by its text, no handoff
  perform public.wa_ingest_echo_ch('instagram', '24816357900112233', 'ig_ECHO_OWN', 'text', 'رد السكرتارية', now());
  reset role;
  perform pg_temp.eq(r.channel, 'instagram', 'claim returns channel');
  perform pg_temp.eq(r.wa_id, '24816357900112233', 'claim returns igsid');
  perform pg_temp.eq((select count(*) from public.wa_messages where provider_message_id = 'ig_ECHO_OWN')::int, 0, 'own echo ignored');
end $$;

-- ---- reminders / consent never touch Messenger or Instagram contacts
do $$ declare v_ct bigint; begin
  set local role service_role;
  perform public.wa_set_consent('24816357900112233', true, false, 'chat');
  reset role;
  perform pg_temp.eq((select count(*) from public.wa_contacts where channel <> 'whatsapp' and reminders_opt_in)::int, 0, 'consent is whatsapp only');
end $$;
do $$ declare v_ct bigint; begin
  select id into v_ct from public.wa_contacts where channel = 'messenger';
  perform set_config('test.jwt', '{"email":"sec@x.com"}', true);
  set local role authenticated;
  perform pg_temp.fails(format('select public.wa_staff_set_reminder_consent(%s, true)', v_ct), 'reminders_whatsapp_only', 'staff cannot opt messenger into reminders');
  reset role;
end $$;

-- ---- booking request from Messenger: typed phone, note names the channel; the typed phone is stored for the secretary
do $$ declare v_conv bigint; r jsonb; d date := current_date + 30; begin
  select cv.id into v_conv from public.wa_conversations cv join public.wa_contacts ct on ct.id = cv.contact_id where ct.channel = 'messenger';
  set local role service_role;
  r := public.wa_create_booking_request(v_conv, '01098765432', 'دمنهور', d, '20:10', 'أحمد علي', null, null);
  perform public.wa_set_contact_phone(v_conv, '+20 109 876 5432');
  perform public.wa_set_contact_phone(v_conv, 'garbage');
  reset role;
  perform pg_temp.eq(r ->> 'ok', 'true', 'messenger request ok');
  perform pg_temp.eq((select note from public.iapp_booking_requests where id = (r ->> 'request_id')::bigint), 'ماسنجر', 'request note = channel');
  perform pg_temp.eq((select phone from public.iapp_booking_requests where id = (r ->> 'request_id')::bigint), '01098765432', 'request phone');
  perform pg_temp.eq((select phone from public.wa_contacts where channel = 'messenger'), '01098765432', 'typed phone kept, garbage ignored');
end $$;

-- ---- privileges
select pg_temp.eq(has_function_privilege('authenticated', 'public.wa_ingest_inbound_ch(text,text,text,text,text,text,timestamptz)', 'execute'), false, 'ingest_ch not for browsers');
select pg_temp.eq(has_function_privilege('authenticated', 'public.wa_set_contact_phone(bigint,text)', 'execute'), false, 'set phone not for browsers');
select pg_temp.eq(has_function_privilege('authenticated', 'public.wa_claim_outbound(integer)', 'execute'), false, 'claim not for browsers');
select pg_temp.eq(has_function_privilege('service_role', 'public.wa_claim_outbound(integer)', 'execute'), true, 'claim for service_role');
do $$ begin raise notice 'messenger assertions: all passed'; end $$;
