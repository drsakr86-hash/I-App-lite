-- WhatsApp patient reminders: appointment (the evening before), follow-up (the day nextVisit is due) and periodic check-up.
-- Requires whatsapp-assistant.sql + messenger-channels.sql. Run ONCE in the Supabase SQL editor. Rollback: wa-patient-reminders-rollback.sql
--
-- Consent: a patient is reminded only when EITHER the patient record in the app has reminderConsent = true (ticked by staff in the
-- patient form) OR the patient said yes to reminders in the WhatsApp chat. A patient who sent "إيقاف" (opted_out) is never messaged.
-- Every reminder is an approved UTILITY template (free text is not allowed outside the 24 h window) and is sent at most once:
--   appointment_reminder       4 params: name, day+date, time, clinic       key rem:<apt>:<date>:<time>:day
--   followup_reminder          2 params: name, date of the last visit       key fu:<visit>:<nextVisit>
--   periodic_checkup_reminder  2 params: name, date of the last visit       key ck:<patient>:<last visit date>
-- Nothing is sent until the switches are turned on (see the end of this file), after Meta approves the 3 templates.
begin;

do $$ begin
  if to_regclass('public.wa_contacts') is null
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'wa_contacts' and column_name = 'channel')
  then raise exception 'ABORT: whatsapp-assistant.sql and messenger-channels.sql must be applied first. Nothing was changed.'; end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'wa_config' and column_name = 'followups_enabled')
  then raise exception 'ABORT: wa-patient-reminders.sql is already applied. Nothing was changed.'; end if;
end $$;

-- ------------------------------------------------------------------------------------------------ config
alter table public.wa_config
  add column reminder_send_hour int     not null default 18 check (reminder_send_hour between 0 and 22),   -- appointment reminders: from this hour, the day before
  add column followups_enabled  boolean not null default false,                                             -- follow-up + periodic check-up reminders
  add column followup_template  text,
  add column checkup_template   text,
  add column followup_send_hour int     not null default 11 check (followup_send_hour between 0 and 20);
update public.wa_config set reminder_template = 'appointment_reminder', reminder_template_lang = 'ar',
       followup_template = 'followup_reminder', checkup_template = 'periodic_checkup_reminder', updated_at = now() where id = 1;

-- ------------------------------------------------------------------------------------------------ new message purposes
do $$ declare c text; begin
  select conname into c from pg_constraint where conrelid = 'public.wa_messages'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%purpose%';
  if c is not null then execute format('alter table public.wa_messages drop constraint %I', c); end if;
end $$;
alter table public.wa_messages add constraint wa_messages_purpose_check
  check (purpose in ('inbound', 'reply', 'manual', 'reminder', 'confirmation', 'handoff', 'followup', 'checkup'));

-- ------------------------------------------------------------------------------------------------ helpers
-- Egyptian mobile (01x, 201x, 00201x, Arabic digits) -> WhatsApp id 201xxxxxxxxx; anything else -> null (never messaged).
create or replace function public.wa_phone_to_waid(p text) returns text language sql immutable as $$
  select case when d ~ '^01[0125][0-9]{8}$' then '2' || d
              when d ~ '^201[0125][0-9]{8}$' then d
              when d ~ '^00201[0125][0-9]{8}$' then substr(d, 3) end
    from (select regexp_replace(translate(coalesce(p, ''), '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789'), '\D', '', 'g') as d) x
$$;

create or replace function public.wa_ar_date(d date, p_dow boolean default true) returns text language sql immutable as $$
  select case when p_dow then (array['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'])[extract(dow from d)::int + 1] || ' ' else '' end
      || extract(day from d)::int || ' '
      || (array['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'])[extract(month from d)::int]
$$;

-- '20:30' -> '8:30 مساءً'
create or replace function public.wa_ar_time(t text) returns text language sql immutable as $$
  select case when h = 0 then 12 when h > 12 then h - 12 else h end || ':' || m
      || case when h < 12 then ' صباحًا' when h = 12 then ' ظهرًا' else ' مساءً' end
    from (select split_part(t, ':', 1)::int as h, lpad(split_part(t, ':', 2), 2, '0') as m) x
$$;

create or replace function public.wa_ar_clinic(c text) returns text language sql immutable as $$
  select case coalesce(c, '') when 'دمنهور' then 'عيادة دمنهور' when 'الرحمانية' then 'عيادة الرحمانية' when '' then 'العيادة' else c end
$$;

-- Meta rejects template params with new lines, tabs or long runs of spaces.
create or replace function public.wa_tparam(t text, fallback text) returns text language sql immutable as $$
  select coalesce(nullif(left(regexp_replace(trim(coalesce(t, '')), '\s+', ' ', 'g'), 60), ''), fallback)
$$;

