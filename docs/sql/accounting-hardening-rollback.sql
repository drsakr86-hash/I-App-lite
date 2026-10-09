-- =====================================================================================
-- ROLLBACK of accounting-hardening.sql — restores the v1 (accounting-core.sql) functions, triggers and policies.
-- Data is never touched. Entries written under v2 (with source_ref) remain valid under v1.
-- Generated from accounting-core.sql sections 3-4 and the secretary policies; keep in sync if core changes.
-- =====================================================================================

-- new v2 objects
drop function if exists public.iapp_fin_collection_state(text[], text[]);
drop trigger if exists iapp_fin_audit_guard_trg on public.iapp_fin_audit;
drop function if exists public.iapp_fin_audit_guard();
drop index if exists public.iapp_entries_source_ref_uq;

-- v1 helpers, guards, triggers (restored verbatim from accounting-core.sql)
-- ---------- 3. helper functions ---------------------------------------------------------

create or replace function public.iapp_fin_charge_net(p_charge text) returns numeric
language sql stable set search_path = public as
$$ select coalesce(sum(net_amount), 0) from public.iapp_charges where id = p_charge or parent_id = p_charge $$;

-- paid − refunded, ignoring anything that has been reversed
create or replace function public.iapp_fin_charge_paid(p_charge text) returns numeric
language sql stable set search_path = public as
$$ select coalesce(sum(case when p.kind = 'payment' then p.amount else -p.amount end), 0)
   from public.iapp_payments p
   where p.charge_id = p_charge and p.kind in ('payment','refund')
     and not exists (select 1 from public.iapp_payments r where r.kind = 'reversal' and r.reversal_of = p.id) $$;

create or replace function public.iapp_fin_period_closed(p_account text, p_date date) returns boolean
language sql stable set search_path = public as
$$ select exists (select 1 from public.iapp_cash_reconciliations r where r.account_id = p_account and r.status = 'closed' and p_date <= r.period_to) $$;

-- ---------- 4. invariant triggers -------------------------------------------------------

create or replace function public.iapp_fin_block_mutation() returns trigger
language plpgsql set search_path = public as $$
begin
  raise exception 'financial rows are append-only: % on % is not allowed (post a reversal/adjustment instead)', tg_op, tg_table_name
    using errcode = 'restrict_violation';
end $$;

do $$
declare t text;
begin
  foreach t in array array['iapp_charges','iapp_payments','iapp_accounting_entries','iapp_accounting_entry_lines','iapp_revenue_allocations','iapp_cash_reconciliations','iapp_fin_audit'] loop
    execute format('drop trigger if exists iapp_fin_append_only on public.%I', t);
    execute format('create trigger iapp_fin_append_only before update or delete on public.%I for each row execute function public.iapp_fin_block_mutation()', t);
  end loop;
end $$;

create or replace function public.iapp_fin_charges_guard() returns trigger
language plpgsql set search_path = public as $$
declare v_paid numeric; v_net numeric;
begin
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
drop trigger if exists iapp_fin_charges_guard on public.iapp_charges;
create trigger iapp_fin_charges_guard before insert on public.iapp_charges for each row execute function public.iapp_fin_charges_guard();

create or replace function public.iapp_fin_payments_guard() returns trigger
language plpgsql set search_path = public as $$
declare v_orig public.iapp_payments; v_out numeric; v_paid numeric; v_acc public.iapp_fin_accounts;
begin
  select * into v_acc from public.iapp_fin_accounts where id = new.account_id;
  if v_acc.id is null then raise exception 'payment needs an account'; end if;
  if not v_acc.active and new.kind <> 'reversal' then raise exception 'account % is inactive', v_acc.id; end if;
  if public.iapp_fin_period_closed(new.account_id, new.payment_date)
     or (new.to_account_id is not null and public.iapp_fin_period_closed(new.to_account_id, new.payment_date)) then
    raise exception 'cash period is reconciled and closed for account %', new.account_id;
  end if;

  if new.kind in ('payment','refund') then
    perform pg_advisory_xact_lock(hashtext('fin:' || new.charge_id));   -- serialise concurrent devices per charge
    v_paid := public.iapp_fin_charge_paid(new.charge_id);
    if new.kind = 'payment' then
      v_out := public.iapp_fin_charge_net(new.charge_id) - v_paid;
      if new.amount > v_out then raise exception 'payment % exceeds the outstanding balance %', new.amount, v_out; end if;
    elsif new.amount > v_paid then
      raise exception 'refund % exceeds the amount paid %', new.amount, v_paid;
    end if;
  elsif new.kind = 'reversal' then
    select * into v_orig from public.iapp_payments where id = new.reversal_of;
    if v_orig.id is null or v_orig.kind = 'reversal' then raise exception 'reversal must reference an original money row'; end if;
  end if;
  return new;
end $$;
drop trigger if exists iapp_fin_payments_guard on public.iapp_payments;
create trigger iapp_fin_payments_guard before insert on public.iapp_payments for each row execute function public.iapp_fin_payments_guard();

create or replace function public.iapp_fin_expenses_guard() returns trigger
language plpgsql set search_path = public as $$
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
    if coalesce(new.source,'') <> 'LEGACY_EXPENSE' and public.iapp_fin_period_closed(new.account_id, new.paid_at) then
      raise exception 'cash period is reconciled and closed for account %', new.account_id;
    end if;
  end if;
  if new.reversal_of is not null then
    select * into v_orig from public.iapp_expenses where id = new.reversal_of;
    if v_orig.id is null or v_orig.status <> 'paid' or v_orig.reversal_of is not null then raise exception 'reversal must reference a paid expense'; end if;
  end if;
  return new;
