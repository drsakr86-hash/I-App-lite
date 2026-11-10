-- APPLIED to production (mofdveiwlaymlabvsypu) on 2026-11-10 as migration wa_push_claim_drop_service_role_only.
-- Before: wa_push_claim() and wa_push_drop(bigint[]) were executable by `authenticated` (any logged-in account) although
-- whatsapp-push.sql intends service_role only. Only the Edge worker (service_role) calls them; the web app does not.
revoke execute on function public.wa_push_claim()        from public, anon, authenticated;
revoke execute on function public.wa_push_drop(bigint[]) from public, anon, authenticated;
grant  execute on function public.wa_push_claim()        to service_role;
grant  execute on function public.wa_push_drop(bigint[]) to service_role;
-- Verify: select r, has_function_privilege(r,'public.wa_push_claim()','execute') from unnest(array['anon','authenticated','service_role']) r;
-- Rollback (restores the previous state):
--   grant execute on function public.wa_push_claim() to authenticated;
--   grant execute on function public.wa_push_drop(bigint[]) to authenticated;
