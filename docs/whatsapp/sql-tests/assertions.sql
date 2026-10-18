-- Functional / security assertions for whatsapp-assistant.sql on a throwaway PG. Raises on the first failure.
create function pg_temp.eq(got anyelement, want anyelement, what text) returns void language plpgsql as $$
begin if got is distinct from want then raise exception 'ASSERT FAILED: % : got [%], wanted [%]', what, got, want; end if; end $$;
create function pg_temp.fails(sql text, want text, what text) returns void language plpgsql as $$
begin
  begin execute sql; exception when others then
    if position(want in sqlerrm) = 0 then raise exception 'ASSERT FAILED: % : wrong error [%] (wanted [%])', what, sqlerrm, want; end if; return; end;
  raise exception 'ASSERT FAILED: % : did not fail', what;
end $$;

insert into public.iapp_staff values ('admin@x.com','admin'), ('sec@x.com','secretary'), ('doc@x.com','doctor');
reset role;

-- ---- phone normalisation (same as the app's normPhone)
select pg_temp.eq(public.wa_norm_phone('201012345678'), '01012345678', 'wa_id -> local');
select pg_temp.eq(public.wa_norm_phone('+20 101 234 5678'), '01012345678', 'formatted');
select pg_temp.eq(public.wa_norm_phone('0020 10 1234 5678'), '01012345678', '0020 prefix');

-- ---- ingest: idempotent, creates contact + conversation
do $$ declare r jsonb; begin
  set local role service_role;
  r := public.wa_ingest_inbound('201012345678', 'منى', 'wamid.A1', 'text', 'عايزة احجز', now());
  perform pg_temp.eq(r ->> 'duplicate', 'false', 'first ingest');
  r := public.wa_ingest_inbound('201012345678', 'منى', 'wamid.A1', 'text', 'عايزة احجز', now());
  perform pg_temp.eq(r ->> 'duplicate', 'true', 'duplicate webhook');
  reset role;
  perform pg_temp.eq((select count(*) from public.wa_messages)::int, 1, 'one message');
  perform pg_temp.eq((select unread_count from public.wa_conversations)::int, 1, 'unread counted once');
  perform pg_temp.eq((select last_preview from public.wa_conversations), 'عايزة احجز', 'preview');
end $$;
select pg_temp.fails($$ select public.wa_ingest_inbound('abc', 'x', 'w', 'text', 'b', now()) $$, 'wa_contacts_wa_id_digits', 'non-numeric wa_id rejected');
select pg_temp.fails($$ select public.wa_ingest_inbound('201012345678', 'x', null, 'text', 'b', now()) $$, 'missing ids', 'missing wamid rejected');

-- ---- non-text inbound is stored without body
do $$ begin
  set local role service_role; perform public.wa_ingest_inbound('201012345678', 'منى', 'wamid.IMG', 'image', null, now()); reset role;
  perform pg_temp.eq((select kind from public.wa_messages where provider_message_id = 'wamid.IMG'), 'other', 'image kind');
end $$;

-- ---- status: forward only, failed never overrides delivered, early status is kept pending and applied later
do $$ declare c bigint; m bigint; begin
  select id into c from public.wa_conversations;
  set local role service_role;
  m := public.wa_enqueue_text(c, 'staff', 'manual', 'اهلا', 'k-status', 'sec@x.com');
  reset role;
  update public.wa_messages set status = 'sent', provider_message_id = 'wamid.OUT1' where id = m;
  set local role service_role;
  perform public.wa_record_status_event('wamid.OUT1', 'delivered', now(), null, null);
  perform public.wa_record_status_event('wamid.OUT1', 'sent', now(), null, null);        -- late/out-of-order: must not go backwards
  perform pg_temp.eq((select status from public.wa_messages where id = m), 'delivered', 'delivered stays');
  perform public.wa_record_status_event('wamid.OUT1', 'read', now(), null, null);
  perform public.wa_record_status_event('wamid.OUT1', 'failed', now(), '131026', 'x');   -- failed after read: ignored
  perform pg_temp.eq((select status from public.wa_messages where id = m), 'read', 'read not overridden by failed');
  perform public.wa_record_status_event('wamid.OUT1', 'read', now(), null, null);        -- duplicate event
  perform public.wa_record_status_event('wamid.FUTURE', 'delivered', now(), null, null); -- unknown yet
  perform pg_temp.eq((select applied from public.wa_webhook_events where event_key = 'st:wamid.FUTURE:delivered'), false, 'unknown stays pending');
  reset role;
end $$;

-- ---- staff message (inbox or phone-app echo) hands the conversation to a human and AI replies are never sent afterwards
do $$ declare c bigint; ai bigint; n int; begin
  select id into c from public.wa_conversations;
  update public.wa_conversations set ai_enabled = true, status = 'ai', handoff_reason = null, assigned_to = null;   -- the earlier staff message had handed it over
  perform pg_temp.eq((select ai_enabled from public.wa_conversations where id = c), true, 'AI on at the start');
  set local role service_role;
  ai := public.wa_enqueue_text(c, 'ai', 'reply', 'رد الذكاء', 'k-ai-1', null);
  perform pg_temp.eq(ai is not null, true, 'AI reply queued while AI owns the chat');
  perform public.wa_ingest_echo('201012345678', 'wamid.ECHO1', 'text', 'تمام يا فندم', now());   -- secretary typed on the phone
  reset role;
  perform pg_temp.eq((select ai_enabled from public.wa_conversations where id = c), false, 'echo disables AI');
  perform pg_temp.eq((select status from public.wa_conversations where id = c), 'handoff', 'echo => handoff');
  set local role service_role;
  perform pg_temp.eq(public.wa_enqueue_text(c, 'ai', 'reply', 'رد تاني', 'k-ai-2', null) is null, true, 'AI cannot queue during handoff');
  select count(*) into n from public.wa_claim_outbound(50) where sender = 'ai';
  reset role;
  perform pg_temp.eq(n, 0, 'queued AI reply is withdrawn at claim time');
  perform pg_temp.eq((select status from public.wa_messages where id = ai), 'cancelled', 'AI reply cancelled');
  set local role service_role; perform public.wa_ingest_echo('201012345678', 'wamid.ECHO1', 'text', 'تمام يا فندم', now()); reset role;   -- duplicate echo
  perform pg_temp.eq((select count(*) from public.wa_messages where provider_message_id = 'wamid.ECHO1')::int, 1, 'echo deduplicated');
end $$;

-- ---- outbound outcomes: retry vs uncertain vs failed; stuck 'sending' is never auto-resent
do $$ declare c bigint; a bigint; b bigint; d bigint; begin
  select id into c from public.wa_conversations;
  set local role service_role;
  a := public.wa_enqueue_text(c, 'staff', 'manual', 'a', 'k-a', 's@x'); b := public.wa_enqueue_text(c, 'staff', 'manual', 'b', 'k-b', 's@x'); d := public.wa_enqueue_text(c, 'staff', 'manual', 'd', 'k-d', 's@x');
  perform pg_temp.eq(public.wa_enqueue_text(c, 'staff', 'manual', 'a again', 'k-a', 's@x') is null, true, 'idempotency key blocks duplicate queueing');
  perform * from public.wa_claim_outbound(50);
  perform public.wa_finish_outbound(a, 'retry', null, '131000', 'transient', 0);
  perform public.wa_finish_outbound(b, 'uncertain', null, null, 'timeout');
  perform public.wa_finish_outbound(d, 'sent', 'wamid.D', null, null);
  reset role;
  perform pg_temp.eq((select status from public.wa_messages where id = a), 'queued', 'transient error => requeued');
  perform pg_temp.eq((select status || '/' || error_code from public.wa_messages where id = b), 'failed/UNCERTAIN_DELIVERY', 'timeout => uncertain, not retried');
  perform pg_temp.eq((select status from public.wa_messages where id = d), 'sent', 'sent');
  update public.wa_messages set status = 'sending', claimed_at = now() - interval '10 minutes' where id = a;
  set local role service_role; perform public.wa_reap_stuck(); reset role;
  perform pg_temp.eq((select status || '/' || error_code from public.wa_messages where id = a), 'failed/UNCERTAIN_DELIVERY', 'stuck sending => uncertain (never auto-resent)');
  -- retries are capped
  update public.wa_messages set status = 'sending', attempts = 5 where id = a;
  set local role service_role; perform public.wa_finish_outbound(a, 'retry', null, 'x', 'y', 0); reset role;
  perform pg_temp.eq((select error_code from public.wa_messages where id = a), 'RETRIES_EXHAUSTED', 'retries capped at 5');
end $$;

-- ---- appointments: availability, ownership, double booking, idempotency, verified persistence
do $$ declare r jsonb; apt bigint; d date := current_date + 2; n int; begin
  set local role service_role;
  r := public.wa_book_appointment(null, '201012345678', 'دمنهور', 'د. عبدالستار', d, '20:10', 'منى أحمد', 'فحص روتيني');
  perform pg_temp.eq(r ->> 'ok', 'true', 'booking ok'); apt := (r ->> 'appointment_id')::bigint;
  r := public.wa_book_appointment(null, '201012345678', 'دمنهور', 'د. عبدالستار', d, '20:10', 'منى أحمد', 'فحص روتيني');
  perform pg_temp.eq(r ->> 'duplicate', 'true', 'retry => same booking, not a second one');
  r := public.wa_book_appointment(null, '201077777777', 'دمنهور', 'د. عبدالستار', d, '20:10', 'سلمى', 'فحص روتيني');
  perform pg_temp.eq(r ->> 'error', 'slot_taken', 'other patient, same slot => refused');
  r := public.wa_book_appointment(null, '201077777777', 'الرحمانية', 'د. عبدالستار', d, '20:10', 'سلمى', 'فحص روتيني');
  perform pg_temp.eq(r ->> 'error', 'slot_taken', 'same doctor cannot be in two clinics at once');
  r := public.wa_book_appointment(null, '201077777777', 'دمنهور', 'د. عبدالستار', null, '20:20', 'سلمى', 'x');
  perform pg_temp.eq(r ->> 'error', 'invalid', 'missing date is refused (never defaulted)');
  r := public.wa_book_appointment(null, '201077777777', 'دمنهور', 'د. عبدالستار', d, '', 'سلمى', 'x');
  perform pg_temp.eq(r ->> 'error', 'invalid', 'missing time refused');
  r := public.wa_book_appointment(null, '', 'دمنهور', 'د. عبدالستار', d, '20:30', 'سلمى', 'x');
  perform pg_temp.eq(r ->> 'error', 'invalid', 'missing phone refused');
  reset role;
  perform pg_temp.eq((select confirmed and from_patient and phone = '01012345678' from public.iapp_appointments where id = apt), true, 'row: confirmed, from patient, normalised phone');
  -- availability = taken times (appointments + pending requests)
  set local role service_role;
  r := public.wa_create_booking_request(null, '201088888888', 'دمنهور', d, '20:40', 'هدى', 'متابعة', null);
  perform pg_temp.eq(r ->> 'mode', 'request', 'request mode');
  select count(*) into n from public.wa_taken_times('دمنهور', d); perform pg_temp.eq(n, 2, 'taken = appointment + pending request');
  r := public.wa_create_booking_request(null, '201088888888', 'دمنهور', d, '20:40', 'هدى', 'متابعة', null);
  perform pg_temp.eq(r ->> 'duplicate', 'true', 'request retry deduplicated');
  r := public.wa_create_booking_request(null, '201099999991', 'دمنهور', d, '20:40', 'غيرها', 'متابعة', null);
  perform pg_temp.eq(r ->> 'error', 'slot_taken', 'pending request holds the slot');
  -- my appointments: only the sender's own, minimal columns
  select count(*) into n from public.wa_my_appointments('201012345678'); perform pg_temp.eq(n, 1, 'sender sees own appointment');
  select count(*) into n from public.wa_my_appointments('201055550000'); perform pg_temp.eq(n, 0, 'another number sees nothing');
  select count(*) into n from public.wa_my_appointments(''); perform pg_temp.eq(n, 0, 'empty number sees nothing');
  -- cancel / reschedule: ownership enforced, not-yours looks like not-found
  r := public.wa_cancel_appointment(null, '201077777777', apt); perform pg_temp.eq(r ->> 'error', 'not_found', 'cannot cancel someone else''s appointment');
  r := public.wa_reschedule_appointment(null, '201077777777', apt, d + 1, '20:10'); perform pg_temp.eq(r ->> 'error', 'not_found', 'cannot reschedule someone else''s appointment');
  r := public.wa_reschedule_appointment(null, '201012345678', apt, d, '20:40'); perform pg_temp.eq(r ->> 'error', 'slot_taken', 'reschedule into a held slot refused');
  r := public.wa_reschedule_appointment(null, '201012345678', apt, d + 1, '20:20'); perform pg_temp.eq(r ->> 'ok', 'true', 'reschedule ok');
  reset role;
  perform pg_temp.eq((select date from public.iapp_appointments where id = apt), d + 1, 'reschedule persisted');
  set local role service_role;
  r := public.wa_cancel_appointment(null, '201012345678', apt); perform pg_temp.eq(r ->> 'ok', 'true', 'cancel ok');
  r := public.wa_cancel_appointment(null, '201012345678', apt); perform pg_temp.eq(r ->> 'duplicate', 'true', 'cancel retry is idempotent');
  r := public.wa_reschedule_appointment(null, '201012345678', apt, d + 2, '20:20'); perform pg_temp.eq(r ->> 'error', 'not_reschedulable', 'cancelled cannot be rescheduled');
  reset role;
  perform pg_temp.eq((select cancelled from public.iapp_appointments where id = apt), true, 'cancel persisted');
  -- the slot is free again after the cancellation
  set local role service_role;
  r := public.wa_book_appointment(null, '201077777777', 'دمنهور', 'د. عبدالستار', d + 1, '20:20', 'سلمى', 'فحص روتيني'); perform pg_temp.eq(r ->> 'ok', 'true', 'freed slot can be booked');
  -- a patient already in the clinic (called/in/done) cannot be cancelled by chat
  reset role;
  update public.iapp_appointments set wait_status = 'in' where phone = '01077777777';
  set local role service_role;
  r := public.wa_cancel_appointment(null, '201077777777', (select id from public.iapp_appointments where phone = '01077777777')); perform pg_temp.eq(r ->> 'error', 'not_cancellable', 'in-clinic appointment not cancellable by chat');
  reset role;
end $$;

-- ---- reminders: consent, opt-out, template, timing, idempotency, obsolete withdrawal
do $$ declare n int; apt bigint := 7001; t text; begin
  delete from public.iapp_appointments; delete from public.wa_messages where purpose = 'reminder';
  update public.wa_config set enabled = true, reminders_enabled = true, reminder_template = 'apt_reminder', reminder_offsets_min = '{1440,120}';
  set local role service_role; perform public.wa_ingest_inbound('201033333333', 'علي', 'wamid.R1', 'text', 'hi', now()); reset role;
  t := to_char((now() at time zone 'Africa/Cairo') + interval '100 minutes', 'HH24:MI');
  insert into public.iapp_appointments (id, patient, phone, date, time, clinic, doctor) values (apt, 'علي', '01033333333', (now() at time zone 'Africa/Cairo' + interval '100 minutes')::date, t, 'دمنهور', 'د. عبدالستار');
  set local role service_role;
  perform pg_temp.eq(public.wa_enqueue_reminders(), 0, 'no consent => no reminder');
  perform public.wa_set_consent('201033333333', true, false, 'chat');
  perform pg_temp.eq(public.wa_enqueue_reminders(), 1, 'consent => the 120-min reminder is due (1440 one is past/stale)');
  perform pg_temp.eq(public.wa_enqueue_reminders(), 0, 'second run => no duplicate');
  reset role;
  perform pg_temp.eq((select kind || '/' || template_name || '/' || (template_params ->> 2) from public.wa_messages where purpose = 'reminder'), 'template/apt_reminder/دمنهور', 'template message with clinic param');
  perform pg_temp.eq((select template_params ->> 1 from public.wa_messages where purpose = 'reminder'), t, 'time param');
  -- moved appointment: the queued reminder is withdrawn, a new one is created for the new time
  update public.iapp_appointments set date = ((now() at time zone 'Africa/Cairo') + interval '110 minutes')::date, time = to_char((now() at time zone 'Africa/Cairo') + interval '110 minutes', 'HH24:MI') where id = apt;
  set local role service_role; perform public.wa_enqueue_reminders(); reset role;
  perform pg_temp.eq((select count(*) from public.wa_messages where purpose = 'reminder' and status = 'cancelled')::int, 1, 'moved appointment => old reminder cancelled');
  perform pg_temp.eq((select count(*) from public.wa_messages where purpose = 'reminder' and status = 'queued')::int, 1, 'moved appointment => one new reminder');
  -- cancelled appointment: withdrawn
  update public.iapp_appointments set cancelled = true where id = apt;
  set local role service_role; perform public.wa_enqueue_reminders(); reset role;
  perform pg_temp.eq((select count(*) from public.wa_messages where purpose = 'reminder' and status = 'queued')::int, 0, 'cancelled appointment => no queued reminder');
  -- opt-out: never again, even if consent was given before
  update public.iapp_appointments set cancelled = false where id = apt;
  delete from public.wa_messages where purpose = 'reminder';
  set local role service_role; perform public.wa_set_consent('201033333333', null, true, 'chat');
  perform pg_temp.eq(public.wa_enqueue_reminders(), 0, 'opted out => no reminder');
  reset role;
  perform pg_temp.eq((select consent || '/' || reminders_opt_in from public.wa_contacts where wa_id = '201033333333'), 'opted_out/false', 'opt-out clears consent');
  -- master switch
  update public.wa_config set enabled = false;
  set local role service_role; perform pg_temp.eq(public.wa_enqueue_reminders(), 0, 'disabled => nothing'); reset role;
  update public.wa_config set enabled = true;
end $$;

-- ---- inbound claim: one conversation is never processed twice at once; failures are retried then capped
do $$ declare c bigint; n int; mx bigint; begin
  delete from public.wa_messages; update public.wa_conversations set unread_count = 0;
  set local role service_role;
  perform public.wa_ingest_inbound('201012345678', 'منى', 'wamid.Q1', 'text', 'a', now()); perform public.wa_ingest_inbound('201012345678', 'منى', 'wamid.Q2', 'text', 'b', now());
  select count(*), max(max_message_id) into n, mx from public.wa_claim_inbound(5); perform pg_temp.eq(n, 1, 'two messages, one conversation => one unit of work');
  select count(*) into n from public.wa_claim_inbound(5); perform pg_temp.eq(n, 0, 'nothing claimable while it is being processed');
  select conversation_id into c from public.wa_messages limit 1;
  perform public.wa_mark_processed(c, mx, 'llm timeout');
  select count(*) into n from public.wa_claim_inbound(5); perform pg_temp.eq(n, 1, 'failed attempt is released for retry');
  perform public.wa_mark_processed(c, mx, null);
  select count(*) into n from public.wa_claim_inbound(5); perform pg_temp.eq(n, 0, 'processed messages are not claimed again');
  reset role;
  update public.wa_messages set processed_at = null, process_attempts = 5;
  set local role service_role; select count(*) into n from public.wa_claim_inbound(5); reset role;
  perform pg_temp.eq(n, 0, 'attempts capped at 5 (then the worker hands the chat to a human)');
end $$;

-- ---- handoff notice: once, queued, AI off
do $$ declare c bigint; begin
  select id into c from public.wa_conversations;
  update public.wa_conversations set status = 'ai', ai_enabled = true;
  set local role service_role; perform public.wa_handoff(c, 'patient_asked'); perform public.wa_handoff(c, 'patient_asked'); reset role;
  perform pg_temp.eq((select ai_enabled from public.wa_conversations where id = c), false, 'handoff disables AI');
  perform pg_temp.eq((select count(*) from public.wa_messages where purpose = 'handoff')::int, 1, 'one notice only');
end $$;

-- ---- RLS / roles / clinic isolation: staff roles, anon, doctor, privileges
do $t$ declare n int; c bigint; begin
  select id into c from public.wa_conversations;
  update public.wa_conversations set assigned_to = null;
  -- anon: no table, no function
  set local role anon;
  perform pg_temp.fails($$ select * from public.wa_messages $$, 'permission denied', 'anon cannot read messages');
  perform pg_temp.fails($$ select public.wa_book_appointment(null,'2010','x','y',current_date,'10:00','n','t') $$, 'permission denied', 'anon cannot book through the worker function');
  reset role;
  -- doctor: sees nothing, cannot act
  set local role authenticated; perform set_config('test.jwt', '{"email":"doc@x.com"}', true);
  select count(*) into n from public.wa_messages; perform pg_temp.eq(n, 0, 'doctor sees no messages (RLS)');
  perform pg_temp.fails(format('select public.wa_staff_take_over(%s)', c), 'forbidden', 'doctor cannot take over');
  perform pg_temp.fails($$ select public.wa_book_appointment(null,'2010','x','y',current_date,'10:00','n','t') $$, 'permission denied', 'authenticated cannot call worker functions');
  perform pg_temp.fails($$ insert into public.wa_messages (conversation_id, direction, sender, status) values (1,'out','staff','sent') $$, 'permission denied', 'no direct writes from the browser');
  -- secretary: reads inbox, acts through RPCs, cannot read config/audit
  perform set_config('test.jwt', '{"email":"sec@x.com"}', true);
  select count(*) into n from public.wa_messages; perform pg_temp.eq(n > 0, true, 'secretary sees messages');
  select count(*) into n from public.wa_config; perform pg_temp.eq(n, 0, 'secretary cannot read config');
  select count(*) into n from public.wa_audit; perform pg_temp.eq(n, 0, 'secretary cannot read the audit log');
  perform public.wa_staff_return_to_ai(c);
  perform pg_temp.eq((select ai_enabled from public.wa_conversations where id = c), true, 'explicit return to AI');
  perform public.wa_staff_take_over(c);
  perform pg_temp.eq((select assigned_to from public.wa_conversations where id = c), 'sec@x.com', 'takeover assigns the actor');
  perform public.wa_staff_mark_read(c);
  perform pg_temp.eq((select unread_count from public.wa_conversations where id = c)::int, 0, 'mark read');
  update public.wa_config set enabled = not enabled; get diagnostics n = row_count; perform pg_temp.eq(n, 0, 'secretary update of config touches 0 rows (RLS)');
  -- FAQ: secretary reads, cannot write; admin writes; doctor/anon see nothing
  perform pg_temp.fails($$ insert into public.wa_faq (topic, answer) values ('تحضير', 'x') $$, 'row-level security', 'secretary cannot write FAQ');
  -- admin: config + audit
  perform set_config('test.jwt', '{"email":"admin@x.com"}', true);
  select count(*) into n from public.wa_config; perform pg_temp.eq(n, 1, 'admin reads config');
  select count(*) into n from public.wa_audit where actor in ('admin@x.com','sec@x.com') ; perform pg_temp.eq(n >= 2, true, 'staff actions are audited');
  update public.wa_config set ai_enabled = false;
  insert into public.wa_faq (topic, answer, updated_by) values ('تحضير الفحص', 'احضر معك النظارة الطبية الحالية.', 'admin@x.com');
  perform set_config('test.jwt', '{"email":"sec@x.com"}', true);
  select count(*) into n from public.wa_faq; perform pg_temp.eq(n, 1, 'secretary reads FAQ');
  perform set_config('test.jwt', '{"email":"doc@x.com"}', true);
  select count(*) into n from public.wa_faq; perform pg_temp.eq(n, 0, 'doctor does not see FAQ admin data');
  reset role; perform set_config('test.jwt', '', true);
end $t$;

-- ---- retention
do $$ declare r jsonb; begin
  update public.wa_messages set created_at = now() - interval '400 days' where id = (select min(id) from public.wa_messages);
  set local role service_role; r := public.wa_purge(); reset role;
  perform pg_temp.eq((r ->> 'messages')::int >= 1, true, 'old messages purged');
end $$;
do $$ begin raise notice 'ALL SQL ASSERTIONS PASSED'; end $$;
