-- =====================================================================================
-- I-App Lite — ACCOUNTING CORE (migration, idempotent, additive)
-- Baseline: commit 186aca3.   NOT APPLIED to production yet — review, then apply once.
--
-- What it does
--   * adds finance tables (accounts, charges, payments, ledger entries/lines, share rules,
--     revenue allocations, doctor settlements, cash reconciliations, financial audit)
--   * ADDS nullable columns to iapp_expenses / iapp_recurring_expenses (no existing column,
--     row or table is changed, renamed or dropped; iapp_visits / iapp_appointments untouched)
--   * enforces the financial invariants in the database (triggers + constraints + RLS)
--
-- Safe to run twice. To undo see docs/sql/accounting-core-rollback.sql.
-- Money is numeric(14,2). Ids are client-generated text (uuid / deterministic) → offline-safe.
-- Roles come from the existing helpers iapp_is_admin() / iapp_is_staff() / iapp_has_role(text[]).
-- =====================================================================================

-- ---------- 1. tables ------------------------------------------------------------------

create table if not exists public.iapp_fin_accounts (
  id text primary key,
  name text not null check (btrim(name) <> ''),
  type text not null check (type in ('cash','bank','pos','wallet','clinic')),
  clinic text,
  active boolean not null default true,
  opening_balance numeric(14,2) not null default 0,
  is_legacy boolean not null default false,
  created_at timestamptz not null default now(),
  created_by text,
  updated_at timestamptz not null default now()
);

create table if not exists public.iapp_charges (
  id text primary key,
  kind text not null default 'charge' check (kind in ('charge','adjustment')),
  parent_id text references public.iapp_charges(id),
  patient_id bigint,
  visit_id text,            -- reference only (no FK): deleting a clinical visit must never be blocked by finance
  appointment_id text,
  service text,
  amount numeric(14,2) not null default 0,
  discount numeric(14,2) not null default 0,
  net_amount numeric(14,2) not null,
  doctor_id text,
  doctor text,
  clinic text,
  status text not null default 'posted' check (status = 'posted'),
  service_date date not null,
  source text not null check (btrim(source) <> ''),
  source_ref text,
  reason text,
  created_at timestamptz not null default now(),
  created_by text,
  constraint iapp_charges_charge_shape check (
    kind <> 'charge' or (parent_id is null and amount > 0 and discount >= 0 and discount <= amount and net_amount = amount - discount)),
  constraint iapp_charges_adjustment_shape check (
    kind <> 'adjustment' or (parent_id is not null and btrim(coalesce(reason,'')) <> ''))
);
create unique index if not exists iapp_charges_source_uq on public.iapp_charges (source, source_ref) where kind = 'charge' and source_ref is not null;
create index if not exists iapp_charges_parent_idx on public.iapp_charges (parent_id);
create index if not exists iapp_charges_date_idx on public.iapp_charges (service_date);
create index if not exists iapp_charges_visit_idx on public.iapp_charges (visit_id);

create table if not exists public.iapp_payments (
  id text primary key,
  kind text not null check (kind in ('payment','refund','doctor_payment','transfer','reversal')),
  patient_id bigint,
  charge_id text references public.iapp_charges(id),
  settlement_id text,
  amount numeric(14,2) not null check (amount > 0),
  method text not null check (method in ('cash','pos','bank_transfer','wallet','legacy')),
  account_id text not null references public.iapp_fin_accounts(id),   -- every money movement belongs to an account
  to_account_id text references public.iapp_fin_accounts(id),
  payment_date date not null,
  receipt_no text,
  received_by text,
  status text not null default 'posted' check (status = 'posted'),
  reversal_of text references public.iapp_payments(id),
  orig_kind text,
  source text not null check (btrim(source) <> ''),                    -- every payment has a source
  source_ref text,
  reason text,
  notes text,
  clinic text,
  created_at timestamptz not null default now(),
  created_by text,
  constraint iapp_payments_shape check (
    (kind in ('payment','refund') and charge_id is not null)
    or (kind = 'doctor_payment' and settlement_id is not null)
    or (kind = 'transfer' and to_account_id is not null and to_account_id <> account_id)
    or (kind = 'reversal' and reversal_of is not null and btrim(coalesce(reason,'')) <> '')),
  constraint iapp_payments_refund_reason check (kind <> 'refund' or btrim(coalesce(reason,'')) <> '')
);
create unique index if not exists iapp_payments_source_uq on public.iapp_payments (source, source_ref) where kind = 'payment' and source_ref is not null;
create unique index if not exists iapp_payments_one_reversal_uq on public.iapp_payments (reversal_of) where kind = 'reversal';
create index if not exists iapp_payments_charge_idx on public.iapp_payments (charge_id);
create index if not exists iapp_payments_account_date_idx on public.iapp_payments (account_id, payment_date);
create index if not exists iapp_payments_settlement_idx on public.iapp_payments (settlement_id);

