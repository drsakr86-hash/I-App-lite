-- whatsapp-assistant.sql — WhatsApp AI assistant + secretary inbox. NOT APPLIED until the owner approves.
-- Purely ADDITIVE: new wa_* tables, wa_* functions, RLS. It does not alter iapp_appointments / iapp_booking_requests /
-- any existing policy, trigger or view. Rollback: whatsapp-assistant-rollback.sql.
--
-- Design (see docs/whatsapp/ARCHITECTURE-REPORT.md):
--   * every Meta credential stays OUTSIDE the database (Edge Function secrets). wa_config holds only non-secret ids/settings.
--   * browsers (authenticated staff) may only SELECT conversations/messages (RLS: admin + secretary). All writes by staff go through
--     the wa_staff_* SECURITY DEFINER functions, which check the role and write an audit row.
--   * the Edge Functions use the service_role key; the wa_* worker functions are revoked from anon/authenticated.
--   * wa_messages is both the message log and the durable outbound queue (status 'queued' + next_attempt_at + idempotency_key).
--   * message bodies are stored only as text (media is not stored); webhook raw payloads are never stored.
--
-- Safety: one transaction, 3 s lock timeout, guard G0 (nothing exists yet / prerequisites present), guard G1 (objects present after).
begin;
set local lock_timeout = '3s';

do $$ begin
  if to_regclass('public.wa_conversations') is not null or to_regclass('public.wa_config') is not null then
    raise exception 'ABORT G0: WhatsApp objects already exist. Nothing was changed.';
  end if;
  if to_regclass('public.iapp_appointments') is null or to_regclass('public.iapp_booking_requests') is null
     or to_regprocedure('public.iapp_has_role(text[])') is null then
    raise exception 'ABORT G0: prerequisites missing (iapp_appointments / iapp_booking_requests / iapp_has_role). Nothing was changed.';
  end if;
end $$;

-- ---------------------------------------------------------------------------------------------------------------- helpers
-- Same normalisation as the app's normPhone (src/modules/patients/list.js): digits only, Egyptian prefix 20/0020 -> 0.
create or replace function public.wa_norm_phone(p text) returns text language sql immutable as $$
  select regexp_replace(regexp_replace(coalesce(p, ''), '\D', '', 'g'), '^(20|0020)', '0')
$$;

-- ---------------------------------------------------------------------------------------------------------------- tables
create table public.wa_config (
  id                    int primary key default 1 check (id = 1),
  enabled               boolean not null default false,          -- master switch: nothing is sent or answered while false
  ai_enabled            boolean not null default false,          -- AI replies (false = inbox only, humans answer)
  reminders_enabled     boolean not null default false,
  booking_mode          text    not null default 'request' check (booking_mode in ('request', 'direct')),
  phone_number_id       text,                                    -- Meta ids are not secrets; used to ignore events for other numbers
  waba_id               text,
  clinic_tz             text    not null default 'Africa/Cairo',
  reminder_offsets_min  int[]   not null default '{1440,120}',   -- minutes before the appointment
  reminder_template     text,                                    -- approved UTILITY template name (3 body params: date, time, clinic)
  reminder_template_lang text   not null default 'ar',
  handoff_notice        text    not null default 'تم تحويل محادثتك للسكرتارية وسيتم الرد عليك في أقرب وقت.',
  retention_days        int     not null default 180 check (retention_days between 30 and 3650),
  updated_at            timestamptz not null default now()
);
insert into public.wa_config (id) values (1);

create table public.wa_contacts (
  id                 bigint generated always as identity primary key,
  wa_id              text not null,                              -- digits only, as sent by Meta (e.g. 2010xxxxxxxx)
  profile_name       text,
  consent            text not null default 'service' check (consent in ('service', 'opted_out')),
  reminders_opt_in   boolean not null default false,             -- explicit consent to appointment reminders
  consent_source     text,                                       -- 'chat' | 'staff:<email>' (evidence of the opt-in)
  consent_at         timestamptz,
  opted_out_at       timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint wa_contacts_wa_id_digits check (wa_id ~ '^[0-9]{8,15}$')
);
create unique index wa_contacts_wa_id_uq on public.wa_contacts (wa_id);

