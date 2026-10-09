-- =====================================================================================
-- I-App Lite — ACCOUNTING HARDENING (migration v2, idempotent, applies ON TOP of accounting-core.sql)
-- NOT APPLIED to production — review, then apply once. Rollback: accounting-hardening-rollback.sql
--
-- What it fixes (found in the review of accounting-core.sql v1)
--   H1  Guard functions ran with the CALLER's rights, so for a secretary they saw only the rows RLS lets her read:
--       * the overpayment check summed only her 36-hour window of payments  → old payments were invisible
--       * the period-lock check could not read iapp_cash_reconciliations     → a closed period could be posted into
--       Guards and helpers are now SECURITY DEFINER (search_path pinned) and their EXECUTE is revoked from clients.
--   H2  Secretary balances: she no longer reads ANY row of iapp_charges / iapp_payments / iapp_fin_accounts.
--       She calls iapp_fin_collection_state(apt ids) which returns, for those appointments only, the charge(s) and the
--       totals (net, paid, refunded, outstanding) computed from the FULL ledger, plus the usable accounts.
--   H3  Ledger integrity: an entry must now match a real origin row (charge / payment / expense / reconciliation /
--       reversal) — id, type, date, source, clinic, and the exact lines (ledger codes, accounts, category, amounts, sides).
--       One entry per origin row (unique source_ref). A secretary can only post entries for COLLECT_MODAL charges/payments.
--   H4  Payments: legacy account / 'legacy' method are migration-only; payments need a CHARGE row; doctor payments need an
--       approved settlement and cannot exceed the remaining share; reversals must mirror the original (amount, account,
--       charge); reversing a refund cannot push paid above net.
--   H6  Idempotent retries: a guard never re-judges a row whose id already exists (offline re-send → ON CONFLICT DO NOTHING).
--   H3b Entry lines get server-derived ids (no silent drop on id collision).
--   H5  RLS: secretary INSERT-only on charges/payments/entries/audit with tight checks; audit rows must reference an
--       existing charge/payment (definer trigger); no SELECT on any finance table.
--
-- PRE-FLIGHT (read-only, run first; every result must be 0 rows):
--   select source_ref, count(*) from public.iapp_accounting_entries where source_ref is not null group by 1 having count(*) > 1;
--   select e.id from public.iapp_accounting_entries e where e.source_ref is not null and e.id <> 'ent-' || e.source_ref and e.type <> 'reversal';
-- Existing rows are NOT re-validated (guards run on new inserts only).
-- =====================================================================================

-- ---------- 1. one entry per origin row -------------------------------------------------
create unique index if not exists iapp_entries_source_ref_uq on public.iapp_accounting_entries (source_ref) where source_ref is not null;

-- ---------- 2. helpers (SECURITY DEFINER: they must see the whole ledger, not the caller's RLS slice) ---------------
create or replace function public.iapp_fin_charge_net(p_charge text) returns numeric
language sql stable security definer set search_path = public as
$$ select coalesce(sum(net_amount), 0) from public.iapp_charges where id = p_charge or parent_id = p_charge $$;

create or replace function public.iapp_fin_charge_paid(p_charge text) returns numeric
language sql stable security definer set search_path = public as
$$ select coalesce(sum(case when p.kind = 'payment' then p.amount else -p.amount end), 0)
   from public.iapp_payments p
   where p.charge_id = p_charge and p.kind in ('payment','refund')
     and not exists (select 1 from public.iapp_payments r where r.kind = 'reversal' and r.reversal_of = p.id) $$;

create or replace function public.iapp_fin_period_closed(p_account text, p_date date) returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.iapp_cash_reconciliations r where r.account_id = p_account and r.status = 'closed' and p_date <= r.period_to) $$;

-- account a NEW collection may use: active, not the migration-only legacy account
create or replace function public.iapp_fin_account_usable(p_account text) returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.iapp_fin_accounts a where a.id = p_account and a.active and not a.is_legacy) $$;

create or replace function public.iapp_fin_audit_origin_ok(p_entity text, p_id text) returns boolean
language sql stable security definer set search_path = public as
$$ select case p_entity
     when 'charge' then exists (select 1 from public.iapp_charges where id = p_id)
     when 'payment' then exists (select 1 from public.iapp_payments where id = p_id)
     else false end $$;

