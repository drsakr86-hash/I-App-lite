-- messenger-channels.sql — Facebook Messenger + Instagram Direct in the same secretary inbox and assistant.
-- Run AFTER whatsapp-assistant.sql (+ whatsapp-push.sql, whatsapp-delete-conversation.sql). Rollback: messenger-channels-rollback.sql.
--
-- BACKWARD COMPATIBLE with the Edge Functions already deployed: every existing wa_* function keeps its name, arguments and meaning
-- for WhatsApp; wa_claim_outbound only gains a trailing column. Existing rows become channel = 'whatsapp'.
--
-- Design:
--   * wa_contacts.channel = 'whatsapp' | 'messenger' | 'instagram'. wa_id keeps the provider's id of the person:
--     the WhatsApp number, or the page-scoped id (PSID / IGSID) for Messenger / Instagram. Unique per (channel, wa_id).
--   * Messenger/Instagram ids are NOT phone numbers, so nothing phone-based (my appointments, cancel, reschedule, reminders,
--     reminder consent) applies to them. The assistant only files booking REQUESTS for them, with the phone the patient types,
--     which the secretary confirms by calling. wa_contacts.phone keeps that typed phone for the secretary.
--   * The 24 h reply window is the same rule on Messenger/Instagram (standard messaging), so the queue logic is unchanged.
begin;
set local lock_timeout = '3s';

do $$ begin
  if to_regclass('public.wa_contacts') is null then raise exception 'ABORT G0: whatsapp-assistant.sql is not applied. Nothing was changed.'; end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'wa_contacts' and column_name = 'channel') then
    raise exception 'ABORT G0: messenger-channels.sql is already applied. Nothing was changed.';
  end if;
end $$;

-- ---------------------------------------------------------------------------------------------------------------- tables
alter table public.wa_contacts add column channel text not null default 'whatsapp' check (channel in ('whatsapp', 'messenger', 'instagram'));
alter table public.wa_contacts add column phone text check (phone is null or phone ~ '^0[0-9]{9,10}$');   -- typed by the patient (Messenger/Instagram only)
alter table public.wa_contacts drop constraint wa_contacts_wa_id_digits;
alter table public.wa_contacts add constraint wa_contacts_wa_id_digits
  check ((channel = 'whatsapp' and wa_id ~ '^[0-9]{8,15}$') or (channel <> 'whatsapp' and wa_id ~ '^[0-9]{5,25}$'));
drop index public.wa_contacts_wa_id_uq;
create unique index wa_contacts_channel_wa_id_uq on public.wa_contacts (channel, wa_id);

alter table public.wa_config add column page_id text;          -- Facebook Page id (events for other pages are ignored)
alter table public.wa_config add column ig_account_id text;    -- Instagram professional account id linked to that page

-- ---------------------------------------------------------------------------------------------------------------- message trigger
-- Same as before, plus: an echo typed in Meta Business Suite ('meta-inbox') is a human reply but is not an inbox user to assign.
create or replace function public.wa_messages_after_insert() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.direction = 'in' then
    update public.wa_conversations set
      last_message_at = coalesce(new.provider_ts, new.created_at),
      last_inbound_at = coalesce(new.provider_ts, new.created_at),
      unread_count = unread_count + 1,
      last_preview = left(coalesce(new.body, '[' || new.kind || ']'), 120),
      status = case when status = 'closed' then 'ai' else status end,
      updated_at = now()
    where id = new.conversation_id;
  else
    update public.wa_conversations set
      last_message_at = new.created_at,
      last_preview = left(coalesce(new.body, new.template_name, '[' || new.kind || ']'), 120),
      ai_enabled = case when new.sender = 'staff' then false else ai_enabled end,
      status = case when new.sender = 'staff' then 'handoff' else status end,
      assigned_to = case when new.sender = 'staff' and assigned_to is null and coalesce(new.sent_by, 'whatsapp-app') not in ('whatsapp-app', 'meta-inbox') then new.sent_by else assigned_to end,
      handoff_reason = case when new.sender = 'staff' and handoff_reason is null then 'staff_reply' else handoff_reason end,
      updated_at = now()
    where id = new.conversation_id;
  end if;
  return new;
