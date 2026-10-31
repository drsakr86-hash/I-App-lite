-- messenger-channels-rollback.sql — undoes messenger-channels.sql. Restores the WhatsApp-only functions exactly as in whatsapp-assistant.sql.
-- WARNING: deletes every Messenger/Instagram contact (their conversations and messages cascade). WhatsApp data is untouched.
begin;
set local lock_timeout = '3s';
do $$ begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'wa_contacts' and column_name = 'channel') then
    raise exception 'ABORT G0: messenger-channels.sql is not applied. Nothing was changed.';
  end if;
end $$;
delete from public.wa_contacts where channel <> 'whatsapp';
drop function if exists public.wa_ingest_inbound_ch(text, text, text, text, text, text, timestamptz), public.wa_ingest_echo_ch(text, text, text, text, text, timestamptz),
  public.wa_set_contact_phone(bigint, text);
drop function public.wa_ingest_inbound(text, text, text, text, text, timestamptz);
drop function public.wa_ingest_echo(text, text, text, text, timestamptz);
drop function public.wa_claim_outbound(int);
drop index public.wa_contacts_channel_wa_id_uq;
create unique index wa_contacts_wa_id_uq on public.wa_contacts (wa_id);
alter table public.wa_contacts drop constraint wa_contacts_wa_id_digits;
alter table public.wa_contacts add constraint wa_contacts_wa_id_digits check (wa_id ~ '^[0-9]{8,15}$');
alter table public.wa_contacts drop column phone, drop column channel;
alter table public.wa_config drop column page_id, drop column ig_account_id;

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
      -- a staff message (from the inbox OR typed on the phone app and echoed back) hands the conversation to a human
      ai_enabled = case when new.sender = 'staff' then false else ai_enabled end,
      status = case when new.sender = 'staff' then 'handoff' else status end,
      assigned_to = case when new.sender = 'staff' and assigned_to is null and coalesce(new.sent_by, 'whatsapp-app') <> 'whatsapp-app' then new.sent_by else assigned_to end,
      handoff_reason = case when new.sender = 'staff' and handoff_reason is null then 'staff_reply' else handoff_reason end,
      updated_at = now()
    where id = new.conversation_id;
  end if;
  return new;
end $$;

create or replace function public.wa_ingest_inbound(p_wa_id text, p_profile_name text, p_wamid text, p_kind text, p_body text, p_ts timestamptz)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_contact bigint; v_conv bigint; v_msg bigint;
begin
  if p_wamid is null or p_wa_id is null then raise exception 'wa_ingest_inbound: missing ids'; end if;
  insert into public.wa_webhook_events (event_key, kind) values ('in:' || p_wamid, 'in') on conflict do nothing;
  if not found then return jsonb_build_object('duplicate', true); end if;
  insert into public.wa_contacts (wa_id, profile_name) values (p_wa_id, left(p_profile_name, 80))
    on conflict (wa_id) do update set profile_name = coalesce(excluded.profile_name, public.wa_contacts.profile_name), updated_at = now()
    returning id into v_contact;
  insert into public.wa_conversations (contact_id) values (v_contact) on conflict (contact_id) do nothing;
  select id into v_conv from public.wa_conversations where contact_id = v_contact;
  insert into public.wa_messages (conversation_id, direction, sender, purpose, kind, body, provider_message_id, status, provider_ts)
    values (v_conv, 'in', 'patient', 'inbound', case when p_kind = 'text' then 'text' else 'other' end, left(p_body, 4096), p_wamid, 'received', p_ts)
    returning id into v_msg;
  return jsonb_build_object('duplicate', false, 'conversation_id', v_conv, 'message_id', v_msg);
end $$;

create or replace function public.wa_ingest_echo(p_to_wa_id text, p_wamid text, p_kind text, p_body text, p_ts timestamptz)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_contact bigint; v_conv bigint;
begin
  insert into public.wa_webhook_events (event_key, kind) values ('echo:' || p_wamid, 'echo') on conflict do nothing;
  if not found then return jsonb_build_object('duplicate', true); end if;
  -- a message we sent ourselves through the API is echoed too: ignore it when we already know its provider id
  if exists (select 1 from public.wa_messages where provider_message_id = p_wamid) then return jsonb_build_object('duplicate', true); end if;
  insert into public.wa_contacts (wa_id) values (p_to_wa_id) on conflict (wa_id) do nothing;
  select id into v_contact from public.wa_contacts where wa_id = p_to_wa_id;
  insert into public.wa_conversations (contact_id) values (v_contact) on conflict (contact_id) do nothing;
  select id into v_conv from public.wa_conversations where contact_id = v_contact;
  insert into public.wa_messages (conversation_id, direction, sender, purpose, kind, body, provider_message_id, status, provider_ts, sent_by)
    values (v_conv, 'out', 'staff', 'manual', case when p_kind = 'text' then 'text' else 'other' end, left(p_body, 4096), p_wamid, 'sent', p_ts, 'whatsapp-app');
  return jsonb_build_object('duplicate', false, 'conversation_id', v_conv);
end $$;

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
  where wa_id = p_wa_id returning id into v_contact;
  if v_contact is not null then
    perform public.wa_audit_add(coalesce(p_source, 'system'), case when p_opt_out then 'consent.opt_out' else 'consent.reminders' end,
      (select id from public.wa_conversations where contact_id = v_contact), null, jsonb_build_object('reminders', p_reminders));
  end if;