-- canonical text of a lines array: order-independent, scale-independent
create or replace function public.iapp_fin_norm_lines(p_lines jsonb) returns text
language sql immutable set search_path = public as
$$ select coalesce(string_agg(k, ';' order by k), '') from (
     select (l->>'ledger') || '|' || coalesce(nullif(l->>'accountId',''), '') || '|' || coalesce(nullif(l->>'category',''), '') || '|' ||
            coalesce((l->>'debit')::numeric, 0)::numeric(14,2)::text || '|' || coalesce((l->>'credit')::numeric, 0)::numeric(14,2)::text as k
     from jsonb_array_elements(p_lines) l) s $$;

create or replace function public.iapp_fin_line(p_ledger text, p_account text, p_category text, p_debit numeric, p_credit numeric) returns jsonb
language sql immutable set search_path = public as
$$ select jsonb_build_object('ledger', p_ledger, 'accountId', p_account, 'category', p_category, 'debit', p_debit, 'credit', p_credit) $$;

-- ---------- 3. guards (definer) ---------------------------------------------------------------------------------
create or replace function public.iapp_fin_charges_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_paid numeric; v_net numeric;
begin
  -- an offline retry re-sends a row that already exists: let ON CONFLICT DO NOTHING discard it (never re-judge it)
  if exists (select 1 from public.iapp_charges where id = new.id) then return new; end if;
  if new.kind = 'adjustment' then
    perform pg_advisory_xact_lock(hashtext('fin:' || new.parent_id));
    if not exists (select 1 from public.iapp_charges where id = new.parent_id and kind = 'charge') then
      raise exception 'adjustment must reference an existing charge';
    end if;
    v_paid := public.iapp_fin_charge_paid(new.parent_id);
    v_net := public.iapp_fin_charge_net(new.parent_id) + new.net_amount;
    if v_net < 0 or v_net < v_paid then
      raise exception 'charge cannot be reduced below the amount already paid (net %, paid %)', v_net, v_paid;
    end if;
  end if;
  return new;
end $$;

create or replace function public.iapp_fin_payments_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_orig public.iapp_payments; v_out numeric; v_paid numeric; v_acc public.iapp_fin_accounts; v_to public.iapp_fin_accounts;
        v_set public.iapp_doctor_settlements; v_done numeric;
begin
  if exists (select 1 from public.iapp_payments where id = new.id) then return new; end if;   -- idempotent retry
  select * into v_acc from public.iapp_fin_accounts where id = new.account_id;
  if v_acc.id is null then raise exception 'payment needs an account'; end if;
  if not v_acc.active and new.kind <> 'reversal' then raise exception 'account % is inactive', v_acc.id; end if;
  if new.kind <> 'reversal' and new.source <> 'LEGACY_VISIT' and (v_acc.is_legacy or new.method = 'legacy') then
    raise exception 'the legacy account / legacy method are migration-only';
  end if;
  if public.iapp_fin_period_closed(new.account_id, new.payment_date)
     or (new.to_account_id is not null and public.iapp_fin_period_closed(new.to_account_id, new.payment_date)) then
    raise exception 'cash period is reconciled and closed for account %', new.account_id;
  end if;

  if new.kind in ('payment','refund') then
    if not exists (select 1 from public.iapp_charges where id = new.charge_id and kind = 'charge') then
      raise exception 'a payment must reference a base charge';
    end if;
    perform pg_advisory_xact_lock(hashtext('fin:' || new.charge_id));   -- serialise concurrent devices per charge
    v_paid := public.iapp_fin_charge_paid(new.charge_id);
    if new.kind = 'payment' then
      v_out := public.iapp_fin_charge_net(new.charge_id) - v_paid;
      if new.amount > v_out then raise exception 'payment % exceeds the outstanding balance %', new.amount, v_out; end if;
    elsif new.amount > v_paid then
      raise exception 'refund % exceeds the amount paid %', new.amount, v_paid;
    end if;
  elsif new.kind = 'doctor_payment' then
    perform pg_advisory_xact_lock(hashtext('fin:' || new.settlement_id));
    select * into v_set from public.iapp_doctor_settlements where id = new.settlement_id;
    if v_set.id is null then raise exception 'doctor payment needs an existing settlement'; end if;
    if v_set.status not in ('approved','partial') then raise exception 'settlement % is not payable (status %)', v_set.id, v_set.status; end if;
    select coalesce(sum(p.amount), 0) into v_done from public.iapp_payments p
      where p.settlement_id = v_set.id and p.kind = 'doctor_payment'
        and not exists (select 1 from public.iapp_payments r where r.kind = 'reversal' and r.reversal_of = p.id);
    if new.amount > v_set.doctor_share - v_done then
      raise exception 'doctor payment % exceeds the remaining settlement %', new.amount, v_set.doctor_share - v_done;
    end if;
  elsif new.kind = 'transfer' then
    select * into v_to from public.iapp_fin_accounts where id = new.to_account_id;
    if v_to.id is null or not v_to.active then raise exception 'transfer target account is missing or inactive'; end if;
  elsif new.kind = 'reversal' then
    select * into v_orig from public.iapp_payments where id = new.reversal_of;
    if v_orig.id is null or v_orig.kind = 'reversal' then raise exception 'reversal must reference an original money row'; end if;
    if new.amount <> v_orig.amount or new.account_id <> v_orig.account_id
       or new.charge_id is distinct from v_orig.charge_id or new.settlement_id is distinct from v_orig.settlement_id
       or new.to_account_id is distinct from v_orig.to_account_id then
      raise exception 'a reversal must mirror the original (amount, accounts, charge, settlement)';
    end if;
    if v_orig.kind = 'refund' and public.iapp_fin_charge_paid(v_orig.charge_id) + v_orig.amount > public.iapp_fin_charge_net(v_orig.charge_id) then
      raise exception 'reversing this refund would put paid above the charge net';
    end if;
  end if;
  return new;