end $$;
revoke all on function public.wa_messages_after_insert() from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------- ingest
-- Idempotent per provider message id. WhatsApp keeps its historic event key ('in:<wamid>') so de-duplication continues across the upgrade.
create or replace function public.wa_ingest_inbound_ch(p_channel text, p_ext_id text, p_profile_name text, p_mid text, p_kind text, p_body text, p_ts timestamptz)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_contact bigint; v_conv bigint; v_msg bigint; v_key text;
begin
  if p_mid is null or p_ext_id is null or p_channel not in ('whatsapp', 'messenger', 'instagram') then raise exception 'wa_ingest_inbound_ch: missing ids'; end if;
  v_key := case when p_channel = 'whatsapp' then 'in:' || p_mid else 'in:' || p_channel || ':' || p_mid end;
  insert into public.wa_webhook_events (event_key, kind) values (v_key, 'in') on conflict do nothing;
  if not found then return jsonb_build_object('duplicate', true); end if;
  insert into public.wa_contacts (channel, wa_id, profile_name) values (p_channel, p_ext_id, left(p_profile_name, 80))
    on conflict (channel, wa_id) do update set profile_name = coalesce(excluded.profile_name, public.wa_contacts.profile_name), updated_at = now()
    returning id into v_contact;
  insert into public.wa_conversations (contact_id) values (v_contact) on conflict (contact_id) do nothing;
  select id into v_conv from public.wa_conversations where contact_id = v_contact;
  insert into public.wa_messages (conversation_id, direction, sender, purpose, kind, body, provider_message_id, status, provider_ts)
    values (v_conv, 'in', 'patient', 'inbound', case when p_kind = 'text' then 'text' else 'other' end, left(p_body, 4096), p_mid, 'received', p_ts)
    returning id into v_msg;
  return jsonb_build_object('duplicate', false, 'conversation_id', v_conv, 'message_id', v_msg);
end $$;

create or replace function public.wa_ingest_inbound(p_wa_id text, p_profile_name text, p_wamid text, p_kind text, p_body text, p_ts timestamptz)
returns jsonb language sql security definer set search_path = public as $$
  select public.wa_ingest_inbound_ch('whatsapp', p_wa_id, p_profile_name, p_wamid, p_kind, p_body, p_ts)
$$;

-- A reply typed outside the inbox (WhatsApp Business app, or the page inbox in Meta Business Suite): a human handled it.
create or replace function public.wa_ingest_echo_ch(p_channel text, p_to text, p_mid text, p_kind text, p_body text, p_ts timestamptz)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_contact bigint; v_conv bigint;
begin
  if p_mid is null or p_to is null or p_channel not in ('whatsapp', 'messenger', 'instagram') then raise exception 'wa_ingest_echo_ch: missing ids'; end if;
  insert into public.wa_webhook_events (event_key, kind) values ('echo:' || p_mid, 'echo') on conflict do nothing;
  if not found then return jsonb_build_object('duplicate', true); end if;
  -- a message we sent ourselves through the API is echoed too: ignore it when we already know its provider id
  if exists (select 1 from public.wa_messages where provider_message_id = p_mid) then return jsonb_build_object('duplicate', true); end if;
  insert into public.wa_contacts (channel, wa_id) values (p_channel, p_to) on conflict (channel, wa_id) do nothing;
  select id into v_contact from public.wa_contacts where channel = p_channel and wa_id = p_to;
  insert into public.wa_conversations (contact_id) values (v_contact) on conflict (contact_id) do nothing;
  select id into v_conv from public.wa_conversations where contact_id = v_contact;
  -- Messenger/Instagram echo EVERY page message, including ours, sometimes before we stored the message id: the same text we are
  -- sending / just sent to this person is ours, not a human reply (otherwise the assistant would hand itself over).
  if p_channel <> 'whatsapp' and exists (select 1 from public.wa_messages where conversation_id = v_conv and direction = 'out'
       and status in ('sending', 'sent', 'delivered', 'read') and body = left(p_body, 4096) and created_at > now() - interval '15 minutes') then
    return jsonb_build_object('duplicate', true);
  end if;
  insert into public.wa_messages (conversation_id, direction, sender, purpose, kind, body, provider_message_id, status, provider_ts, sent_by)
    values (v_conv, 'out', 'staff', 'manual', case when p_kind = 'text' then 'text' else 'other' end, left(p_body, 4096), p_mid, 'sent', p_ts,
            case when p_channel = 'whatsapp' then 'whatsapp-app' else 'meta-inbox' end);
  return jsonb_build_object('duplicate', false, 'conversation_id', v_conv);
