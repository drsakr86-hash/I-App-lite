drop function if exists public.iapp_imaging_history(bigint,text,text);
drop function if exists public.iapp_link_imaging_study(bigint,bigint,bigint,text);
drop function if exists public.iapp_imaging_linkage_report();
-- keep iapp_imaging_link_audit (audit evidence) unless empty:
-- drop table public.iapp_imaging_link_audit; drop function public.iapp_guard_link_audit();
