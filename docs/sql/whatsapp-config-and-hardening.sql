-- whatsapp-config-and-hardening.sql — run AFTER whatsapp-assistant.sql. Safe to re-run. Keeps every switch OFF.
-- 1) Meta ids of the TEST number (ids are not secrets). Replace with the production number's ids at go-live.
update public.wa_config set phone_number_id = '1353383321195397', waba_id = '1100607882763440', updated_at = now() where id = 1;
-- 2) Pin search_path on the two helpers flagged by the Supabase linter.
alter function public.wa_norm_phone(text) set search_path = public;
alter function public.wa_actor() set search_path = public;
select enabled, ai_enabled, reminders_enabled, booking_mode, phone_number_id from public.wa_config;