end $$;

create or replace function public.iapp_fin_expenses_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_acc public.iapp_fin_accounts; v_orig public.iapp_expenses;
begin
  if tg_op = 'DELETE' then
    if old.status = 'paid' then raise exception 'a paid expense cannot be deleted (reverse it)' using errcode = 'restrict_violation'; end if;
    return old;
  end if;
  if tg_op = 'UPDATE' and old.status in ('paid','cancelled') and
     (to_jsonb(new) - 'updated_at') is distinct from (to_jsonb(old) - 'updated_at') then
    raise exception 'a % expense is immutable (reverse it)', old.status using errcode = 'restrict_violation';
  end if;
  if new.status = 'paid' and (tg_op = 'INSERT' or old.status is distinct from 'paid') then
    select * into v_acc from public.iapp_fin_accounts where id = new.account_id;
    if v_acc.id is null then raise exception 'an expense payment needs an account'; end if;
    if not v_acc.active and new.reversal_of is null and coalesce(new.source,'') <> 'LEGACY_EXPENSE' then raise exception 'account % is inactive', v_acc.id; end if;
    if coalesce(new.source,'') <> 'LEGACY_EXPENSE' and (v_acc.is_legacy or new.payment_method = 'legacy') and new.reversal_of is null then
      raise exception 'the legacy account / legacy method are migration-only';
    end if;
    if coalesce(new.source,'') <> 'LEGACY_EXPENSE' and public.iapp_fin_period_closed(new.account_id, new.paid_at) then
      raise exception 'cash period is reconciled and closed for account %', new.account_id;
    end if;
  end if;
  if new.reversal_of is not null then
    select * into v_orig from public.iapp_expenses where id = new.reversal_of;
    if v_orig.id is null or v_orig.status <> 'paid' or v_orig.reversal_of is not null then raise exception 'reversal must reference a paid expense'; end if;
    if new.amount is distinct from v_orig.amount or new.account_id is distinct from v_orig.account_id then
      raise exception 'an expense reversal must mirror the original (amount, account)';
    end if;
  end if;
  return new;
end $$;

create or replace function public.iapp_fin_accounts_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then raise exception 'accounts are never deleted (deactivate instead)' using errcode = 'restrict_violation'; end if;
  if new.opening_balance is distinct from old.opening_balance and
     (exists (select 1 from public.iapp_accounting_entry_lines where account_id = old.id)) then
    raise exception 'opening balance is locked once the account has movements' using errcode = 'restrict_violation';
  end if;
  if new.type is distinct from old.type or new.is_legacy is distinct from old.is_legacy then
    raise exception 'account type / legacy flag cannot change' using errcode = 'restrict_violation';
  end if;
  new.updated_at := now();
  return new;