end $$;

create or replace function public.wa_ingest_echo(p_to_wa_id text, p_wamid text, p_kind text, p_body text, p_ts timestamptz)
returns jsonb language sql security definer set search_path = public as $$
  select public.wa_ingest_echo_ch('whatsapp', p_to_wa_id, p_wamid, p_kind, p_body, p_ts)
$$;

-- ---------------------------------------------------------------------------------------------------------------- consent / reminders: WhatsApp only
create or replace function public.wa_set_consent(p_wa_id text, p_reminders boolean, p_opt_out boolean, p_source text)
returns void language plpgsql security definer set search_path = public as $$
declare v_contact bigint;
begin
  update public.wa_contacts set
    consent = case when p_opt_out then 'opted_out' else consent end,
    opted_out_at = case when p_opt_out then now() else opted_out_at end,
    reminders_opt_in = case when p_opt_out then false when p_reminders is not null then p_reminders else reminders_opt_in end,
    consent_source = case when p_reminders is true then p_source else consent_source end,
    consent_at = case when p_reminders is true then now() else consent_at end,
    updated_at = now()
  where channel = 'whatsapp' and wa_id = p_wa_id returning id into v_contact;
  if v_contact is not null then
    perform public.wa_audit_add(coalesce(p_source, 'system'), case when p_opt_out then 'consent.opt_out' else 'consent.reminders' end,
      (select id from public.wa_conversations where contact_id = v_contact), null, jsonb_build_object('reminders', p_reminders));
  end if;
end $$;

create or replace function public.wa_staff_set_reminder_consent(p_contact bigint, p_value boolean) returns void language plpgsql security definer set search_path = public as $$
declare v_wa text; v_ch text;
begin
  if not public.iapp_has_role(array['admin', 'secretary']) then raise exception 'forbidden'; end if;
  select wa_id, channel into v_wa, v_ch from public.wa_contacts where id = p_contact and consent <> 'opted_out';
  if v_wa is null then raise exception 'contact not found or opted out'; end if;
  if v_ch <> 'whatsapp' then raise exception 'reminders_whatsapp_only'; end if;
  perform public.wa_set_consent(v_wa, p_value, false, 'staff:' || public.wa_actor());
end $$;

