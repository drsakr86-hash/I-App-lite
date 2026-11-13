-- Path A (steps 1-2): staff replies -> admin review -> approved clinic FAQ (wa_faq).  PREPARED, NOT APPLIED.
-- Needs the owner's explicit approval before it runs. Adds one table + two admin-only RPCs. Touches nothing else
-- (no change to wa_messages / wa_faq structure, no change to secretary permissions, Scribe, Gemini or backups).
-- Staff replies are already stored in wa_messages (sender='staff'), so nothing new is recorded: this only lets the admin decide
-- which replies become knowledge. Nothing reaches the assistant until the admin approves it (it is then a normal wa_faq row).
do $$ begin
  if to_regclass('public.wa_messages') is null or to_regclass('public.wa_faq') is null
     or to_regprocedure('public.iapp_has_role(text[])') is null or to_regprocedure('public.wa_actor()') is null then
    raise exception 'ABORT KR0: whatsapp prerequisites missing. Nothing was changed.';
  end if;
end $$;

create table if not exists public.wa_reply_review (
  message_id  bigint primary key references public.wa_messages (id) on delete cascade,
  decision    text not null check (decision in ('approved', 'ignored')),
  faq_id      bigint references public.wa_faq (id) on delete set null,
  decided_by  text,
  decided_at  timestamptz not null default now()
);
alter table public.wa_reply_review enable row level security;
revoke all on public.wa_reply_review from public, anon, authenticated;
grant select on public.wa_reply_review to authenticated;
create policy wa_reply_review_admin on public.wa_reply_review for select to authenticated using (public.iapp_has_role(array['admin']));

-- Staff replies not yet reviewed, each with the patient message that came right before it (same conversation, within 24 h).
create or replace function public.wa_reply_candidates(p_limit int default 30)
returns table (message_id bigint, question text, answer text, replied_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.iapp_has_role(array['admin']) then raise exception 'forbidden'; end if;
  return query
    select m.id,
           (select q.body from public.wa_messages q
             where q.conversation_id = m.conversation_id and q.direction = 'in' and q.sender = 'patient' and q.kind = 'text'
               and q.created_at < m.created_at and q.created_at > m.created_at - interval '24 hours'
             order by q.created_at desc limit 1),
           m.body, m.created_at
      from public.wa_messages m
     where m.direction = 'out' and m.sender = 'staff' and m.kind = 'text'
       and m.status not in ('failed', 'cancelled') and char_length(coalesce(m.body, '')) >= 15
       and m.created_at > now() - interval '90 days'
       and not exists (select 1 from public.wa_reply_review r where r.message_id = m.id)
     order by m.created_at desc
     limit greatest(1, least(coalesce(p_limit, 30), 100));
end $$;

-- Admin decision. 'approved' adds the (edited) text to wa_faq; 'ignored' only hides the reply from the list.
create or replace function public.wa_reply_decide(p_msg bigint, p_decision text, p_topic text default null, p_answer text default null)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_faq bigint;
begin
  if not public.iapp_has_role(array['admin']) then raise exception 'forbidden'; end if;
  if p_decision not in ('approved', 'ignored') then raise exception 'bad_decision'; end if;
  if not exists (select 1 from public.wa_messages where id = p_msg and direction = 'out' and sender = 'staff') then raise exception 'not_a_staff_reply'; end if;
  if exists (select 1 from public.wa_reply_review where message_id = p_msg) then raise exception 'already_reviewed'; end if;
  if p_decision = 'approved' then
    if char_length(btrim(coalesce(p_topic, ''))) not between 2 and 80 or char_length(btrim(coalesce(p_answer, ''))) not between 2 and 1200 then raise exception 'bad_text'; end if;
    insert into public.wa_faq (topic, answer, active, updated_by) values (btrim(p_topic), btrim(p_answer), true, public.wa_actor()) returning id into v_faq;
  end if;
  insert into public.wa_reply_review (message_id, decision, faq_id, decided_by) values (p_msg, p_decision, v_faq, public.wa_actor());
  perform public.wa_audit_add(public.wa_actor(), 'knowledge.' || p_decision, null, null, jsonb_build_object('message_id', p_msg, 'faq_id', v_faq));
  return v_faq;
end $$;

revoke all on function public.wa_reply_candidates(int), public.wa_reply_decide(bigint, text, text, text) from public, anon;
grant execute on function public.wa_reply_candidates(int), public.wa_reply_decide(bigint, text, text, text) to authenticated;
