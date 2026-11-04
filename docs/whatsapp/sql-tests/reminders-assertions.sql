-- wa-patient-reminders.sql assertions (synthetic data on a throwaway DB). Runs after whatsapp-assistant.sql + messenger-channels.sql + wa-patient-reminders.sql.
\set ON_ERROR_STOP 1
create table if not exists public.iapp_store (key text primary key, value jsonb, rev bigint not null default 1);
create table if not exists public.iapp_visits (id text primary key, patient_id bigint, patient text, date text, type text, doctor text, clinic text,
  complaint text, result text, cost text, paid boolean, next_visit text, notes text, rated boolean, updated_at timestamptz default now());
truncate public.wa_messages, public.wa_conversations, public.wa_contacts cascade;
delete from public.iapp_appointments; delete from public.iapp_booking_requests;
update public.wa_config set enabled = true, reminders_enabled = true, followups_enabled = true where id = 1;

-- "now" = 2026-11-02 19:00 Cairo (17:00 UTC). Tomorrow = 2026-11-03.
insert into public.iapp_store (key, value) values ('iapp_patients', '[
  {"id": 1, "name": "أحمد  محمد", "phone": "01012345678", "reminderConsent": true},
  {"id": 2, "name": "منى علي", "phone": "01122223333"},
  {"id": 3, "name": "سعيد حسن", "phone": "٠١٢٠٠٠٠٠٠٠١", "reminderConsent": true, "checkupMonths": "6"},
  {"id": 4, "name": "هالة", "phone": "01500000002", "reminderConsent": true},
  {"id": 5, "name": "كريم", "phone": "0453333313", "reminderConsent": true},
  {"id": 6, "name": "نادية", "phone": "01099999999", "reminderConsent": true, "checkupMonths": 6},
  {"id": 7, "name": "سمير", "phone": "01011111111", "reminderConsent": true}
]'), ('iapp_exams', '[{"id": 900, "patientId": 7, "date": "2026-10-25", "followUp": "2026-11-02"}]') on conflict (key) do update set value = excluded.value;

insert into public.iapp_appointments (id, patient_id, patient, phone, date, time, clinic) values
  (101, 1, 'أحمد  محمد', '01012345678', '2026-11-03', '20:30', 'دمنهور'),     -- consent in app -> reminder
  (102, 2, 'منى علي', '01122223333', '2026-11-03', '16:10', 'الرحمانية'),     -- no consent -> nothing
  (103, 4, 'هالة', '01500000002', '2026-11-05', '20:00', 'دمنهور'),           -- not tomorrow -> nothing (also blocks her follow-up)
  (104, 5, 'كريم', '0453333313', '2026-11-03', '20:10', 'دمنهور');            -- landline -> nothing

insert into public.iapp_visits (id, patient_id, patient, date, next_visit) values
  ('v1', 3, 'سعيد حسن', '2026-04-01', ''),             -- 6-month check-up overdue -> checkup
  ('v2', 4, 'هالة', '2026-10-20', '2026-11-02'),       -- follow-up due but she already has an appointment -> nothing
  ('v3', 6, 'نادية', '2026-10-01', '2026-11-01'),      -- follow-up due (yesterday) -> followup ; check-up not yet due
  ('v4', 1, 'أحمد  محمد', '2026-09-01', '2026-11-02'), -- follow-up due but has appointment tomorrow -> nothing
  ('v7', 7, 'سمير', '2026-10-25', null);               -- same-day exam below carries the follow-up date

do $$ declare n int; begin
  -- before the send hour: nothing
  n := public.wa_enqueue_reminders('2026-11-02 10:00:00+00'::timestamptz);   -- 12:00 Cairo: follow-ups yes, appointment reminders not yet
  assert n = 3, 'noon run should queue 3 (2 followups incl. one from an exam + checkup), got ' || n;
  assert exists (select 1 from public.wa_messages where idempotency_key = 'fu:e900:2026-11-02'), 'follow-up date taken from the exam';
  assert (select count(*) from public.wa_messages where purpose = 'reminder') = 0, 'no appointment reminder before 18:00';
  n := public.wa_enqueue_reminders('2026-11-02 17:00:00+00'::timestamptz);
  assert n = 1, 'evening run should queue 1 appointment reminder, got ' || n;
  n := public.wa_enqueue_reminders('2026-11-02 17:05:00+00'::timestamptz);
  assert n = 0, 'second run must queue nothing (once only), got ' || n;
  raise notice 'reminders: counts and once-only ok';