create table public.wa_conversations (
  id                 bigint generated always as identity primary key,
  contact_id         bigint not null unique references public.wa_contacts (id) on delete cascade,
  status             text not null default 'ai' check (status in ('ai', 'handoff', 'closed')),
  ai_enabled         boolean not null default true,
  assigned_to        text,                                       -- staff e-mail
  unread_count       int not null default 0,
  last_message_at    timestamptz,
  last_inbound_at    timestamptz,                                -- start of the 24 h customer-service window
  last_preview       text,
  flow_state         jsonb not null default '{}'::jsonb,         -- assistant's short-lived booking state (proposed slot, expiry)
  handoff_reason     text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index wa_conversations_inbox_ix on public.wa_conversations (last_message_at desc);

create table public.wa_messages (
  id                 bigint generated always as identity primary key,
  conversation_id    bigint not null references public.wa_conversations (id) on delete cascade,
  direction          text not null check (direction in ('in', 'out')),
  sender             text not null check (sender in ('patient', 'ai', 'staff', 'system')),
  purpose            text not null default 'reply' check (purpose in ('inbound', 'reply', 'manual', 'reminder', 'confirmation', 'handoff')),
  kind               text not null default 'text' check (kind in ('text', 'template', 'other')),
  body               text check (char_length(body) <= 4096),
  template_name      text,
  template_lang      text,
  template_params    jsonb,
  provider_message_id text,
  status             text not null check (status in ('received', 'queued', 'sending', 'sent', 'delivered', 'read', 'failed', 'cancelled')),
  error_code         text,
  error_detail       text check (char_length(error_detail) <= 300),
  attempts           int not null default 0,
  next_attempt_at    timestamptz,
  claimed_at         timestamptz,
  idempotency_key    text,
  appointment_id     bigint,
  apt_date           date,
  apt_time           text,
  sent_by            text,
  processed_at       timestamptz,
  process_attempts   int not null default 0,
  process_error      text check (char_length(process_error) <= 300),
  provider_ts        timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create unique index wa_messages_provider_uq on public.wa_messages (provider_message_id) where provider_message_id is not null;
create unique index wa_messages_idem_uq     on public.wa_messages (idempotency_key)     where idempotency_key is not null;
create index wa_messages_conv_ix   on public.wa_messages (conversation_id, created_at);
create index wa_messages_queue_ix  on public.wa_messages (next_attempt_at) where direction = 'out' and status = 'queued';
create index wa_messages_inbox_ix  on public.wa_messages (conversation_id) where direction = 'in' and processed_at is null;
create index wa_messages_apt_ix    on public.wa_messages (appointment_id) where appointment_id is not null;

-- Webhook de-duplication + status events that arrived before we stored the provider id (applied=false => retried by the worker).
create table public.wa_webhook_events (
  event_key   text primary key,                  -- e.g. 'in:<wamid>' | 'st:<wamid>:<status>' | 'echo:<wamid>'
  kind        text not null,
  data        jsonb,
  applied     boolean not null default true,
  received_at timestamptz not null default now()
);
create index wa_webhook_events_pending_ix on public.wa_webhook_events (received_at) where not applied;

create table public.wa_audit (
  id              bigint generated always as identity primary key,
  at              timestamptz not null default now(),
  actor           text not null,                 -- staff e-mail | 'ai' | 'system' | 'patient'
  action          text not null,
  conversation_id bigint,
  appointment_id  bigint,
  detail          jsonb                          -- ids / codes only, never message text or clinical data
);
create index wa_audit_at_ix on public.wa_audit (at desc);

-- ---------------------------------------------------------------------------------------------------------------- RLS
alter table public.wa_config         enable row level security;
alter table public.wa_contacts       enable row level security;
alter table public.wa_conversations  enable row level security;
alter table public.wa_messages       enable row level security;
alter table public.wa_webhook_events enable row level security;
alter table public.wa_audit          enable row level security;

revoke all on public.wa_config, public.wa_contacts, public.wa_conversations, public.wa_messages, public.wa_webhook_events, public.wa_audit
  from public, anon, authenticated;
grant select on public.wa_contacts, public.wa_conversations, public.wa_messages to authenticated;
grant select, update on public.wa_config to authenticated;
grant select on public.wa_audit to authenticated;

create policy wa_contacts_staff      on public.wa_contacts      for select to authenticated using (public.iapp_has_role(array['admin', 'secretary']));
create policy wa_conversations_staff on public.wa_conversations for select to authenticated using (public.iapp_has_role(array['admin', 'secretary']));
create policy wa_messages_staff      on public.wa_messages      for select to authenticated using (public.iapp_has_role(array['admin', 'secretary']));
create policy wa_config_admin_sel    on public.wa_config       for select to authenticated using (public.iapp_has_role(array['admin']));
create policy wa_config_admin_upd    on public.wa_config       for update to authenticated using (public.iapp_has_role(array['admin'])) with check (public.iapp_has_role(array['admin']));
create policy wa_audit_admin         on public.wa_audit        for select to authenticated using (public.iapp_has_role(array['admin']));
-- wa_webhook_events: no policy => invisible to every client role (service_role bypasses RLS).

-- ---------------------------------------------------------------------------------------------------------------- audit helper
create or replace function public.wa_audit_add(p_actor text, p_action text, p_conv bigint, p_apt bigint, p_detail jsonb default null)
returns void language sql security definer set search_path = public as $$
  insert into public.wa_audit (actor, action, conversation_id, appointment_id, detail) values (coalesce(p_actor, 'system'), p_action, p_conv, p_apt, p_detail)
$$;

-- ---------------------------------------------------------------------------------------------------------------- message trigger
-- Keeps the conversation row in step with its messages, and makes a human reply stop the AI (no competing replies).
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
revoke all on function public.wa_messages_after_insert() from public, anon, authenticated;
create trigger wa_messages_after_insert_trg after insert on public.wa_messages for each row execute function public.wa_messages_after_insert();

-- ---------------------------------------------------------------------------------------------------------------- ingest (webhook)
-- Idempotent: the same wamid delivered twice (Meta retries for up to 7 days) creates ONE row.
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

-- A message the clinic typed on the WhatsApp Business app (coexistence "echo"). Marks the conversation as handled by a human.
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

-- Delivery status. Only moves forward (sent < delivered < read); 'failed' never overrides delivered/read.
-- Returns false when the message is not known yet (status arrived before the provider id was stored) -> caller keeps it pending.
create or replace function public.wa_apply_status(p_wamid text, p_status text, p_ts timestamptz, p_code text, p_detail text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_cur text;
begin
  select status into v_cur from public.wa_messages where provider_message_id = p_wamid and direction = 'out';
  if not found then return false; end if;
  if p_status = 'failed' then
    if v_cur in ('queued', 'sending', 'sent') then
      update public.wa_messages set status = 'failed', error_code = left(p_code, 40), error_detail = left(p_detail, 300), updated_at = now()
        where provider_message_id = p_wamid;
    end if;
  elsif p_status in ('sent', 'delivered', 'read') then
    if array_position(array['queued', 'sending', 'sent', 'delivered', 'read'], v_cur) < array_position(array['queued', 'sending', 'sent', 'delivered', 'read'], p_status) then
      update public.wa_messages set status = p_status, updated_at = now() where provider_message_id = p_wamid;
    end if;
  end if;
  return true;
end $$;

create or replace function public.wa_record_status_event(p_wamid text, p_status text, p_ts timestamptz, p_code text, p_detail text)
returns void language plpgsql security definer set search_path = public as $$
declare v_ok boolean;
begin
  insert into public.wa_webhook_events (event_key, kind, applied, data)
    values ('st:' || p_wamid || ':' || p_status, 'status', false, jsonb_build_object('wamid', p_wamid, 'status', p_status, 'ts', p_ts, 'code', p_code, 'detail', left(p_detail, 300)))
    on conflict do nothing;
  if not found then return; end if;            -- duplicate delivery of the same status event
  v_ok := public.wa_apply_status(p_wamid, p_status, p_ts, p_code, p_detail);
  if v_ok then update public.wa_webhook_events set applied = true where event_key = 'st:' || p_wamid || ':' || p_status; end if;
end $$;

-- Worker: retry status events whose message was not yet known (max 1 h old, then dropped).
create or replace function public.wa_retry_pending_statuses() returns int language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  for r in select event_key, data from public.wa_webhook_events where not applied and received_at > now() - interval '1 hour' order by received_at limit 200 loop
    if public.wa_apply_status(r.data ->> 'wamid', r.data ->> 'status', (r.data ->> 'ts')::timestamptz, r.data ->> 'code', r.data ->> 'detail') then
      update public.wa_webhook_events set applied = true where event_key = r.event_key; n := n + 1;
    end if;
  end loop;
  delete from public.wa_webhook_events where not applied and received_at <= now() - interval '1 hour';
  return n;
end $$;

-- ---------------------------------------------------------------------------------------------------------------- consent / opt-out
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

-- ---------------------------------------------------------------------------------------------------------------- outbound queue
-- Queue one text message. AI replies are queued only while the conversation still belongs to the AI (checked again when claimed).
create or replace function public.wa_enqueue_text(p_conv bigint, p_sender text, p_purpose text, p_body text, p_idem text, p_sent_by text)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_id bigint; v_ai boolean;
begin
  if p_sender = 'ai' then
    select (ai_enabled and status = 'ai') into v_ai from public.wa_conversations where id = p_conv for share;
    if not coalesce(v_ai, false) then return null; end if;
  end if;
  insert into public.wa_messages (conversation_id, direction, sender, purpose, kind, body, status, next_attempt_at, idempotency_key, sent_by)
    values (p_conv, 'out', p_sender, p_purpose, 'text', left(p_body, 4096), 'queued', now(), p_idem, p_sent_by)
    on conflict (idempotency_key) where idempotency_key is not null do nothing
    returning id into v_id;
  return v_id;                                     -- null when the idempotency key already exists (retry) or the AI lost the conversation
end $$;

create or replace function public.wa_claim_outbound(p_limit int default 10)
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

-- outcome: 'sent' | 'retry' (Meta answered with a transient error => the message was NOT sent) | 'failed' | 'uncertain' (no answer / timeout:
-- it may or may not have been sent, so it is NEVER retried automatically) | 'cancelled'.
create or replace function public.wa_finish_outbound(p_id bigint, p_outcome text, p_provider_id text, p_code text, p_detail text, p_retry_secs int default 60)
returns void language plpgsql security definer set search_path = public as $$
declare v_att int;
begin
  select attempts into v_att from public.wa_messages where id = p_id and status = 'sending' for update;
  if not found then return; end if;
  if p_outcome = 'sent' then
    update public.wa_messages set status = 'sent', provider_message_id = p_provider_id, error_code = null, error_detail = null, updated_at = now() where id = p_id;
  elsif p_outcome = 'retry' and v_att < 5 then
    update public.wa_messages set status = 'queued', next_attempt_at = now() + make_interval(secs => p_retry_secs * v_att), error_code = left(p_code, 40), error_detail = left(p_detail, 300), updated_at = now() where id = p_id;
  elsif p_outcome = 'cancelled' then
    update public.wa_messages set status = 'cancelled', error_code = left(p_code, 40), error_detail = left(p_detail, 300), updated_at = now() where id = p_id;
  else
    update public.wa_messages set status = 'failed',
      error_code = case when p_outcome = 'uncertain' then 'UNCERTAIN_DELIVERY' when p_outcome = 'retry' then 'RETRIES_EXHAUSTED' else left(p_code, 40) end,
      error_detail = left(p_detail, 300), updated_at = now() where id = p_id;
  end if;
end $$;

-- A worker that died after claiming leaves 'sending' rows. They may or may not have been sent: mark uncertain, never auto-resend.
create or replace function public.wa_reap_stuck() returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update public.wa_messages set status = 'failed', error_code = 'UNCERTAIN_DELIVERY', error_detail = 'worker stopped while sending', updated_at = now()
    where direction = 'out' and status = 'sending' and claimed_at < now() - interval '5 minutes';
  get diagnostics n = row_count;
  return n;
end $$;

-- ---------------------------------------------------------------------------------------------------------------- inbound processing claim
create or replace function public.wa_claim_inbound(p_limit int default 5)
returns table (conversation_id bigint, max_message_id bigint, attempts int)
language sql security definer set search_path = public as $$
  with picked as (
    select m.id, m.conversation_id from public.wa_messages m
    where m.direction = 'in' and m.processed_at is null and m.process_attempts < 5
      and (m.claimed_at is null or m.claimed_at < now() - interval '2 minutes')
      -- never process a conversation twice at once (a worker already holds an unprocessed message of it)
      and not exists (select 1 from public.wa_messages x where x.conversation_id = m.conversation_id and x.direction = 'in'
                        and x.processed_at is null and x.claimed_at >= now() - interval '2 minutes')
    order by m.id limit 50 for update skip locked
  ), upd as (
    update public.wa_messages m set claimed_at = now(), process_attempts = m.process_attempts + 1
      from picked where m.id = picked.id returning m.conversation_id, m.id, m.process_attempts
  )
  select conversation_id, max(id), max(process_attempts) from upd group by conversation_id order by min(id) limit p_limit
$$;

create or replace function public.wa_mark_processed(p_conv bigint, p_upto bigint, p_error text default null)
returns void language sql security definer set search_path = public as $$
  update public.wa_messages set processed_at = case when p_error is null then now() else processed_at end,
         process_error = left(p_error, 300), claimed_at = case when p_error is null then claimed_at else null end
   where conversation_id = p_conv and direction = 'in' and processed_at is null and id <= p_upto
$$;

-- AI gives up / asks for a human: the conversation is handed over, the patient gets one notice.
create or replace function public.wa_handoff(p_conv bigint, p_reason text, p_notify boolean default true)
returns void language plpgsql security definer set search_path = public as $$
declare v_notice text; v_was text;
begin
  select status into v_was from public.wa_conversations where id = p_conv for update;
  if v_was is null then return; end if;
  update public.wa_conversations set status = 'handoff', ai_enabled = false, handoff_reason = left(p_reason, 80), updated_at = now() where id = p_conv;
  perform public.wa_audit_add('ai', 'handoff', p_conv, null, jsonb_build_object('reason', p_reason));
  if p_notify and v_was = 'ai' then
    select handoff_notice into v_notice from public.wa_config where id = 1;
    insert into public.wa_messages (conversation_id, direction, sender, purpose, kind, body, status, next_attempt_at, idempotency_key)
      values (p_conv, 'out', 'system', 'handoff', 'text', v_notice, 'queued', now(), 'handoff:' || p_conv || ':' || to_char(now(), 'YYYYMMDDHH24'))
      on conflict (idempotency_key) where idempotency_key is not null do nothing;
  end if;
end $$;

-- ---------------------------------------------------------------------------------------------------------------- appointments (trusted operations)
-- The assistant never writes tables directly: every operation below re-checks ownership, slot and state on the server.
-- Slots already taken for one clinic/day = active appointments + still-pending booking requests.
create or replace function public.wa_taken_times(p_clinic text, p_date date)
returns table (slot text) language sql security definer set search_path = public stable as $$
  select a."time" from public.iapp_appointments a
   where a.clinic = p_clinic and a.date = p_date and not a.cancelled and coalesce(a.wait_status, '') <> 'cancelled' and a."time" is not null
  union
  select r."time" from public.iapp_booking_requests r where r.clinic = p_clinic and r.date = p_date and r.status = 'pending'
$$;

create or replace function public.wa_my_appointments(p_wa_id text)
returns table (id bigint, date date, "time" text, clinic text, doctor text, type text, confirmed boolean, patient text)
language sql security definer set search_path = public stable as $$
  select a.id, a.date, a."time", a.clinic, a.doctor, a.type, a.confirmed, a.patient from public.iapp_appointments a
   where public.wa_norm_phone(a.phone) = public.wa_norm_phone(p_wa_id) and public.wa_norm_phone(p_wa_id) <> ''
     and not a.cancelled and coalesce(a.wait_status, '') not in ('cancelled', 'done')
     and a.date >= (now() at time zone (select clinic_tz from public.wa_config where id = 1))::date
   order by a.date, a."time" limit 10
$$;

-- Shared slot check + advisory lock. Returns null when free, else the reason.
create or replace function public.wa_slot_conflict(p_clinic text, p_doctor text, p_date date, p_time text, p_ignore_apt bigint default null)
returns text language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtext('wa-slot:' || p_date::text || ':' || p_time));   -- serialises WhatsApp writers for this slot
  if exists (select 1 from public.iapp_appointments a where a.date = p_date and a."time" = p_time and not a.cancelled
               and coalesce(a.wait_status, '') <> 'cancelled' and (p_ignore_apt is null or a.id <> p_ignore_apt)
               and (a.clinic = p_clinic or (p_doctor is not null and a.doctor = p_doctor))) then return 'slot_taken'; end if;
  if exists (select 1 from public.iapp_booking_requests r where r.date = p_date and r."time" = p_time and r.clinic = p_clinic and r.status = 'pending') then return 'slot_taken'; end if;
  return null;
end $$;

-- 'request' mode: files a pending booking request (the secretary accepts it with the existing screen) => NOT confirmed.
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

-- 'direct' mode: creates the appointment itself (confirmed). Same fields the secretary's accept flow writes.
create or replace function public.wa_book_appointment(p_conv bigint, p_wa_id text, p_clinic text, p_doctor text, p_date date, p_time text, p_name text, p_type text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_conflict text; v_id bigint; v_phone text := public.wa_norm_phone(p_wa_id); v_try int := 0;
begin
  if p_date is null or coalesce(p_time, '') !~ '^\d{1,2}:\d{2}$' or coalesce(trim(p_name), '') = '' or coalesce(p_clinic, '') = '' or v_phone = '' then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  v_conflict := public.wa_slot_conflict(p_clinic, p_doctor, p_date, p_time);
  if v_conflict is not null then
    -- a retry by the same patient is not a conflict: report the appointment we already made
    select a.id into v_id from public.iapp_appointments a where public.wa_norm_phone(a.phone) = v_phone and a.date = p_date and a."time" = p_time
       and a.clinic = p_clinic and not a.cancelled and a.from_patient limit 1;
    if v_id is not null then return jsonb_build_object('ok', true, 'duplicate', true, 'mode', 'direct', 'appointment_id', v_id); end if;
    return jsonb_build_object('ok', false, 'error', v_conflict);
  end if;
  loop   -- ids are client-style timestamps in this app: retry on the (very unlikely) primary-key collision
    v_try := v_try + 1;
    v_id := (extract(epoch from clock_timestamp()) * 1000)::bigint + floor(random() * 997)::bigint;
    begin
      insert into public.iapp_appointments (id, patient_id, patient, phone, date, time, type, doctor, clinic, notes, confirmed, from_patient, cancelled, paid)
        values (v_id, null, left(trim(p_name), 80), v_phone, p_date, p_time, coalesce(p_type, 'فحص روتيني'), p_doctor, p_clinic, 'واتساب', true, true, false, false);
      exit;
    exception when unique_violation then
      if v_try >= 5 then return jsonb_build_object('ok', false, 'error', 'id_collision'); end if;
    end;
  end loop;
  -- verify what was persisted before the caller may tell the patient it worked
  if not exists (select 1 from public.iapp_appointments where id = v_id and date = p_date and "time" = p_time and not cancelled) then
    return jsonb_build_object('ok', false, 'error', 'not_persisted');
  end if;
  perform public.wa_audit_add('ai', 'booking.create', p_conv, v_id, jsonb_build_object('date', p_date, 'time', p_time, 'clinic', p_clinic));
  return jsonb_build_object('ok', true, 'duplicate', false, 'mode', 'direct', 'appointment_id', v_id);
end $$;

create or replace function public.wa_cancel_appointment(p_conv bigint, p_wa_id text, p_apt bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a public.iapp_appointments%rowtype; v_today date := (now() at time zone (select clinic_tz from public.wa_config where id = 1))::date;
begin
  select * into a from public.iapp_appointments where id = p_apt for update;
  if not found or public.wa_norm_phone(a.phone) <> public.wa_norm_phone(p_wa_id) or public.wa_norm_phone(p_wa_id) = '' then
    return jsonb_build_object('ok', false, 'error', 'not_found');            -- same answer for "not yours" and "does not exist"
  end if;
  if a.cancelled or coalesce(a.wait_status, '') = 'cancelled' then return jsonb_build_object('ok', true, 'duplicate', true); end if;
  if a.date < v_today or coalesce(a.wait_status, '') in ('done', 'in', 'called') then return jsonb_build_object('ok', false, 'error', 'not_cancellable'); end if;
  update public.iapp_appointments set cancelled = true, updated_at = now() where id = p_apt;
  if not exists (select 1 from public.iapp_appointments where id = p_apt and cancelled) then return jsonb_build_object('ok', false, 'error', 'not_persisted'); end if;
  update public.wa_messages set status = 'cancelled', error_code = 'OBSOLETE', updated_at = now() where appointment_id = p_apt and purpose = 'reminder' and status = 'queued';
  perform public.wa_audit_add('ai', 'booking.cancel', p_conv, p_apt, null);
  return jsonb_build_object('ok', true, 'duplicate', false);
end $$;

create or replace function public.wa_reschedule_appointment(p_conv bigint, p_wa_id text, p_apt bigint, p_date date, p_time text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a public.iapp_appointments%rowtype; v_conflict text; v_today date := (now() at time zone (select clinic_tz from public.wa_config where id = 1))::date;
begin
  if p_date is null or coalesce(p_time, '') !~ '^\d{1,2}:\d{2}$' then return jsonb_build_object('ok', false, 'error', 'invalid'); end if;
  select * into a from public.iapp_appointments where id = p_apt for update;
  if not found or public.wa_norm_phone(a.phone) <> public.wa_norm_phone(p_wa_id) or public.wa_norm_phone(p_wa_id) = '' then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if a.cancelled or a.date < v_today or coalesce(a.wait_status, '') in ('done', 'in', 'called', 'cancelled') then return jsonb_build_object('ok', false, 'error', 'not_reschedulable'); end if;
  if a.date = p_date and a."time" = p_time then return jsonb_build_object('ok', true, 'duplicate', true); end if;
  v_conflict := public.wa_slot_conflict(a.clinic, a.doctor, p_date, p_time, p_apt);
  if v_conflict is not null then return jsonb_build_object('ok', false, 'error', v_conflict); end if;
  update public.iapp_appointments set date = p_date, time = p_time, reminded = null, updated_at = now() where id = p_apt;
  if not exists (select 1 from public.iapp_appointments where id = p_apt and date = p_date and "time" = p_time) then return jsonb_build_object('ok', false, 'error', 'not_persisted'); end if;
  update public.wa_messages set status = 'cancelled', error_code = 'OBSOLETE', updated_at = now() where appointment_id = p_apt and purpose = 'reminder' and status = 'queued';
  perform public.wa_audit_add('ai', 'booking.reschedule', p_conv, p_apt, jsonb_build_object('date', p_date, 'time', p_time));
  return jsonb_build_object('ok', true, 'duplicate', false);
end $$;

-- ---------------------------------------------------------------------------------------------------------------- reminders
-- Idempotent: the unique idempotency_key 'rem:<apt>:<date>:<time>:<offset>' means a re-run (cron overlap, retry) inserts nothing new.
-- Only patients who explicitly opted in; template message (outside the 24 h window free text is not allowed); date/time/clinic only.
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

-- ---------------------------------------------------------------------------------------------------------------- staff actions (browser -> RPC)
create or replace function public.wa_actor() returns text language sql stable as $$ select coalesce(lower(auth.jwt() ->> 'email'), 'unknown') $$;

create or replace function public.wa_staff_take_over(p_conv bigint) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.iapp_has_role(array['admin', 'secretary']) then raise exception 'forbidden'; end if;
  update public.wa_conversations set status = 'handoff', ai_enabled = false, assigned_to = coalesce(assigned_to, public.wa_actor()),
         handoff_reason = coalesce(handoff_reason, 'staff_takeover'), updated_at = now() where id = p_conv;
  -- anything the AI had queued is withdrawn right now
  update public.wa_messages set status = 'cancelled', error_code = 'HUMAN_TAKEOVER', updated_at = now() where conversation_id = p_conv and direction = 'out' and sender = 'ai' and status = 'queued';
  perform public.wa_audit_add(public.wa_actor(), 'staff.take_over', p_conv, null, null);
end $$;

create or replace function public.wa_staff_return_to_ai(p_conv bigint) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.iapp_has_role(array['admin', 'secretary']) then raise exception 'forbidden'; end if;
  update public.wa_conversations set status = 'ai', ai_enabled = true, handoff_reason = null, flow_state = '{}'::jsonb, updated_at = now() where id = p_conv;
  perform public.wa_audit_add(public.wa_actor(), 'staff.return_to_ai', p_conv, null, null);
end $$;

create or replace function public.wa_staff_assign(p_conv bigint, p_assignee text) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.iapp_has_role(array['admin', 'secretary']) then raise exception 'forbidden'; end if;
  update public.wa_conversations set assigned_to = nullif(lower(trim(p_assignee)), ''), updated_at = now() where id = p_conv;
  perform public.wa_audit_add(public.wa_actor(), 'staff.assign', p_conv, null, jsonb_build_object('to', nullif(lower(trim(p_assignee)), '')));
end $$;

create or replace function public.wa_staff_mark_read(p_conv bigint) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.iapp_has_role(array['admin', 'secretary']) then raise exception 'forbidden'; end if;
  update public.wa_conversations set unread_count = 0 where id = p_conv and unread_count <> 0;
end $$;

create or replace function public.wa_staff_close(p_conv bigint) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.iapp_has_role(array['admin', 'secretary']) then raise exception 'forbidden'; end if;
  update public.wa_conversations set status = 'closed', ai_enabled = false, unread_count = 0, updated_at = now() where id = p_conv;
  perform public.wa_audit_add(public.wa_actor(), 'staff.close', p_conv, null, null);
end $$;

create or replace function public.wa_staff_set_reminder_consent(p_contact bigint, p_value boolean) returns void language plpgsql security definer set search_path = public as $$
declare v_wa text;
begin
  if not public.iapp_has_role(array['admin', 'secretary']) then raise exception 'forbidden'; end if;
  select wa_id into v_wa from public.wa_contacts where id = p_contact and consent <> 'opted_out';
  if v_wa is null then raise exception 'contact not found or opted out'; end if;
  perform public.wa_set_consent(v_wa, p_value, false, 'staff:' || public.wa_actor());
end $$;

-- Staff retry of a failed outbound message (e.g. UNCERTAIN_DELIVERY after a timeout: the secretary decides, knowing it may duplicate).
create or replace function public.wa_staff_retry(p_msg bigint) returns void language plpgsql security definer set search_path = public as $$
declare v_conv bigint;
begin
  if not public.iapp_has_role(array['admin', 'secretary']) then raise exception 'forbidden'; end if;
  update public.wa_messages set status = 'queued', attempts = 0, next_attempt_at = now(), error_detail = null, updated_at = now()
   where id = p_msg and direction = 'out' and status = 'failed' and coalesce(error_code, '') <> 'OBSOLETE' returning conversation_id into v_conv;
  if v_conv is not null then perform public.wa_audit_add(public.wa_actor(), 'staff.retry', v_conv, null, jsonb_build_object('message_id', p_msg)); end if;
end $$;

-- ---------------------------------------------------------------------------------------------------------------- retention
create or replace function public.wa_purge(p_now timestamptz default now()) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_days int; m int; e int; c int;
begin
  select retention_days into v_days from public.wa_config where id = 1;
  delete from public.wa_messages where created_at < p_now - make_interval(days => v_days); get diagnostics m = row_count;
  delete from public.wa_webhook_events where received_at < p_now - interval '14 days'; get diagnostics e = row_count;
  delete from public.wa_conversations cv where not exists (select 1 from public.wa_messages x where x.conversation_id = cv.id)
    and cv.updated_at < p_now - make_interval(days => v_days); get diagnostics c = row_count;
  delete from public.wa_audit where at < p_now - interval '2 years';
  return jsonb_build_object('messages', m, 'events', e, 'conversations', c);
end $$;

-- ---------------------------------------------------------------------------------------------------------------- grants
-- Worker/ingest functions: service_role ONLY.
revoke all on function
  public.wa_audit_add(text, text, bigint, bigint, jsonb), public.wa_ingest_inbound(text, text, text, text, text, timestamptz),
  public.wa_ingest_echo(text, text, text, text, timestamptz), public.wa_apply_status(text, text, timestamptz, text, text),
  public.wa_record_status_event(text, text, timestamptz, text, text), public.wa_retry_pending_statuses(),
  public.wa_set_consent(text, boolean, boolean, text), public.wa_enqueue_text(bigint, text, text, text, text, text),
  public.wa_claim_outbound(int), public.wa_finish_outbound(bigint, text, text, text, text, int), public.wa_reap_stuck(),
  public.wa_claim_inbound(int), public.wa_mark_processed(bigint, bigint, text), public.wa_handoff(bigint, text, boolean),
  public.wa_taken_times(text, date), public.wa_my_appointments(text), public.wa_slot_conflict(text, text, date, text, bigint),
  public.wa_create_booking_request(bigint, text, text, date, text, text, text, text),
  public.wa_book_appointment(bigint, text, text, text, date, text, text, text),
  public.wa_cancel_appointment(bigint, text, bigint), public.wa_reschedule_appointment(bigint, text, bigint, date, text),
  public.wa_enqueue_reminders(timestamptz), public.wa_purge(timestamptz)
  from public, anon, authenticated;
grant execute on function
  public.wa_audit_add(text, text, bigint, bigint, jsonb), public.wa_ingest_inbound(text, text, text, text, text, timestamptz),
  public.wa_ingest_echo(text, text, text, text, timestamptz), public.wa_apply_status(text, text, timestamptz, text, text),
  public.wa_record_status_event(text, text, timestamptz, text, text), public.wa_retry_pending_statuses(),
  public.wa_set_consent(text, boolean, boolean, text), public.wa_enqueue_text(bigint, text, text, text, text, text),
  public.wa_claim_outbound(int), public.wa_finish_outbound(bigint, text, text, text, text, int), public.wa_reap_stuck(),
  public.wa_claim_inbound(int), public.wa_mark_processed(bigint, bigint, text), public.wa_handoff(bigint, text, boolean),
  public.wa_taken_times(text, date), public.wa_my_appointments(text), public.wa_slot_conflict(text, text, date, text, bigint),
  public.wa_create_booking_request(bigint, text, text, date, text, text, text, text),
  public.wa_book_appointment(bigint, text, text, text, date, text, text, text),
  public.wa_cancel_appointment(bigint, text, bigint), public.wa_reschedule_appointment(bigint, text, bigint, date, text),
  public.wa_enqueue_reminders(timestamptz), public.wa_purge(timestamptz)
  to service_role;
-- Staff functions: authenticated (role checked inside).
revoke all on function public.wa_staff_take_over(bigint), public.wa_staff_return_to_ai(bigint), public.wa_staff_assign(bigint, text), public.wa_staff_mark_read(bigint),
  public.wa_staff_close(bigint), public.wa_staff_set_reminder_consent(bigint, boolean), public.wa_staff_retry(bigint), public.wa_actor() from public, anon;
grant execute on function public.wa_staff_take_over(bigint), public.wa_staff_return_to_ai(bigint), public.wa_staff_assign(bigint, text), public.wa_staff_mark_read(bigint),
  public.wa_staff_close(bigint), public.wa_staff_set_reminder_consent(bigint, boolean), public.wa_staff_retry(bigint), public.wa_actor() to authenticated;
revoke all on function public.wa_messages_after_insert() from public, anon, authenticated;

do $$ begin
  if to_regclass('public.wa_messages') is null or to_regprocedure('public.wa_book_appointment(bigint,text,text,text,date,text,text,text)') is null
     or has_function_privilege('anon', 'public.wa_book_appointment(bigint,text,text,text,date,text,text,text)', 'execute')
     or has_function_privilege('authenticated', 'public.wa_book_appointment(bigint,text,text,text,date,text,text,text)', 'execute')
     or has_table_privilege('anon', 'public.wa_messages', 'select') then
    raise exception 'ABORT G1: objects/privileges are not as designed. Nothing was changed.';
  end if;
end $$;
commit;
