# DATABASE & MIGRATION REVIEW — project `mofdveiwlaymlabvsypu` (iapp-clinic)

**Nothing in this document was executed against production.** All SQL below is a PROPOSAL for review/approval. Production was read through catalog queries only (see BASELINE.md).

## Verified production facts (read-only)
- RLS is enabled on all 36 public tables. `iapp_staff` has RLS and no policy (only definer helpers read it) — correct.
- Finance v1 (`docs/sql/accounting-core.sql`) IS applied: tables exist (32 charges, 23 payments, 61 entries, 122 lines, 62 audit rows), append-only triggers (`iapp_fin_append_only`), guard triggers on charges/payments/entries/expenses/accounts, and these unique indexes: `iapp_charges_source_uq (source, source_ref) WHERE kind='charge' AND source_ref IS NOT NULL`, `iapp_payments_source_uq`, `iapp_payments_one_reversal_uq`, `iapp_entries_one_reversal_uq`, `iapp_expenses_one_reversal_uq`. So a second charge for the same appointment (`COLLECT_MODAL`, `apt-<id>`) and a second reversal of the same payment are rejected server-side.
- Finance **hardening v2 is NOT applied**: no `iapp_fin_collection_state`, no `iapp_entries_source_ref_uq`, secretary still has SELECT on charges/accounts/36 h of payments, guards are still invoker functions.
- `list_migrations` has no entries for the accounting tables: they were applied outside tracked migrations (SQL editor). Schema drift risk: a fresh environment built from migrations would lack the finance tables. Record them (or keep `docs/sql` as the source of truth and say so).
- Not verified: FK constraints and CHECK constraints on finance and clinical tables, index health, table grants for `authenticated`, column defaults, storage buckets (none used; images go to Cloudinary).