end $$;

create or replace function public.wa_staff_set_reminder_consent(p_contact bigint, p_value boolean) returns void language plpgsql security definer set search_path = public as $$
declare v_wa text;
begin
  if not public.iapp_has_role(array['admin', 'secretary']) then raise exception 'forbidden'; end if;
  select wa_id into v_wa from public.wa_contacts where id = p_contact and consent <> 'opted_out';
  if v_wa is null then raise exception 'contact not found or opted out'; end if;
  perform public.wa_set_consent(v_wa, p_value, false, 'staff:' || public.wa_actor());
end $$;

create or replace function public.wa_enqueue_reminders(p_now timestamptz default now()) returns int
language plpgsql security definer set search_path = public as $$
declare cfg public.wa_config%rowtype; n int := 0; k int; o int;
begin
  select * into cfg from public.wa_config where id = 1;
  -- queued reminders whose appointment was cancelled / moved / removed are withdrawn first
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
      join public.wa_contacts c on public.wa_norm_phone(c.wa_id) = public.wa_norm_phone(a.phone) and c.reminders_opt_in and c.consent <> 'opted_out'
      join public.wa_conversations cv on cv.contact_id = c.id
     where not a.cancelled and coalesce(a.wait_status, '') not in ('cancelled', 'done') and a."time" ~ '^\d{1,2}:\d{2}$'
       and ((a.date + a."time"::time) at time zone cfg.clinic_tz) > p_now                                                    -- appointment still ahead
       and ((a.date + a."time"::time) at time zone cfg.clinic_tz) - make_interval(mins => o) <= p_now                          -- reminder time reached
       and ((a.date + a."time"::time) at time zone cfg.clinic_tz) - make_interval(mins => o) > p_now - interval '3 hours'      -- ...but not stale
    on conflict (idempotency_key) where idempotency_key is not null do nothing;
    get diagnostics k = row_count;
    n := n + k;
  end loop;
  return n;
end $$;

create or replace function public.wa_create_booking_request(p_conv bigint, p_wa_id text, p_clinic text, p_date date, p_time text, p_name text, p_type text, p_note text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_conflict text; v_id bigint; v_phone text := public.wa_norm_phone(p_wa_id);
begin
  if p_date is null or coalesce(p_time, '') !~ '^\d{1,2}:\d{2}$' or coalesce(trim(p_name), '') = '' or coalesce(p_clinic, '') = '' or v_phone = '' then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  -- retry of the same request: report the existing one instead of creating a second
  select r.id into v_id from public.iapp_booking_requests r
   where public.wa_norm_phone(r.phone) = v_phone and r.date = p_date and r."time" = p_time and r.clinic = p_clinic and r.status = 'pending';
  if v_id is not null then return jsonb_build_object('ok', true, 'duplicate', true, 'mode', 'request', 'request_id', v_id); end if;
  v_conflict := public.wa_slot_conflict(p_clinic, null, p_date, p_time);
  if v_conflict is not null then return jsonb_build_object('ok', false, 'error', v_conflict); end if;
  insert into public.iapp_booking_requests (patient_name, phone, clinic, date, time, visit_type, note, status)
    values (left(trim(p_name), 80), v_phone, p_clinic, p_date, p_time, coalesce(p_type, 'فحص روتيني'), left('واتساب' || coalesce(' - ' || p_note, ''), 300), 'pending')
    returning id into v_id;
  perform public.wa_audit_add('ai', 'booking.request', p_conv, null, jsonb_build_object('request_id', v_id, 'date', p_date, 'time', p_time, 'clinic', p_clinic));
  return jsonb_build_object('ok', true, 'duplicate', false, 'mode', 'request', 'request_id', v_id);
end $$;

create function public.wa_claim_outbound(p_limit int default 10)
returns table (id bigint, conversation_id bigint, wa_id text, kind text, body text, template_name text, template_lang text,
               template_params jsonb, purpose text, sender text, attempts int, consent text, last_inbound_at timestamptz, ai_active boolean)
language plpgsql security definer set search_path = public as $$
begin
  -- an AI reply is never sent once a human (or the opt-out) took the conversation
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
         ct.consent, cv.last_inbound_at, (cv.ai_enabled and cv.status = 'ai')
    from upd u join public.wa_conversations cv on cv.id = u.conversation_id join public.wa_contacts ct on ct.id = cv.contact_id;
end $$;

revoke all on function public.wa_messages_after_insert() from public, anon, authenticated;
revoke all on function public.wa_ingest_inbound(text, text, text, text, text, timestamptz), public.wa_ingest_echo(text, text, text, text, timestamptz),
  public.wa_claim_outbound(int), public.wa_set_consent(text, boolean, boolean, text), public.wa_enqueue_reminders(timestamptz),
  public.wa_create_booking_request(bigint, text, text, date, text, text, text, text) from public, anon, authenticated;
grant execute on function public.wa_ingest_inbound(text, text, text, text, text, timestamptz), public.wa_ingest_echo(text, text, text, text, timestamptz),
  public.wa_claim_outbound(int), public.wa_set_consent(text, boolean, boolean, text), public.wa_enqueue_reminders(timestamptz),
  public.wa_create_booking_request(bigint, text, text, date, text, text, text, text) to service_role;
revoke all on function public.wa_staff_set_reminder_consent(bigint, boolean) from public, anon;
grant execute on function public.wa_staff_set_reminder_consent(bigint, boolean) to authenticated;
commit;