end $$;

do $$ declare m record; begin
  select * into m from public.wa_messages where purpose = 'reminder';
  assert m.template_name = 'appointment_reminder', 'template name';
  assert m.template_params = '["أحمد محمد", "الثلاثاء 3 نوفمبر", "8:30 مساءً", "عيادة دمنهور"]'::jsonb, 'params: ' || m.template_params::text;
  assert (select wa_id from public.wa_contacts c join public.wa_conversations v on v.contact_id = c.id where v.id = m.conversation_id) = '201012345678', 'wa id';
  select * into m from public.wa_messages where purpose = 'followup' and idempotency_key like 'fu:v%';
  assert m.template_params = '["نادية", "1 أكتوبر"]'::jsonb, 'followup params: ' || m.template_params::text;
  select * into m from public.wa_messages where purpose = 'checkup';
  assert m.template_params = '["سعيد حسن", "1 أبريل"]'::jsonb, 'checkup params: ' || m.template_params::text;
  assert (select wa_id from public.wa_contacts c join public.wa_conversations v on v.contact_id = c.id where v.id = m.conversation_id) = '201200000001', 'arabic digits phone';
  raise notice 'reminders: template params ok';
end $$;

do $$ declare n int; r jsonb; begin
  -- opted-out patient gets nothing even with app consent
  update public.wa_config set reminders_enabled = true where id = 1;
  insert into public.iapp_appointments (id, patient_id, patient, phone, date, time, clinic) values (105, 6, 'نادية', '01099999999', '2026-11-03', '21:00', 'دمنهور');
  update public.wa_contacts set consent = 'opted_out' where wa_id = '201099999999';
  n := public.wa_enqueue_reminders('2026-11-02 17:10:00+00'::timestamptz);
  assert n = 0, 'opted-out must get nothing, got ' || n;
  -- moved appointment: queued reminder is withdrawn
  update public.iapp_appointments set date = '2026-11-10' where id = 101;
  perform public.wa_enqueue_reminders('2026-11-02 17:11:00+00'::timestamptz);
  assert (select status from public.wa_messages where appointment_id = 101) = 'cancelled', 'moved appointment reminder withdrawn';
  update public.iapp_appointments set date = '2026-11-03' where id = 101;
  -- confirm button: only after the reminder was actually sent
  r := public.wa_confirm_from_reminder((select conversation_id from public.wa_messages where appointment_id = 101), '2026-11-02 18:00:00+00');
  assert (r ->> 'ok')::boolean = false, 'nothing sent yet -> not confirmed';
  insert into public.wa_messages (conversation_id, direction, sender, purpose, kind, status, template_name, idempotency_key, appointment_id, apt_date, apt_time)
    select conversation_id, 'out', 'system', 'reminder', 'template', 'delivered', 'appointment_reminder', 'rem:101:test', 101, '2026-11-03', '20:30' from public.wa_messages where appointment_id = 101 limit 1;
  r := public.wa_confirm_from_reminder((select conversation_id from public.wa_messages where appointment_id = 101 limit 1), '2026-11-02 18:00:00+00');
  assert (r ->> 'ok')::boolean and (select confirmed from public.iapp_appointments where id = 101), 'confirmed: ' || r::text;
  assert r ->> 'time_text' = '8:30 مساءً', 'time text';
  raise notice 'reminders: opt-out, withdrawal and confirmation ok';
end $$;

do $$ begin
  update public.wa_config set reminders_enabled = false, followups_enabled = false where id = 1;
  assert public.wa_enqueue_reminders('2026-11-03 17:00:00+00'::timestamptz) = 0, 'switches off -> nothing';
  assert public.wa_ar_time('12:10') = '12:10 ظهرًا' and public.wa_ar_time('09:00') = '9:00 صباحًا', 'ar time';
  assert public.wa_phone_to_waid('+20 100 123 4567') = '201001234567' and public.wa_phone_to_waid('0453333313') is null, 'phone';
  raise notice 'reminders: switches and helpers ok';
end $$;