end $$;
drop trigger if exists iapp_fin_expenses_guard on public.iapp_expenses;
create trigger iapp_fin_expenses_guard before insert or update or delete on public.iapp_expenses for each row execute function public.iapp_fin_expenses_guard();
create unique index if not exists iapp_expenses_one_reversal_uq on public.iapp_expenses (reversal_of) where reversal_of is not null;

create or replace function public.iapp_fin_accounts_guard() returns trigger
language plpgsql set search_path = public as $$
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
drop trigger if exists iapp_fin_accounts_guard on public.iapp_fin_accounts;
create trigger iapp_fin_accounts_guard before update or delete on public.iapp_fin_accounts for each row execute function public.iapp_fin_accounts_guard();

create or replace function public.iapp_fin_settlements_guard() returns trigger
language plpgsql set search_path = public as $$
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
drop trigger if exists iapp_fin_settlements_guard on public.iapp_doctor_settlements;
create trigger iapp_fin_settlements_guard before update or delete on public.iapp_doctor_settlements for each row execute function public.iapp_fin_settlements_guard();

create or replace function public.iapp_fin_entries_guard() returns trigger
language plpgsql set search_path = public as $$
declare l jsonb; d numeric := 0; c numeric := 0; v_dr numeric; v_cr numeric;
begin
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
  return new;
end $$;
drop trigger if exists iapp_fin_entries_guard on public.iapp_accounting_entries;
create trigger iapp_fin_entries_guard before insert on public.iapp_accounting_entries for each row execute function public.iapp_fin_entries_guard();

-- relational ledger lines are DERIVED from the entry (the client never writes this table)
create or replace function public.iapp_fin_entries_expand() returns trigger
language plpgsql security definer set search_path = public as $$
declare l jsonb; i int := 0;
begin
  for l in select * from jsonb_array_elements(new.lines) loop
    i := i + 1;
    insert into public.iapp_accounting_entry_lines (id, entry_id, ledger, account_id, category, debit, credit)
    values (coalesce(l->>'id', new.id || '-l' || i), new.id, l->>'ledger', nullif(l->>'accountId',''), nullif(l->>'category',''),
            coalesce((l->>'debit')::numeric, 0), coalesce((l->>'credit')::numeric, 0))
    on conflict (id) do nothing;
  end loop;
  return null;
end $$;
drop trigger if exists iapp_fin_entries_expand on public.iapp_accounting_entries;
create trigger iapp_fin_entries_expand after insert on public.iapp_accounting_entries for each row execute function public.iapp_fin_entries_expand();


-- v2-only helpers are no longer used by any v1 function
drop function if exists public.iapp_fin_account_usable(text);
drop function if exists public.iapp_fin_audit_origin_ok(text, text);
drop function if exists public.iapp_fin_norm_lines(jsonb);
drop function if exists public.iapp_fin_line(text, text, text, numeric, numeric);

-- v1 callers (policies/guards ran with caller rights) need EXECUTE again
do $$
declare f text;
begin
  foreach f in array array['iapp_fin_charge_net(text)','iapp_fin_charge_paid(text)','iapp_fin_period_closed(text,date)',
    'iapp_fin_block_mutation()','iapp_fin_charges_guard()','iapp_fin_payments_guard()','iapp_fin_expenses_guard()',
    'iapp_fin_accounts_guard()','iapp_fin_settlements_guard()','iapp_fin_entries_guard()','iapp_fin_entries_expand()'] loop
    execute format('grant execute on function public.%s to public', f);
  end loop;
end $$;

-- v1 secretary policies
drop policy if exists fin_secretary_accounts_read on public.iapp_fin_accounts;
create policy fin_secretary_accounts_read on public.iapp_fin_accounts for select to authenticated using (public.iapp_has_role(array['secretary']));

drop policy if exists fin_secretary_charges_read on public.iapp_charges;
create policy fin_secretary_charges_read on public.iapp_charges for select to authenticated using (public.iapp_has_role(array['secretary']));
drop policy if exists fin_secretary_charges_insert on public.iapp_charges;
create policy fin_secretary_charges_insert on public.iapp_charges for insert to authenticated
  with check (public.iapp_has_role(array['secretary']) and kind = 'charge' and source <> 'LEGACY_VISIT');

drop policy if exists fin_secretary_payments_read on public.iapp_payments;
create policy fin_secretary_payments_read on public.iapp_payments for select to authenticated
  using (public.iapp_has_role(array['secretary']) and created_at >= now() - interval '36 hours');
drop policy if exists fin_secretary_payments_insert on public.iapp_payments;
create policy fin_secretary_payments_insert on public.iapp_payments for insert to authenticated
  with check (public.iapp_has_role(array['secretary']) and kind = 'payment' and source <> 'LEGACY_VISIT');

drop policy if exists fin_secretary_entries_insert on public.iapp_accounting_entries;
create policy fin_secretary_entries_insert on public.iapp_accounting_entries for insert to authenticated
  with check (public.iapp_has_role(array['secretary']) and type in ('charge','payment'));
-- the lines table is written ONLY by the iapp_fin_entries_expand trigger: clients get read access (admin) at most
drop policy if exists fin_secretary_lines_insert on public.iapp_accounting_entry_lines;
drop policy if exists fin_admin_all on public.iapp_accounting_entry_lines;
drop policy if exists fin_admin_read on public.iapp_accounting_entry_lines;
create policy fin_admin_read on public.iapp_accounting_entry_lines for select to authenticated using (public.iapp_is_admin());
revoke insert, update, delete on public.iapp_accounting_entry_lines from authenticated;
drop policy if exists fin_secretary_audit_insert on public.iapp_fin_audit;
create policy fin_secretary_audit_insert on public.iapp_fin_audit for insert to authenticated
  with check (public.iapp_has_role(array['secretary']) and entity in ('charge','payment'));