create or replace function public.wa_enqueue_reminders(p_now timestamptz default now()) returns int
language plpgsql security definer set search_path = public as $$
declare cfg public.wa_config%rowtype; n int := 0; k int; o int;
begin
  select * into cfg from public.wa_config where id = 1;
  update public.wa_messages m set status = 'cancelled', error_code = 'OBSOLETE', updated_at = now()
   where m.purpose = 'reminder' and m.status = 'queued'
     and not exists (select 1 from public.iapp_appointments a where a.id = m.appointment_id and not a.cancelled
                        and coalesce(a.wait_status, '') not in ('cancelled', 'done') and a.date = m.apt_date and coalesce(a."time", '') = coalesce(m.apt_time, ''));
  if not (cfg.enabled and cfg.reminders_enabled and cfg.reminder_template is not null) then return 0; end if;
  foreach o in array cfg.reminder_offsets_min loop
    insert into public.wa_messages (conversation_id, direction, sender, purpose, kind, status, template_name, template_lang, template_params,
                                    idempotency_key, appointment_id, apt_date, apt_time, next_attempt_at)
    select cv.id, 'out', 'system', 'reminder', 'template', 'queued', cfg.reminder_template, cfg.reminder_template_lang,
           jsonb_build_array(to_char(a.date, 'YYYY-MM-DD'), a."time", coalesce(a.clinic, '')),
           'rem:' || a.id || ':' || a.date || ':' || a."time" || ':' || o, a.id, a.date, a."time", p_now
      from public.iapp_appointments a
      join public.wa_contacts c on c.channel = 'whatsapp' and public.wa_norm_phone(c.wa_id) = public.wa_norm_phone(a.phone) and c.reminders_opt_in and c.consent <> 'opted_out'
      join public.wa_conversations cv on cv.contact_id = c.id
     where not a.cancelled and coalesce(a.wait_status, '') not in ('cancelled', 'done') and a."time" ~ '^\d{1,2}:\d{2}$'
       and ((a.date + a."time"::time) at time zone cfg.clinic_tz) > p_now
       and ((a.date + a."time"::time) at time zone cfg.clinic_tz) - make_interval(mins => o) <= p_now
       and ((a.date + a."time"::time) at time zone cfg.clinic_tz) - make_interval(mins => o) > p_now - interval '3 hours'
    on conflict (idempotency_key) where idempotency_key is not null do nothing;
    get diagnostics k = row_count;
    n := n + k;
  end loop;
  return n;
end $$;

-- ---------------------------------------------------------------------------------------------------------------- outbound queue: + channel
drop function public.wa_claim_outbound(int);
create function public.wa_claim_outbound(p_limit int default 10)
returns table (id bigint, conversation_id bigint, wa_id text, kind text, body text, template_name text, template_lang text,
               template_params jsonb, purpose text, sender text, attempts int, consent text, last_inbound_at timestamptz, ai_active boolean, channel text)
language plpgsql security definer set search_path = public as $$
begin
  update public.wa_messages m set status = 'cancelled', error_code = 'HUMAN_TAKEOVER', updated_at = now()
    from public.wa_conversations c
    where m.conversation_id = c.id and m.direction = 'out' and m.status = 'queued' and m.sender = 'ai' and not (c.ai_enabled and c.status = 'ai');
  return query
  with picked as (
    select m.id from public.wa_messages m
    where m.direction = 'out' and m.status = 'queued' and m.next_attempt_at <= now()
    order by m.next_attempt_at, m.id limit p_limit for update skip locked
  ), upd as (
    update public.wa_messages m set status = 'sending', claimed_at = now(), attempts = m.attempts + 1, updated_at = now()
      from picked where m.id = picked.id
      returning m.id, m.conversation_id, m.kind, m.body, m.template_name, m.template_lang, m.template_params, m.purpose, m.sender, m.attempts
  )
  select u.id, u.conversation_id, ct.wa_id, u.kind, u.body, u.template_name, u.template_lang, u.template_params, u.purpose, u.sender, u.attempts,
         ct.consent, cv.last_inbound_at, (cv.ai_enabled and cv.status = 'ai'), ct.channel
    from upd u join public.wa_conversations cv on cv.id = u.conversation_id join public.wa_contacts ct on ct.id = cv.contact_id;
end $$;

