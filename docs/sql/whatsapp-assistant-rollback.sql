-- whatsapp-assistant-rollback.sql — removes everything whatsapp-assistant.sql created. Touches NO existing object.
-- WARNING: deletes all WhatsApp conversations/messages/audit rows. Take a backup first if they matter.
-- Appointments created or cancelled by the assistant stay (they are ordinary iapp_appointments rows).
begin;
set local lock_timeout = '3s';
do $$ begin
  if to_regclass('public.wa_conversations') is null then raise exception 'ABORT G0: WhatsApp objects not present. Nothing was changed.'; end if;
end $$;
drop function if exists
  public.wa_purge(timestamptz), public.wa_staff_retry(bigint), public.wa_staff_set_reminder_consent(bigint, boolean), public.wa_staff_close(bigint),
  public.wa_staff_mark_read(bigint), public.wa_staff_assign(bigint, text), public.wa_staff_return_to_ai(bigint), public.wa_staff_take_over(bigint), public.wa_actor(),
  public.wa_enqueue_reminders(timestamptz), public.wa_reschedule_appointment(bigint, text, bigint, date, text), public.wa_cancel_appointment(bigint, text, bigint),
  public.wa_book_appointment(bigint, text, text, text, date, text, text, text), public.wa_create_booking_request(bigint, text, text, date, text, text, text, text),
  public.wa_slot_conflict(text, text, date, text, bigint), public.wa_my_appointments(text), public.wa_taken_times(text, date),
  public.wa_handoff(bigint, text, boolean), public.wa_mark_processed(bigint, bigint, text), public.wa_claim_inbound(int), public.wa_reap_stuck(),
  public.wa_finish_outbound(bigint, text, text, text, text, int), public.wa_claim_outbound(int), public.wa_enqueue_text(bigint, text, text, text, text, text),
  public.wa_set_consent(text, boolean, boolean, text), public.wa_retry_pending_statuses(), public.wa_record_status_event(text, text, timestamptz, text, text),
  public.wa_apply_status(text, text, timestamptz, text, text), public.wa_ingest_echo(text, text, text, text, timestamptz),
  public.wa_ingest_inbound(text, text, text, text, text, timestamptz), public.wa_audit_add(text, text, bigint, bigint, jsonb), public.wa_norm_phone(text);
drop table if exists public.wa_faq, public.wa_audit, public.wa_webhook_events, public.wa_messages, public.wa_conversations, public.wa_contacts, public.wa_config cascade;
drop function if exists public.wa_messages_after_insert();
do $$ begin
  if to_regclass('public.wa_messages') is not null or to_regclass('public.wa_config') is not null then raise exception 'ABORT G1: tables still present. Nothing was changed.'; end if;
end $$;
commit;