-- Patients as stored by the app (iapp_store 'iapp_patients'), with the two reminder fields of the patient form.
create or replace function public.wa_patients_json() returns table (pid text, name text, phone text, wa text, consent boolean, checkup_months int)
language sql stable security definer set search_path = public as $$
  select e ->> 'id', e ->> 'name', e ->> 'phone', public.wa_phone_to_waid(e ->> 'phone'),
         lower(coalesce(e ->> 'reminderConsent', 'false')) in ('true', '1', 'yes'),
         case when coalesce(e ->> 'checkupMonths', '') ~ '^[0-9]{1,2}$' then (e ->> 'checkupMonths')::int end
    from public.iapp_store s, jsonb_array_elements(case when jsonb_typeof(s.value) = 'array' then s.value else '[]'::jsonb end) e
   where s.key = 'iapp_patients' and jsonb_typeof(e) = 'object'
$$;

-- WhatsApp contact + conversation for a phone (created on first reminder); null when the number is invalid or opted out.
create or replace function public.wa_conv_for_phone(p_phone text) returns bigint language plpgsql security definer set search_path = public as $$
declare v_wa text := public.wa_phone_to_waid(p_phone); v_contact bigint; v_consent text; v_conv bigint;
begin
  if v_wa is null then return null; end if;
  insert into public.wa_contacts (channel, wa_id) values ('whatsapp', v_wa) on conflict (channel, wa_id) do nothing;
  select id, consent into v_contact, v_consent from public.wa_contacts where channel = 'whatsapp' and wa_id = v_wa;
  if v_consent = 'opted_out' then return null; end if;
  insert into public.wa_conversations (contact_id) values (v_contact) on conflict (contact_id) do nothing;
  select id into v_conv from public.wa_conversations where contact_id = v_contact;
  return v_conv;
end $$;

create or replace function public.wa_queue_template(p_conv bigint, p_purpose text, p_template text, p_lang text, p_params jsonb, p_body text,
                                                    p_idem text, p_apt bigint, p_apt_date date, p_apt_time text, p_now timestamptz) returns int
language plpgsql security definer set search_path = public as $$
declare k int;
begin
  insert into public.wa_messages (conversation_id, direction, sender, purpose, kind, status, template_name, template_lang, template_params, body,
                                  idempotency_key, appointment_id, apt_date, apt_time, next_attempt_at)
  values (p_conv, 'out', 'system', p_purpose, 'template', 'queued', p_template, coalesce(p_lang, 'ar'), p_params, left(p_body, 4096),
          p_idem, p_apt, p_apt_date, p_apt_time, p_now)
  on conflict (idempotency_key) where idempotency_key is not null do nothing;
  get diagnostics k = row_count;
  return k;
end $$;