-- ---------------------------------------------------------------------------------------------------------------- booking request: source label
-- Same as before; the request note names the channel it came from (the secretary calls the typed phone for Messenger/Instagram).
create or replace function public.wa_create_booking_request(p_conv bigint, p_wa_id text, p_clinic text, p_date date, p_time text, p_name text, p_type text, p_note text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_conflict text; v_id bigint; v_phone text := public.wa_norm_phone(p_wa_id); v_src text;
begin
  if p_date is null or coalesce(p_time, '') !~ '^\d{1,2}:\d{2}$' or coalesce(trim(p_name), '') = '' or coalesce(p_clinic, '') = '' or v_phone = '' then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  select case ct.channel when 'messenger' then 'ماسنجر' when 'instagram' then 'إنستجرام' else 'واتساب' end into v_src
    from public.wa_conversations cv join public.wa_contacts ct on ct.id = cv.contact_id where cv.id = p_conv;
  select r.id into v_id from public.iapp_booking_requests r
   where public.wa_norm_phone(r.phone) = v_phone and r.date = p_date and r."time" = p_time and r.clinic = p_clinic and r.status = 'pending';
  if v_id is not null then return jsonb_build_object('ok', true, 'duplicate', true, 'mode', 'request', 'request_id', v_id); end if;
  v_conflict := public.wa_slot_conflict(p_clinic, null, p_date, p_time);
  if v_conflict is not null then return jsonb_build_object('ok', false, 'error', v_conflict); end if;
  insert into public.iapp_booking_requests (patient_name, phone, clinic, date, time, visit_type, note, status)
    values (left(trim(p_name), 80), v_phone, p_clinic, p_date, p_time, coalesce(p_type, 'فحص روتيني'), left(coalesce(v_src, 'واتساب') || coalesce(' - ' || p_note, ''), 300), 'pending')
    returning id into v_id;
  perform public.wa_audit_add('ai', 'booking.request', p_conv, null, jsonb_build_object('request_id', v_id, 'date', p_date, 'time', p_time, 'clinic', p_clinic));
  return jsonb_build_object('ok', true, 'duplicate', false, 'mode', 'request', 'request_id', v_id);
end $$;

-- The phone a Messenger/Instagram patient typed while booking (shown to the secretary; never used for authorisation).
create or replace function public.wa_set_contact_phone(p_conv bigint, p_phone text) returns void language plpgsql security definer set search_path = public as $$
declare v_phone text := public.wa_norm_phone(p_phone);
begin
  if v_phone !~ '^0[0-9]{9,10}$' then return; end if;
  update public.wa_contacts ct set phone = v_phone, updated_at = now()
    from public.wa_conversations cv where cv.id = p_conv and ct.id = cv.contact_id and ct.channel <> 'whatsapp';
end $$;

-- ---------------------------------------------------------------------------------------------------------------- grants
revoke all on function public.wa_ingest_inbound_ch(text, text, text, text, text, text, timestamptz), public.wa_ingest_echo_ch(text, text, text, text, text, timestamptz),
  public.wa_ingest_inbound(text, text, text, text, text, timestamptz), public.wa_ingest_echo(text, text, text, text, timestamptz),
  public.wa_claim_outbound(int), public.wa_set_contact_phone(bigint, text), public.wa_set_consent(text, boolean, boolean, text),
  public.wa_enqueue_reminders(timestamptz), public.wa_create_booking_request(bigint, text, text, date, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.wa_ingest_inbound_ch(text, text, text, text, text, text, timestamptz), public.wa_ingest_echo_ch(text, text, text, text, text, timestamptz),
  public.wa_ingest_inbound(text, text, text, text, text, timestamptz), public.wa_ingest_echo(text, text, text, text, timestamptz),
  public.wa_claim_outbound(int), public.wa_set_contact_phone(bigint, text), public.wa_set_consent(text, boolean, boolean, text),
  public.wa_enqueue_reminders(timestamptz), public.wa_create_booking_request(bigint, text, text, date, text, text, text, text)
  to service_role;
revoke all on function public.wa_staff_set_reminder_consent(bigint, boolean) from public, anon;
grant execute on function public.wa_staff_set_reminder_consent(bigint, boolean) to authenticated;

do $$ begin
  if to_regprocedure('public.wa_ingest_inbound_ch(text,text,text,text,text,text,timestamptz)') is null
     or to_regprocedure('public.wa_claim_outbound(integer)') is null
     or has_function_privilege('anon', 'public.wa_ingest_inbound_ch(text,text,text,text,text,text,timestamptz)', 'execute')
     or has_function_privilege('authenticated', 'public.wa_claim_outbound(integer)', 'execute')
     or has_function_privilege('authenticated', 'public.wa_set_contact_phone(bigint,text)', 'execute')
     or exists (select 1 from public.wa_contacts where channel is distinct from 'whatsapp') then
    raise exception 'ABORT G1: objects/privileges are not as designed. Nothing was changed.';
  end if;
end $$;
commit;
