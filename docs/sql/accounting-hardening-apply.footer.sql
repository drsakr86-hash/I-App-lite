
-- ===================== footer G1 =====================
do $$
declare n int;
begin
  if to_regprocedure('public.iapp_fin_collection_state(text[],text[])') is null then raise exception 'ABORT G1: RPC missing. Nothing was changed.'; end if;
  if to_regclass('public.iapp_entries_source_ref_uq') is null then raise exception 'ABORT G1: unique index missing. Nothing was changed.'; end if;
  select count(*) into n from pg_policies where schemaname='public' and cmd in ('SELECT','ALL')
     and tablename in ('iapp_charges','iapp_payments','iapp_fin_accounts','iapp_accounting_entries','iapp_accounting_entry_lines','iapp_fin_audit')
     and policyname like 'fin_secretary%';
  if n > 0 then raise exception 'ABORT G1: % secretary SELECT policy(ies) remain. Nothing was changed.', n; end if;
  select count(*) into n from pg_proc where pronamespace='public'::regnamespace and proname in
    ('iapp_fin_charges_guard','iapp_fin_payments_guard','iapp_fin_entries_guard','iapp_fin_charge_net','iapp_fin_charge_paid','iapp_fin_period_closed') and prosecdef;
  if n <> 6 then raise exception 'ABORT G1: only % of 6 guards/helpers are SECURITY DEFINER. Nothing was changed.', n; end if;
  if not exists (select 1 from pg_trigger where tgname='iapp_fin_audit_guard_trg' and not tgisinternal) then raise exception 'ABORT G1: audit guard trigger missing. Nothing was changed.'; end if;
end $$;
commit;