-- ------------------------------------------------------------------------------------------------ the scheduler (called every minute by the worker)
create or replace function public.wa_enqueue_reminders(p_now timestamptz default now()) returns int
language plpgsql security definer set search_path = public as $$
declare cfg public.wa_config%rowtype; n int := 0; r record; v_conv bigint; v_local timestamp; v_today date; v_hour int; v_name text; v_date text; v_time text; v_clinic text;
begin
  select * into cfg from public.wa_config where id = 1;
  -- queued appointment reminders whose appointment was cancelled / moved / removed are withdrawn first
  update public.wa_messages m set status = 'cancelled', error_code = 'OBSOLETE', updated_at = now()
   where m.purpose = 'reminder' and m.status = 'queued'
     and not exists (select 1 from public.iapp_appointments a where a.id = m.appointment_id and not a.cancelled
                        and coalesce(a.wait_status, '') not in ('cancelled', 'done') and a.date = m.apt_date and coalesce(a."time", '') = coalesce(m.apt_time, ''));
  if not cfg.enabled then return 0; end if;
  v_local := p_now at time zone cfg.clinic_tz; v_today := v_local::date; v_hour := extract(hour from v_local)::int;

  -- A) appointments of TOMORROW, from reminder_send_hour until 23:00 (an appointment booked later in the evening still gets one)
  if cfg.reminders_enabled and cfg.reminder_template is not null and v_hour >= cfg.reminder_send_hour and v_hour < 23 then
    for r in
      with p as materialized (select * from public.wa_patients_json() where consent and wa is not null)
      select a.id, a.date, a."time", a.clinic, a.patient, a.phone, ('rem:' || a.id || ':' || a.date || ':' || a."time" || ':day') as idem
        from public.iapp_appointments a
       where a.date = v_today + 1 and not a.cancelled and coalesce(a.wait_status, '') not in ('cancelled', 'done')
         and a."time" ~ '^\d{1,2}:\d{2}$' and public.wa_phone_to_waid(a.phone) is not null
         and not exists (select 1 from public.wa_messages m where m.idempotency_key = 'rem:' || a.id || ':' || a.date || ':' || a."time" || ':day')
         and (exists (select 1 from public.wa_contacts c where c.channel = 'whatsapp' and c.wa_id = public.wa_phone_to_waid(a.phone) and c.reminders_opt_in and c.consent <> 'opted_out')
              or exists (select 1 from p where p.pid = a.patient_id::text or p.wa = public.wa_phone_to_waid(a.phone)))
    loop
      v_conv := public.wa_conv_for_phone(r.phone);
      continue when v_conv is null;
      v_name := public.wa_tparam(r.patient, 'حضرتك'); v_date := public.wa_ar_date(r.date); v_time := public.wa_ar_time(r."time"); v_clinic := public.wa_ar_clinic(r.clinic);
      n := n + public.wa_queue_template(v_conv, 'reminder', cfg.reminder_template, cfg.reminder_template_lang, jsonb_build_array(v_name, v_date, v_time, v_clinic),
        'مرحباً ' || v_name || '،' || chr(10) || 'نذكّركم بموعدكم غداً ' || v_date || ' الساعة ' || v_time || ' في ' || v_clinic || '.' || chr(10)
          || 'برجاء تأكيد الحضور أو اختيار أحد الخيارات بالأسفل.' || chr(10) || '[تأكيد الحضور] [إلغاء] [تغيير الموعد]',
        r.idem, r.id, r.date, r."time", p_now);
    end loop;
  end if;

  if not (cfg.followups_enabled and v_hour >= cfg.followup_send_hour and v_hour < 21) then return n; end if;

  -- B) follow-up: the patient's LATEST visit has nextVisit due today (or in the last 3 days if the worker was down), nothing booked since
  if cfg.followup_template is not null then
    for r in
      with p as materialized (select * from public.wa_patients_json() where consent and wa is not null),
           v as materialized (select id::text as vid, patient_id::text as pid, left(date::text, 10) as vdate, left(coalesce(next_visit::text, ''), 10) as nv
                                from public.iapp_visits where patient_id is not null and left(date::text, 10) ~ '^\d{4}-\d{2}-\d{2}$'),
           lastv as (select distinct on (pid) * from v order by pid, vdate desc, vid desc)
      select l.vid, l.vdate::date as vdate, l.nv, p.pid, p.name, p.phone, p.wa
        from lastv l join p on p.pid = l.pid
       where l.nv ~ '^\d{4}-\d{2}-\d{2}$' and l.nv::date between v_today - 3 and v_today
         and not exists (select 1 from public.wa_messages m where m.idempotency_key = 'fu:' || l.vid || ':' || l.nv)
         and not exists (select 1 from public.iapp_appointments a where (a.patient_id::text = p.pid or public.wa_phone_to_waid(a.phone) = p.wa)
                            and a.date >= v_today and not a.cancelled and coalesce(a.wait_status, '') <> 'cancelled')
         and not exists (select 1 from public.iapp_booking_requests b where b.status = 'pending' and b.date >= v_today and public.wa_phone_to_waid(b.phone) = p.wa)
    loop
      v_conv := public.wa_conv_for_phone(r.phone);
      continue when v_conv is null;
      v_name := public.wa_tparam(r.name, 'حضرتك'); v_date := public.wa_ar_date(r.vdate, false);
      n := n + public.wa_queue_template(v_conv, 'followup', cfg.followup_template, cfg.reminder_template_lang, jsonb_build_array(v_name, v_date),
        'مرحباً ' || v_name || '،' || chr(10) || 'حان موعد متابعتكم حسب تعليمات الطبيب في زيارتكم الأخيرة بتاريخ ' || v_date || '.' || chr(10)
          || 'يمكنكم حجز موعد المتابعة بالضغط على الزر بالأسفل.' || chr(10) || '[احجز موعد المتابعة]',
        'fu:' || r.vid || ':' || r.nv, null, null, null, p_now);
    end loop;
  end if;

  -- C) periodic check-up: last visit + checkupMonths has passed, no follow-up still ahead, nothing booked. Once per last visit.
  if cfg.checkup_template is not null then
    for r in
      with p as materialized (select * from public.wa_patients_json() where consent and wa is not null and checkup_months between 1 and 36),
           v as materialized (select id::text as vid, patient_id::text as pid, left(date::text, 10) as vdate, left(coalesce(next_visit::text, ''), 10) as nv
                                from public.iapp_visits where patient_id is not null and left(date::text, 10) ~ '^\d{4}-\d{2}-\d{2}$'),
           lastv as (select distinct on (pid) * from v order by pid, vdate desc, vid desc)
      select l.vdate::date as vdate, p.pid, p.name, p.phone, p.wa
        from lastv l join p on p.pid = l.pid
       where (l.vdate::date + make_interval(months => p.checkup_months))::date <= v_today
         and not (l.nv ~ '^\d{4}-\d{2}-\d{2}$' and l.nv::date >= v_today - 3)                       -- a follow-up is still ahead / just reminded
         and not exists (select 1 from public.wa_messages m where m.idempotency_key = 'ck:' || p.pid || ':' || l.vdate)
         and not exists (select 1 from public.iapp_appointments a where (a.patient_id::text = p.pid or public.wa_phone_to_waid(a.phone) = p.wa)
                            and a.date >= v_today and not a.cancelled and coalesce(a.wait_status, '') <> 'cancelled')
         and not exists (select 1 from public.iapp_booking_requests b where b.status = 'pending' and b.date >= v_today and public.wa_phone_to_waid(b.phone) = p.wa)
    loop
      v_conv := public.wa_conv_for_phone(r.phone);
      continue when v_conv is null;
      v_name := public.wa_tparam(r.name, 'حضرتك'); v_date := public.wa_ar_date(r.vdate, false);
      n := n + public.wa_queue_template(v_conv, 'checkup', cfg.checkup_template, cfg.reminder_template_lang, jsonb_build_array(v_name, v_date),
        'مرحباً ' || v_name || '،' || chr(10) || 'حسب خطة المتابعة المحددة لكم، حان موعد الكشف الدوري على العين، وكان آخر كشف بتاريخ ' || v_date || '.' || chr(10)
          || 'يمكنكم حجز الموعد بالضغط على الزر بالأسفل.' || chr(10) || '[احجز الكشف]',
        'ck:' || r.pid || ':' || r.vdate, null, null, null, p_now);
    end loop;
  end if;
  return n;