end $$;

create or replace function public.iapp_fin_settlements_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then raise exception 'only a draft settlement can be deleted' using errcode = 'restrict_violation'; end if;
    return old;
  end if;
  if new.gross_revenue is distinct from old.gross_revenue or new.doctor_share is distinct from old.doctor_share
     or new.center_share is distinct from old.center_share or new.period_from is distinct from old.period_from
     or new.period_to is distinct from old.period_to or new.doctor is distinct from old.doctor then
    raise exception 'settlement amounts are fixed once created (cancel and recreate)' using errcode = 'restrict_violation';
  end if;
  if old.status in ('cancelled') and new.status is distinct from old.status then
    raise exception 'a cancelled settlement is final' using errcode = 'restrict_violation';
  end if;
  new.updated_at := now();
  return new;
end $$;

-- LEDGER INTEGRITY: an entry is only accepted when it is exactly what its origin row implies.
create or replace function public.iapp_fin_entries_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  l jsonb; d numeric := 0; c numeric := 0; v_dr numeric; v_cr numeric;
  ch public.iapp_charges; p public.iapp_payments; x public.iapp_expenses; r public.iapp_cash_reconciliations; o public.iapp_accounting_entries;
  v_exp jsonb; v_date date; v_src text; v_clinic text; v_amt numeric; v_orig_entry text; v_oc text; v_collect boolean;
