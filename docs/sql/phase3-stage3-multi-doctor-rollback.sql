drop policy if exists store_doctor_ro on public.iapp_store;
drop policy if exists store_doctor_rw on public.iapp_store;
drop function if exists public.iapp_admin_remove_staff(text);
drop function if exists public.iapp_admin_set_staff(text,text,text,text);
drop function if exists public.iapp_current_doctor_key();
-- columns doctor_key/display_name on iapp_staff are left in place (nullable, harmless); drop only if empty:
-- alter table public.iapp_staff drop column doctor_key, drop column display_name;