end $$;

-- ------------------------------------------------------------------------------------------------ "تأكيد الحضور" button
-- Marks the appointment of the latest delivered reminder in this conversation as confirmed (iapp_appointments.confirmed).
create or replace function public.wa_confirm_from_reminder(p_conv bigint, p_now timestamptz default now()) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v record; v_tz text := coalesce((select clinic_tz from public.wa_config where id = 1), 'Africa/Cairo');
begin
  select m.appointment_id, a.date, a."time", a.clinic into v
    from public.wa_messages m join public.iapp_appointments a on a.id = m.appointment_id
   where m.conversation_id = p_conv and m.direction = 'out' and m.purpose = 'reminder' and m.status in ('sent', 'delivered', 'read')
     and not a.cancelled and coalesce(a.wait_status, '') not in ('cancelled', 'done')
     and a.date = m.apt_date and coalesce(a."time", '') = coalesce(m.apt_time, '') and a.date >= (p_now at time zone v_tz)::date
   order by m.id desc limit 1;
  if not found then return jsonb_build_object('ok', false); end if;
  update public.iapp_appointments set confirmed = true, updated_at = now() where id = v.appointment_id;
  perform public.wa_audit_add('ai', 'reminder.confirmed', p_conv, v.appointment_id, null);
  return jsonb_build_object('ok', true, 'date', v.date, 'time', v."time", 'clinic', public.wa_ar_clinic(v.clinic), 'date_text', public.wa_ar_date(v.date), 'time_text', public.wa_ar_time(v."time"));
end $$;

-- ------------------------------------------------------------------------------------------------ privileges: server (service_role) only
revoke all on function public.wa_phone_to_waid(text), public.wa_ar_date(date, boolean), public.wa_ar_time(text), public.wa_ar_clinic(text), public.wa_tparam(text, text),
  public.wa_patients_json(), public.wa_conv_for_phone(text),
  public.wa_queue_template(bigint, text, text, text, jsonb, text, text, bigint, date, text, timestamptz),
  public.wa_enqueue_reminders(timestamptz), public.wa_confirm_from_reminder(bigint, timestamptz) from public, anon, authenticated;
grant execute on function public.wa_phone_to_waid(text), public.wa_ar_date(date, boolean), public.wa_ar_time(text), public.wa_ar_clinic(text), public.wa_tparam(text, text),
  public.wa_patients_json(), public.wa_conv_for_phone(text),
  public.wa_queue_template(bigint, text, text, text, jsonb, text, text, bigint, date, text, timestamptz),
  public.wa_enqueue_reminders(timestamptz), public.wa_confirm_from_reminder(bigint, timestamptz) to service_role;

commit;

-- ================================================================================================ AFTER Meta approves the 3 templates
-- Turn on (one or both):
--   update public.wa_config set reminders_enabled = true where id = 1;   -- appointment reminder, the evening before (from 18:00)
--   update public.wa_config set followups_enabled = true where id = 1;   -- follow-up + periodic check-up (from 11:00)
-- Change the send hours if needed:
--   update public.wa_config set reminder_send_hour = 18, followup_send_hour = 11 where id = 1;
