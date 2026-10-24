-- Admin-only hard delete of one WhatsApp conversation (and, by cascade, all its messages).
-- NOT APPLIED until the clinic owner runs it in the Supabase SQL editor. Idempotent (create or replace).
-- Not reversible: take a backup first if the conversation matters. The contact row (phone, consent, opt-out) is kept on purpose,
-- so a patient who opted out is never silently re-enabled. An audit row (no message text) records who deleted what.
-- A conversation the assistant is still running (status 'ai') cannot be deleted: close it or hand it over first.
create or replace function public.wa_staff_delete_conversation(p_conv bigint) returns void language plpgsql security definer set search_path = public as $$
declare v_status text; v_msgs int;
begin
  if not public.iapp_has_role(array['admin']) then raise exception 'forbidden'; end if;
  select status into v_status from public.wa_conversations where id = p_conv for update;
  if v_status is null then raise exception 'not_found'; end if;
  if v_status = 'ai' then raise exception 'conversation_active'; end if;
  select count(*) into v_msgs from public.wa_messages where conversation_id = p_conv;
  delete from public.wa_conversations where id = p_conv;   -- wa_messages cascade
  perform public.wa_audit_add(public.wa_actor(), 'staff.delete_conversation', p_conv, null, jsonb_build_object('messages', v_msgs));
end $$;
revoke all on function public.wa_staff_delete_conversation(bigint) from public, anon;
grant execute on function public.wa_staff_delete_conversation(bigint) to authenticated;

-- Rollback of the function only (deleted data is not recoverable):
-- drop function if exists public.wa_staff_delete_conversation(bigint);
