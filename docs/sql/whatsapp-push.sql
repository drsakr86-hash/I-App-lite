-- Web Push for chats waiting for staff (works while the app is CLOSED).
-- NOT APPLIED until the clinic owner runs it in the Supabase SQL editor. Idempotent. Needs docs/sql/whatsapp-assistant.sql (iapp_has_role, wa_actor).
-- Secrets: the VAPID *private* key lives only in the Edge secret VAPID_PRIVATE_KEY. The *public* key is stored in wa_config.push_public_key.
-- Rollback at the bottom. Nothing here touches patient data, appointments or existing WhatsApp rows.

alter table public.wa_config        add column if not exists push_public_key  text;
alter table public.wa_conversations add column if not exists push_notified_at timestamptz;

create table if not exists public.wa_push_subscriptions (
  id          bigserial primary key,
  endpoint    text not null unique check (endpoint ~ '^https://' and length(endpoint) <= 2000),
  p256dh      text not null check (length(p256dh) between 20 and 200),
  auth        text not null check (length(auth) between 8 and 100),
  user_email  text,
  created_at  timestamptz not null default now()
);
alter table public.wa_push_subscriptions enable row level security;      -- no policies: only the functions below (and service_role) can touch it
revoke all on table public.wa_push_subscriptions from public, anon, authenticated;
revoke all on sequence public.wa_push_subscriptions_id_seq from public, anon, authenticated;

-- Browser asks which key to subscribe with (staff only).
create or replace function public.wa_push_public_key() returns text language plpgsql stable security definer set search_path = public as $$
begin
  if not public.iapp_has_role(array['admin', 'secretary']) then raise exception 'forbidden'; end if;
  return (select push_public_key from public.wa_config where id = 1);
end $$;

create or replace function public.wa_push_subscribe(p_endpoint text, p_p256dh text, p_auth text) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.iapp_has_role(array['admin', 'secretary']) then raise exception 'forbidden'; end if;
  insert into public.wa_push_subscriptions (endpoint, p256dh, auth, user_email) values (p_endpoint, p_p256dh, p_auth, public.wa_actor())
  on conflict (endpoint) do update set p256dh = excluded.p256dh, auth = excluded.auth, user_email = excluded.user_email;
end $$;

create or replace function public.wa_push_unsubscribe(p_endpoint text) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.iapp_has_role(array['admin', 'secretary']) then raise exception 'forbidden'; end if;
  delete from public.wa_push_subscriptions where endpoint = p_endpoint;
end $$;

-- Worker (service_role only): atomically picks chats that just started waiting for staff and marks them notified.
-- A chat is picked when it is handed over, has unread patient messages, and either was never notified or the patient wrote again
-- after the last notice (at most one notice per chat per 5 minutes). Returns null (and marks nothing) when push is not configured or nobody subscribed.
create or replace function public.wa_push_claim() returns jsonb language plpgsql security definer set search_path = public as $$
declare v_key text; v_n int; v_subs jsonb;
begin
  select push_public_key into v_key from public.wa_config where id = 1;
  if v_key is null or not exists (select 1 from public.wa_push_subscriptions) then return null; end if;
  with c as (
    update public.wa_conversations set push_notified_at = now()
     where status = 'handoff' and unread_count > 0
       and (push_notified_at is null or (push_notified_at < now() - interval '5 minutes' and last_inbound_at > push_notified_at))
    returning id)
  select count(*) into v_n from c;
  if v_n = 0 then return null; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'endpoint', endpoint, 'p256dh', p256dh, 'auth', auth)), '[]'::jsonb) into v_subs from public.wa_push_subscriptions;
  return jsonb_build_object('count', v_n, 'public_key', v_key, 'subs', v_subs);
end $$;

-- Worker: forget subscriptions the push service reported as gone (404/410).
create or replace function public.wa_push_drop(p_ids bigint[]) returns void language sql security definer set search_path = public as $$
  delete from public.wa_push_subscriptions where id = any(p_ids)
$$;

revoke all on function public.wa_push_public_key(), public.wa_push_subscribe(text, text, text), public.wa_push_unsubscribe(text), public.wa_push_claim(), public.wa_push_drop(bigint[]) from public, anon;
grant execute on function public.wa_push_public_key(), public.wa_push_subscribe(text, text, text), public.wa_push_unsubscribe(text) to authenticated;
grant execute on function public.wa_push_claim(), public.wa_push_drop(bigint[]) to service_role;

-- After running this file, store the PUBLIC key (from public/vapid-keys.html) once:
--   update public.wa_config set push_public_key = '<public key>' where id = 1;

-- Rollback (removes only what this file added):
-- drop function if exists public.wa_push_public_key(), public.wa_push_subscribe(text, text, text), public.wa_push_unsubscribe(text), public.wa_push_claim(), public.wa_push_drop(bigint[]);
-- drop table if exists public.wa_push_subscriptions;
-- alter table public.wa_conversations drop column if exists push_notified_at;
-- alter table public.wa_config drop column if exists push_public_key;