begin
  if exists (select 1 from public.iapp_accounting_entries where id = new.id) then return new; end if;   -- idempotent retry
  -- 1. structure (as in v1)
  for l in select * from jsonb_array_elements(new.lines) loop
    if (l->>'ledger') not in ('ASSET','RECEIVABLE','REVENUE','EXPENSE','DOCTOR_SHARE','OVER_SHORT') then raise exception 'invalid ledger code in entry %', new.id; end if;
    v_dr := coalesce((l->>'debit')::numeric, 0); v_cr := coalesce((l->>'credit')::numeric, 0);
    if v_dr < 0 or v_cr < 0 or (v_dr = 0) = (v_cr = 0) then raise exception 'each entry line needs exactly one non-zero side (entry %)', new.id; end if;
    if (l->>'ledger') = 'ASSET' and not exists (select 1 from public.iapp_fin_accounts a where a.id = l->>'accountId') then
      raise exception 'ASSET line needs an existing account (entry %)', new.id;
    end if;
    d := d + v_dr; c := c + v_cr;
  end loop;
  if d <> c or d = 0 then raise exception 'entry % is unbalanced (debit %, credit %)', new.id, d, c; end if;

  -- 2. identity: one entry per origin row, id derived from it
  if new.source_ref is null or btrim(new.source_ref) = '' then raise exception 'entry % must reference its origin row (source_ref)', new.id; end if;
  if new.id <> 'ent-' || new.source_ref then raise exception 'entry id must be ent-<source_ref> (entry %)', new.id; end if;

  -- 3. the origin row must exist and the entry must be exactly what it implies
  if new.type = 'charge' then
    select * into ch from public.iapp_charges where id = new.source_ref;
    if ch.id is null then raise exception 'entry % has no matching charge', new.id; end if;
    v_amt := abs(ch.net_amount); v_date := ch.service_date; v_src := ch.source; v_clinic := ch.clinic;
    v_exp := case when ch.net_amount >= 0
      then jsonb_build_array(public.iapp_fin_line('RECEIVABLE', null, null, v_amt, 0), public.iapp_fin_line('REVENUE', null, null, 0, v_amt))
      else jsonb_build_array(public.iapp_fin_line('REVENUE', null, null, v_amt, 0), public.iapp_fin_line('RECEIVABLE', null, null, 0, v_amt)) end;
    v_collect := ch.kind = 'charge' and ch.source = 'COLLECT_MODAL';

  elsif new.type in ('payment','refund','doctor_payment','transfer') then
    select * into p from public.iapp_payments where id = new.source_ref and kind = new.type;
    if p.id is null then raise exception 'entry % has no matching % row', new.id, new.type; end if;
    v_amt := p.amount; v_date := p.payment_date; v_src := p.source; v_clinic := p.clinic;
    v_exp := case p.kind
      when 'payment' then jsonb_build_array(public.iapp_fin_line('ASSET', p.account_id, null, v_amt, 0), public.iapp_fin_line('RECEIVABLE', null, null, 0, v_amt))
      when 'refund' then jsonb_build_array(public.iapp_fin_line('RECEIVABLE', null, null, v_amt, 0), public.iapp_fin_line('ASSET', p.account_id, null, 0, v_amt))
      when 'doctor_payment' then jsonb_build_array(public.iapp_fin_line('DOCTOR_SHARE', null, null, v_amt, 0), public.iapp_fin_line('ASSET', p.account_id, null, 0, v_amt))
      else jsonb_build_array(public.iapp_fin_line('ASSET', p.to_account_id, null, v_amt, 0), public.iapp_fin_line('ASSET', p.account_id, null, 0, v_amt)) end;
    v_collect := p.kind = 'payment' and p.source = 'COLLECT_MODAL';

  elsif new.type = 'expense' then
    select * into x from public.iapp_expenses where id = new.source_ref;
    if x.id is null or x.status <> 'paid' or x.reversal_of is not null then raise exception 'entry % needs a paid, non-reversal expense', new.id; end if;
    v_amt := nullif(x.amount, '')::numeric; v_date := coalesce(x.paid_at, x.date); v_src := x.source; v_clinic := x.clinic;
    v_exp := jsonb_build_array(public.iapp_fin_line('EXPENSE', null, x.category, v_amt, 0), public.iapp_fin_line('ASSET', x.account_id, null, 0, v_amt));
    v_collect := false;

  elsif new.type = 'reversal' then
    if new.reversal_of is null then raise exception 'a reversal entry must reference the entry it reverses'; end if;
    select * into p from public.iapp_payments where id = new.source_ref and kind = 'reversal';
    if p.id is not null then
      v_orig_entry := 'ent-' || p.reversal_of; v_date := p.payment_date; v_src := (select source from public.iapp_payments where id = p.reversal_of); v_clinic := p.clinic;
    else
      select * into x from public.iapp_expenses where id = new.source_ref and reversal_of is not null;
      if x.id is null then raise exception 'entry % has no matching reversal row', new.id; end if;
      v_orig_entry := 'ent-' || x.reversal_of; v_date := coalesce(x.paid_at, x.date); v_src := x.source; v_clinic := x.clinic;
    end if;
    if new.reversal_of <> v_orig_entry then raise exception 'entry % reverses the wrong entry (expected %)', new.id, v_orig_entry; end if;
    select * into o from public.iapp_accounting_entries where id = new.reversal_of;
    if o.id is null then raise exception 'the reversed entry % does not exist', new.reversal_of; end if;
    if o.type = 'reversal' then raise exception 'a reversal cannot be reversed'; end if;
    if new.reversal_of_type is distinct from o.type then raise exception 'reversal_of_type must equal the original entry type (%)', o.type; end if;
    -- mirror: same lines with debit/credit swapped
    select jsonb_agg(public.iapp_fin_line(ol->>'ledger', nullif(ol->>'accountId',''), nullif(ol->>'category',''),
                                          coalesce((ol->>'credit')::numeric, 0), coalesce((ol->>'debit')::numeric, 0)))
      into v_exp from jsonb_array_elements(o.lines) ol;
    v_collect := false;

  elsif new.type = 'adjustment' then
    if new.source_ref not like 'recadj-%' then raise exception 'unsupported adjustment entry %', new.id; end if;
    select * into r from public.iapp_cash_reconciliations where id = substr(new.source_ref, 8);
    if r.id is null or r.difference = 0 then raise exception 'entry % needs a reconciliation with a non-zero difference', new.id; end if;
    v_amt := abs(r.difference); v_date := r.period_to; v_src := 'RECONCILIATION'; v_clinic := null;
    v_exp := case when r.difference > 0
      then jsonb_build_array(public.iapp_fin_line('ASSET', r.account_id, null, v_amt, 0), public.iapp_fin_line('OVER_SHORT', null, null, 0, v_amt))
      else jsonb_build_array(public.iapp_fin_line('OVER_SHORT', null, null, v_amt, 0), public.iapp_fin_line('ASSET', r.account_id, null, 0, v_amt)) end;
    v_collect := false;
  else
    raise exception 'unsupported entry type %', new.type;
  end if;

  if new.date is distinct from v_date then raise exception 'entry % date does not match its origin row', new.id; end if;
  if coalesce(new.source, 'MANUAL') is distinct from coalesce(v_src, 'MANUAL') then raise exception 'entry % source does not match its origin row', new.id; end if;
  if nullif(new.clinic, '') is distinct from nullif(v_clinic, '') then raise exception 'entry % clinic does not match its origin row', new.id; end if;
  if public.iapp_fin_norm_lines(new.lines) is distinct from public.iapp_fin_norm_lines(v_exp) then
    raise exception 'entry % lines do not match what its origin row implies', new.id;
  end if;

  -- 4. a secretary may only post the ledger side of a documented collection
  if public.iapp_has_role(array['secretary']) and not public.iapp_is_admin() then
    if new.type not in ('charge','payment') or not v_collect then
      raise exception 'a secretary can only post entries for her own COLLECT_MODAL charges and payments';
    end if;
  end if;
  return new;
