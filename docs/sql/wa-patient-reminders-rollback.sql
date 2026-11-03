-- Rollback of wa-patient-reminders.sql: back to the messenger-channels.sql reminder function (offset-based, chat opt-in only).
begin;
update public.wa_messages set status = 'cancelled', error_code = 'ROLLBACK', updated_at = now() where purpose in ('followup', 'checkup') and status = 'queued';
update public.wa_messages set purpose = 'reminder' where purpose in ('followup', 'checkup');
alter table public.wa_messages drop constraint wa_messages_purpose_check;
alter table public.wa_messages add constraint wa_messages_purpose_check check (purpose in ('inbound', 'reply', 'manual', 'reminder', 'confirmation', 'handoff'));
drop function public.wa_confirm_from_reminder(bigint, timestamptz);
drop function public.wa_queue_template(bigint, text, text, text, jsonb, text, text, bigint, date, text, timestamptz);
drop function public.wa_conv_for_phone(text);
drop function public.wa_patients_json();
drop function public.wa_tparam(text, text);
drop function public.wa_ar_clinic(text);
drop function public.wa_ar_time(text);
drop function public.wa_ar_date(date, boolean);
alter table public.wa_config drop column reminder_send_hour, drop column followups_enabled, drop column followup_template, drop column checkup_template, drop column followup_send_hour;
update public.wa_config set reminders_enabled = false, reminder_template = null where id = 1;
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
drop function public.wa_phone_to_waid(text);
revoke all on function public.wa_enqueue_reminders(timestamptz) from public, anon, authenticated;
grant execute on function public.wa_enqueue_reminders(timestamptz) to service_role;
commit;