create table if not exists public.iapp_accounting_entries (
  id text primary key,
  date date not null,
  type text not null check (type in ('charge','payment','refund','expense','doctor_payment','transfer','adjustment','reversal')),
  source text,
  source_ref text,
  memo text,
  status text not null default 'posted' check (status = 'posted'),
  reversal_of text references public.iapp_accounting_entries(id),
  reversal_of_type text,
  clinic text,
  lines jsonb not null,     -- the client sends the lines INSIDE the entry; they are validated + expanded below
  created_at timestamptz not null default now(),
  created_by text,
  constraint iapp_entries_lines_array check (jsonb_typeof(lines) = 'array' and jsonb_array_length(lines) >= 2)
);
create unique index if not exists iapp_entries_one_reversal_uq on public.iapp_accounting_entries (reversal_of) where reversal_of is not null;
create index if not exists iapp_entries_date_idx on public.iapp_accounting_entries (date);

create table if not exists public.iapp_accounting_entry_lines (
  id text primary key,
  entry_id text not null references public.iapp_accounting_entries(id),
  ledger text not null check (ledger in ('ASSET','RECEIVABLE','REVENUE','EXPENSE','DOCTOR_SHARE','OVER_SHORT')),
  account_id text references public.iapp_fin_accounts(id),
  category text,
  debit numeric(14,2) not null default 0 check (debit >= 0),
  credit numeric(14,2) not null default 0 check (credit >= 0),
  constraint iapp_lines_one_side check ((debit = 0) <> (credit = 0)),
  constraint iapp_lines_asset_account check (ledger <> 'ASSET' or account_id is not null)
);
create index if not exists iapp_lines_entry_idx on public.iapp_accounting_entry_lines (entry_id);
create index if not exists iapp_lines_account_idx on public.iapp_accounting_entry_lines (account_id);

create table if not exists public.iapp_doctor_share_rules (
  id text primary key,
  doctor_id text,
  doctor text,
  service text,
  clinic text,
  mode text not null check (mode in ('percent','fixed')),
  value numeric(14,2) not null check (value >= 0 and (mode <> 'percent' or value <= 100)),
  active boolean not null default true,
  valid_from text,
  valid_to text,
  created_at timestamptz not null default now(),
  created_by text,
  updated_at timestamptz not null default now()
);

create table if not exists public.iapp_doctor_settlements (
  id text primary key,
  doctor_id text,
  doctor text,
  clinic text,
  period_from date not null,
  period_to date not null check (period_to >= period_from),
  gross_revenue numeric(14,2) not null,
  doctor_share numeric(14,2) not null check (doctor_share >= 0),
  center_share numeric(14,2) not null,
  paid_amount numeric(14,2) not null default 0 check (paid_amount >= 0),
  remaining_amount numeric(14,2) not null,
  status text not null default 'draft' check (status in ('draft','approved','partial','paid','cancelled')),
  created_at timestamptz not null default now(),
  created_by text,
  updated_at timestamptz not null default now()
);

create table if not exists public.iapp_revenue_allocations (
  id text primary key,
  settlement_id text not null references public.iapp_doctor_settlements(id),
  charge_id text not null references public.iapp_charges(id),
  rule_id text,
  doctor_id text,
  basis_amount numeric(14,2) not null,
  doctor_share numeric(14,2) not null,
  center_share numeric(14,2) not null,
  created_at timestamptz not null default now()
);
create index if not exists iapp_alloc_settlement_idx on public.iapp_revenue_allocations (settlement_id);
create index if not exists iapp_alloc_charge_idx on public.iapp_revenue_allocations (charge_id);