end $$;

-- line ids are derived by the server (<entry id>-l<n>): a client-chosen id could collide with another entry's line and, with
-- ON CONFLICT DO NOTHING, silently drop a line (an entry that balances on paper but not in the table)
create or replace function public.iapp_fin_entries_expand() returns trigger
language plpgsql security definer set search_path = public as $$
declare l jsonb; i int := 0;
begin
  for l in select * from jsonb_array_elements(new.lines) loop
    i := i + 1;
    insert into public.iapp_accounting_entry_lines (id, entry_id, ledger, account_id, category, debit, credit)
    values (new.id || '-l' || i, new.id, l->>'ledger', nullif(l->>'accountId',''), nullif(l->>'category',''),
            coalesce((l->>'debit')::numeric, 0), coalesce((l->>'credit')::numeric, 0));
  end loop;
  return null;
end $$;

-- ---------- 4. no client may call the definer helpers directly -----------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array[
    'iapp_fin_charge_net(text)','iapp_fin_charge_paid(text)','iapp_fin_period_closed(text,date)','iapp_fin_account_usable(text)',
    'iapp_fin_audit_origin_ok(text,text)','iapp_fin_norm_lines(jsonb)','iapp_fin_line(text,text,text,numeric,numeric)',
    'iapp_fin_block_mutation()','iapp_fin_charges_guard()','iapp_fin_payments_guard()','iapp_fin_expenses_guard()',
    'iapp_fin_accounts_guard()','iapp_fin_settlements_guard()','iapp_fin_entries_guard()','iapp_fin_entries_expand()'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
  end loop;
end $$;

-- ---------- 5. secretary read path: aggregates only, from the FULL ledger ---------------------------------------------
-- Returns, for the given appointment ids ONLY: the base charge(s) (+ adjustments) and net/paid/refunded/outstanding,
-- plus the accounts a collection may use. No other finance row is ever returned.
create or replace function public.iapp_fin_collection_state(p_apt_ids text[], p_pending_ids text[] default '{}') returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_out jsonb;
begin
  if not (public.iapp_is_admin() or public.iapp_has_role(array['secretary'])) then
    raise exception 'not allowed' using errcode = 'insufficient_privilege';
  end if;
  if p_apt_ids is null or cardinality(p_apt_ids) = 0 or cardinality(p_apt_ids) > 20 then
    raise exception 'between 1 and 20 appointment ids are required';
  end if;
  if cardinality(coalesce(p_pending_ids, '{}')) > 200 then raise exception 'too many pending ids'; end if;
  select jsonb_build_object(
    'accounts', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'name', a.name, 'type', a.type, 'clinic', a.clinic, 'active', a.active, 'is_legacy', a.is_legacy) order by a.created_at)
                          from public.iapp_fin_accounts a where a.active and not a.is_legacy), '[]'::jsonb),
    'charges', coalesce((
      select jsonb_agg(jsonb_build_object(
        'charge', to_jsonb(c),
        'adjustments', coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at) from public.iapp_charges a where a.parent_id = c.id), '[]'::jsonb),
        'net', public.iapp_fin_charge_net(c.id),
        'paid', coalesce((select sum(p.amount) from public.iapp_payments p where p.charge_id = c.id and p.kind = 'payment'
                          and not exists (select 1 from public.iapp_payments r where r.kind = 'reversal' and r.reversal_of = p.id)), 0),
        'refunded', coalesce((select sum(p.amount) from public.iapp_payments p where p.charge_id = c.id and p.kind = 'refund'
                              and not exists (select 1 from public.iapp_payments r where r.kind = 'reversal' and r.reversal_of = p.id)), 0),
        'outstanding', public.iapp_fin_charge_net(c.id) - public.iapp_fin_charge_paid(c.id)))
      from public.iapp_charges c
      where c.kind = 'charge'
        and (c.appointment_id = any(p_apt_ids) or c.source_ref = any(select 'apt-' || x from unnest(p_apt_ids) x) or c.visit_id = any(select 'apt-' || x from unnest(p_apt_ids) x))
    ), '[]'::jsonb),
    -- which of the caller's own not-yet-confirmed row ids (offline queue) the server already holds: lets the client avoid
    -- counting them twice. Only ids the caller sent are echoed back.
    'known_ids', coalesce((select jsonb_agg(x) from (
        select id as x from public.iapp_payments where id = any(coalesce(p_pending_ids, '{}'))
        union select id from public.iapp_charges where id = any(coalesce(p_pending_ids, '{}'))) k), '[]'::jsonb)) into v_out;
  return v_out;