## A. Apply accounting hardening (`docs/sql/accounting-hardening.sql`) — needs approval
Why: closes F-03 (36 h blind spot in the overpayment guard, missing `iapp_fin_collection_state`, secretary read access to the ledger).
I read only its header, the secretary RPC and policy lines; **a full line-by-line review is still required before applying.**
Procedure (do not skip):
1. Take a full backup (the repo's weekly `iapp-backup.mjs` export, plus Supabase backup/PITR if available).
2. Run the pre-flight read-only queries from the file header on a Supabase **branch** (`create_branch`, has a cost) or a restored copy; both must return 0 rows:
   `select source_ref, count(*) from public.iapp_accounting_entries where source_ref is not null group by 1 having count(*) > 1;`
   `select e.id from public.iapp_accounting_entries e where e.source_ref is not null and e.id <> 'ent-' || e.source_ref and e.type <> 'reversal';`
3. Apply the file on the branch, run `docs/sql/tests/accounting-hardening.assertions.sql`, then re-run the secretary flow against the branch.
4. Apply to production in a quiet period (clinic closed), then verify: `select proname from pg_proc where proname='iapp_fin_collection_state'`; as a secretary session the RPC returns `charges/accounts/known_ids`; `select count(*) from iapp_payments` as secretary returns an error/0.
Rollback: `docs/sql/accounting-hardening-rollback.sql` (restores guards/policies; drops the RPC). Data rows are untouched by both scripts ("existing rows are not re-validated").
Client side: already warns the secretary while the RPC is missing (this branch).

## B. Public queue cache (F-05)
B1 — recommended, minimal:
```sql
begin;
drop policy if exists public_read_queue_cache on public.iapp_queue_public_cache;
create policy public_read_queue_cache_today on public.iapp_queue_public_cache
  for select to anon, authenticated
  using (date = ((now() at time zone 'Africa/Cairo')::date)::text);
-- stale days are never purged by the trigger (it only touches today's rows)
delete from public.iapp_queue_public_cache
  where date < ((now() at time zone 'Africa/Cairo')::date)::text;
commit;
```
Do NOT revoke table SELECT: `iapp_queue_public` is `security_invoker=true`, so anon needs the table policy for the TV screen to work.
Verify: as anon (REST) `select ... where date < today` → 0 rows; today's rows still returned; TV screen shows the queue.
Rollback: `drop policy public_read_queue_cache_today ...; create policy public_read_queue_cache on public.iapp_queue_public_cache for select to anon, authenticated using (true);`. Purged rows are derived from `iapp_appointments` (still intact) and are not needed for any screen.
Residual after B1: today's full patient names remain readable with the public key. B2 (product decision): store a masked name in the cache (first name + initial) and send the full name for the voice call only through the authenticated Realtime channel `iapp_queue_calls`; requires a trigger change and a small change in `public/queue-display.html` (the voice currently reads the full name from the same rows).
Also consider a daily purge (pg_cron or on-write delete of `date < today`).

## C. Function execute grants (F-10)
`iapp_fin_entries_expand()` is a SECURITY DEFINER **trigger** function executable by anon/authenticated. Trigger functions are not checked for EXECUTE when the trigger fires (only at CREATE TRIGGER), so revoking is expected to be safe, but **test on a branch first**:
```sql
revoke execute on function public.iapp_fin_entries_expand() from public, anon, authenticated;
```
Rollback: `grant execute on function public.iapp_fin_entries_expand() to public;`
Do NOT revoke `iapp_fin_charge_net/paid/period_closed` or the `*_guard` functions separately: in v1 the guards are invoker functions that call those helpers with the caller's rights; hardening A converts them to SECURITY DEFINER and revokes client EXECUTE in one step.

## D. `iapp_store` role boundary (F-06) — decision needed, no SQL proposed
Options: (1) accept: secretaries are trusted for all legacy keys, document it; (2) per-key policies: secretaries get patients/appointments/visits/prices/clinic only; exams/prescriptions/imaging/backups/trash/audit/users for admin(+doctor). Option 2 can break secretary screens that read exams/Rx for printing or the patient file — each key must be traced in the client before any policy change. A staged plan: add the doctor role to `iapp_staff`, trace key usage per role in the app, write per-key policies on a branch, run the secretary workflows, then apply.

## E. Other settings
- Enable leaked-password protection in Supabase Auth (dashboard).
- Anonymous booking (F-12): add a uniqueness/idempotency rule (e.g. one pending request per phone+date+clinic+time) and a rate limit (Edge Function or `pg_net`-free trigger count check). Needs design; not proposed as SQL here.
- Record the finance v1 and any hardening scripts as tracked migrations.

## F. Lost updates on blob keys of `iapp_store` (F-18) — proposal, NOT applied
Problem: keys stored as one jsonb blob (patients, exams, prescriptions, imaging orders, …) are written by the client with an unconditional upsert after read+merge. Two devices flushing the same key concurrently: last writer wins and the other's new record is lost on the server. Reproduced in `tests/sync-lost-update.test.js` (reported as `todo`, it fails its assertion by design). `iapp_store.updated_at` exists but is NOT maintained on upsert (default only fires on INSERT; no update trigger on the table), so it cannot be used as a version today.
Proposal (needs a branch test, then approval):
```sql
alter table public.iapp_store add column if not exists version bigint not null default 1;
create or replace function public.iapp_store_bump() returns trigger language plpgsql as
$$ begin new.version := coalesce(old.version, 0) + 1; new.updated_at := now(); return new; end $$;
drop trigger if exists trg_iapp_store_bump on public.iapp_store;
create trigger trg_iapp_store_bump before update on public.iapp_store for each row execute function public.iapp_store_bump();
-- compare-and-swap writer, SECURITY INVOKER so RLS still applies:
create or replace function public.iapp_store_cas(p_key text, p_value jsonb, p_expected bigint) returns bigint
language plpgsql as $$ declare v bigint; begin
  update public.iapp_store set value = p_value where key = p_key and version = p_expected returning version into v;
  return v;  -- null = somebody else wrote first: caller re-reads, re-merges, retries
end $$;
```
The client change (read `version`, call `iapp_store_cas`, loop on null) is small but touches the sync engine: do it only together with this SQL, behind a feature check so old servers keep working. Rollback: drop trigger/function/column.

## G. Patient file numbers (F-19) — confirmed in production, DATA CLEANUP needs your decision
Facts (aggregates only; no names read): `iapp_patients_core` has 60 rows and **no unique index on `patient_code`**. P-0062, P-0063 and P-0064 are each held by **3 different patients** (3 legacy ids, 3 different names, created 2026-09-26…28). Of those 9 rows, 3 are patients present in the app's working store; the other 6 belong to 7 core patients (7 in total with no counterpart in the store) that are all in the trash (`iapp_trash`) and in the backups — deleted through the app. Deleting a patient does not touch the core row, and the old client re-issued the number of the deleted last patient to the next new patient. Where the duplicate numbers are confusing: `iapp_get_patient_file_by_code` and every printed file number.
Client fix on this branch (`code-floor.js`) prevents NEW reuse on a device. It does not fix the 3 existing duplicates and does not stop two devices from issuing the same number at once.
Read-only query for you to run in the Supabase SQL editor to see who is affected (shows personal data, run it yourself):
```sql
select patient_code, id, legacy_id, full_name, created_at from public.iapp_patients_core
where patient_code in (select patient_code from public.iapp_patients_core group by 1 having count(*) > 1)
order by patient_code, created_at;
```
Decision needed for each pair: keep the code on the patient who is active in the app and give the deleted/trashed ones a new code, or merge if one person was entered twice. Do NOT delete clinical rows. After cleanup:
```sql
create unique index concurrently if not exists iapp_patients_core_code_uq on public.iapp_patients_core (patient_code);
create sequence if not exists public.iapp_patient_code_seq;  -- then an RPC iapp_next_patient_code() the client calls when online
```
Also decide whether deleting a patient in the app should mark the core row (e.g. archived) instead of leaving it active.

### G — status (2026-10-11): cleanup EXECUTED in production
Executed with `docs/sql/patient-code-duplicates-fix.sql` (guarded, one transaction; first attempt was refused by guard G0d because one patient had two trash records, the guard was relaxed and re-tested). Result: 0 duplicated codes, 60 core rows unchanged, 12 visits still linked to the same 9 patients; the 6 deleted patients are now `P-0062-D1/-D2`, `P-0063-D1/-D2`, `P-0064-D1/-D2`; their 7 trash records carry the same codes; `iapp_backups` untouched. Private backups: `iapp_patients_core_codefix_bak_20261011`, `iapp_store_trash_codefix_bak_20261011`. Rollback: `patient-code-duplicates-fix-rollback.sql`. The unique index was deliberately NOT created (a concurrent double-issue would become a sync error); create it only together with the server-side sequence.