create table if not exists public.iapp_cash_reconciliations (
  id text primary key,
  account_id text not null references public.iapp_fin_accounts(id),
  period_from date not null,
  period_to date not null check (period_to >= period_from),
  opening numeric(14,2) not null,
  expected numeric(14,2) not null,
  counted numeric(14,2) not null,
  difference numeric(14,2) not null,
  status text not null default 'closed' check (status = 'closed'),
  note text,
  created_at timestamptz not null default now(),
  created_by text,
  constraint iapp_recon_note check (difference = 0 or btrim(coalesce(note,'')) <> '')
);

create table if not exists public.iapp_fin_audit (
  id text primary key,
  at timestamptz not null default now(),
  actor text,
  role text,
  entity text not null,
  entity_id text not null,
  action text not null,
  old_value text,
  new_value text,
  source text,
  reason text
);
create index if not exists iapp_fin_audit_entity_idx on public.iapp_fin_audit (entity, entity_id);

-- ---------- 2. extend the legacy expense tables (additive, nullable) --------------------

alter table public.iapp_expenses
  add column if not exists due_date date,
  add column if not exists status text,
  add column if not exists account_id text references public.iapp_fin_accounts(id),
  add column if not exists payment_method text,
  add column if not exists created_by text,
  add column if not exists approved_by text,
  add column if not exists paid_at date,
  add column if not exists reversal_of text,
  add column if not exists source text;

alter table public.iapp_recurring_expenses
  add column if not exists frequency text,
  add column if not exists start_date date,
  add column if not exists end_date date,
  add column if not exists next_due_date date,
  add column if not exists active boolean,
  add column if not exists account_id text references public.iapp_fin_accounts(id);

do $$ begin
  -- status is NULL on not-yet-migrated legacy rows, so every check tolerates NULL.
  if not exists (select 1 from pg_constraint where conname = 'iapp_expenses_status_chk') then
    alter table public.iapp_expenses add constraint iapp_expenses_status_chk check (status is null or status in ('pending','paid','cancelled'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'iapp_expenses_paid_chk') then
    alter table public.iapp_expenses add constraint iapp_expenses_paid_chk check (
      status is distinct from 'paid' or (account_id is not null and payment_method is not null and paid_at is not null));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'iapp_recurring_freq_chk') then
    alter table public.iapp_recurring_expenses add constraint iapp_recurring_freq_chk check (frequency is null or frequency in ('weekly','monthly','yearly'));
  end if;
end $$;

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

-- ---------- 5. ledger health (every entry balanced and with lines) -----------------------

create or replace view public.iapp_fin_ledger_health with (security_invoker = true) as
  select e.id as entry_id,
         case when l.n is null then 'NO_LINES' when l.d <> l.c then 'UNBALANCED' end as problem
  from public.iapp_accounting_entries e
  left join (select entry_id, count(*) n, sum(debit) d, sum(credit) c from public.iapp_accounting_entry_lines group by entry_id) l on l.entry_id = e.id
  where l.n is null or l.d <> l.c
  union all
  select l.entry_id, 'ORPHAN_LINES' from public.iapp_accounting_entry_lines l
  where not exists (select 1 from public.iapp_accounting_entries e where e.id = l.entry_id) group by l.entry_id;

-- ---------- 6. row level security -------------------------------------------------------
-- admin: everything.  secretary: controlled collection only (create charge/payment/entries/audit,
-- read accounts, read recent payments).  doctor/employee: no direct access to finance tables.

do $$
declare t text;
begin
  foreach t in array array['iapp_fin_accounts','iapp_charges','iapp_payments','iapp_accounting_entries','iapp_accounting_entry_lines',
                           'iapp_doctor_share_rules','iapp_doctor_settlements','iapp_revenue_allocations','iapp_cash_reconciliations','iapp_fin_audit'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, public', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('drop policy if exists fin_admin_all on public.%I', t);
    execute format('create policy fin_admin_all on public.%I for all to authenticated using (public.iapp_is_admin()) with check (public.iapp_is_admin())', t);
  end loop;
end $$;

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

-- iapp_expenses / iapp_recurring_expenses keep their existing admin-only RLS policies (unchanged).

-- ---------- 7. realtime (best effort) ---------------------------------------------------
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['iapp_fin_accounts','iapp_charges','iapp_payments','iapp_accounting_entries',
                             'iapp_doctor_share_rules','iapp_doctor_settlements','iapp_revenue_allocations','iapp_cash_reconciliations'] loop
      begin
        execute format('alter publication supabase_realtime add table public.%I', t);
      exception when duplicate_object then null;
      end;
    end loop;
  end if;
end $$;