end $$;
revoke all on function public.iapp_fin_collection_state(text[], text[]) from public, anon;
grant execute on function public.iapp_fin_collection_state(text[], text[]) to authenticated;

-- ---------- 6. RLS: the secretary can INSERT a documented collection and read nothing -------------------------------
drop policy if exists fin_secretary_accounts_read on public.iapp_fin_accounts;
drop policy if exists fin_secretary_charges_read on public.iapp_charges;
drop policy if exists fin_secretary_payments_read on public.iapp_payments;

drop policy if exists fin_secretary_charges_insert on public.iapp_charges;
create policy fin_secretary_charges_insert on public.iapp_charges for insert to authenticated
  with check (public.iapp_has_role(array['secretary']) and kind = 'charge' and source = 'COLLECT_MODAL' and source_ref is not null and parent_id is null);

drop policy if exists fin_secretary_payments_insert on public.iapp_payments;
create policy fin_secretary_payments_insert on public.iapp_payments for insert to authenticated
  with check (public.iapp_has_role(array['secretary']) and kind = 'payment' and source = 'COLLECT_MODAL'
              and method in ('cash','pos','bank_transfer','wallet')
              and charge_id is not null and settlement_id is null and to_account_id is null and reversal_of is null);

drop policy if exists fin_secretary_entries_insert on public.iapp_accounting_entries;
create policy fin_secretary_entries_insert on public.iapp_accounting_entries for insert to authenticated
  with check (public.iapp_has_role(array['secretary']) and type in ('charge','payment') and source = 'COLLECT_MODAL' and reversal_of is null);

drop policy if exists fin_secretary_audit_insert on public.iapp_fin_audit;
create policy fin_secretary_audit_insert on public.iapp_fin_audit for insert to authenticated
  with check (public.iapp_has_role(array['secretary']) and entity in ('charge','payment') and action = 'create');

-- the secretary's audit row must point at a real charge / payment (checked by a DEFINER trigger: policies run with the
-- caller's rights and the caller may not execute the helper)
create or replace function public.iapp_fin_audit_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.iapp_fin_audit where id = new.id) then return new; end if;   -- idempotent retry
  if public.iapp_has_role(array['secretary']) and not public.iapp_is_admin() and not public.iapp_fin_audit_origin_ok(new.entity, new.entity_id) then
    raise exception 'audit row must reference an existing charge or payment';
  end if;
  return new;
end $$;
revoke all on function public.iapp_fin_audit_guard() from public, anon, authenticated;
drop trigger if exists iapp_fin_audit_guard_trg on public.iapp_fin_audit;
create trigger iapp_fin_audit_guard_trg before insert on public.iapp_fin_audit for each row execute function public.iapp_fin_audit_guard();
