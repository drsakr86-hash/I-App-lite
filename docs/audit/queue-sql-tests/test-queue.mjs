// Local, isolated test of docs/sql/queue-public-today-only(.sql|-rollback.sql). Synthetic data only. No network, no production access.
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const REPO = (process.env.IAPP_REPO || '/root/I-App-lite') + '/docs/sql/';
const APPLY = fs.readFileSync(REPO + 'queue-public-today-only.sql', 'utf8');
const ROLLBACK = fs.readFileSync(REPO + 'queue-public-today-only-rollback.sql', 'utf8');

const db = new PGlite();
let passed = 0, failed = 0;
const ok = (name, fn) => fn().then(() => { passed++; console.log('PASS', name); }).catch(e => { failed++; console.log('FAIL', name, '->', String(e.message).split('\n')[0]); });
const q = async sql => (await db.query(sql)).rows;
const as = async (role, sql) => { await db.exec('set role ' + role); try { return (await db.query(sql)).rows; } finally { await db.exec('reset role'); } };
const asErr = async (role, sql) => { await db.exec('set role ' + role); try { await db.query(sql); return null; } catch (e) { return e.message; } finally { await db.exec('reset role'); } };
const n = r => Number(r[0].n);

// ---- schema: replica of the production objects read from the catalog (names, types, grants, RLS, view option, trigger fn verbatim) ----
await db.exec(`
create role anon nologin; create role authenticated nologin; create role service_role nologin;
grant usage on schema public to anon, authenticated;
create table public.iapp_appointments (id bigint primary key, patient text, clinic text, doctor text, wait_status text, date date, time text,
  arrived_at bigint, called_at bigint, queue_number integer, cancelled boolean not null default false);
alter table public.iapp_appointments enable row level security;
create table public.iapp_queue_public_cache (id text primary key, patient text, clinic text, doctor text, wait_status text, date text, time text,
  arrived_at text, called_at text, queue_number text, updated_at timestamptz not null default now());
create index idx_iapp_queue_public_cache_date_clinic on public.iapp_queue_public_cache (date, clinic);
alter table public.iapp_queue_public_cache enable row level security;
create policy public_read_queue_cache on public.iapp_queue_public_cache for select to anon, authenticated using (true);
grant select on public.iapp_queue_public_cache to anon;
grant select, insert, update, delete on public.iapp_queue_public_cache to authenticated;
create view public.iapp_queue_public with (security_invoker = true) as
  select id, patient, clinic, doctor, wait_status, date, "time", arrived_at, called_at, queue_number
  from public.iapp_queue_public_cache where (date = (((now() at time zone 'Africa/Cairo'))::date)::text);
grant select on public.iapp_queue_public to anon, authenticated;
create or replace function public.iapp_refresh_queue_public_cache() returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare r record;
begin
  if tg_op in ('DELETE','UPDATE') then
    delete from iapp_queue_public_cache where id=old.id::text;
  end if;
  if tg_op in ('INSERT','UPDATE') then
    if new.date=(now() at time zone 'Africa/Cairo')::date and not new.cancelled then
      insert into iapp_queue_public_cache
        (id,patient,clinic,doctor,wait_status,date,time,arrived_at,called_at,queue_number,updated_at)
      values
        (new.id::text,new.patient,new.clinic,new.doctor,new.wait_status,new.date::text,new.time,
         new.arrived_at::text,new.called_at::text,new.queue_number::text,now())
      on conflict(id) do update set
        patient=excluded.patient,clinic=excluded.clinic,doctor=excluded.doctor,
        wait_status=excluded.wait_status,date=excluded.date,time=excluded.time,
        arrived_at=excluded.arrived_at,called_at=excluded.called_at,queue_number=excluded.queue_number,
        updated_at=now();
    end if;
  end if;
  return coalesce(new,old);
end;
$function$;
create trigger trg_iapp_refresh_queue_public_cache after insert or delete or update on public.iapp_appointments for each row execute function public.iapp_refresh_queue_public_cache();
`);

// ---- synthetic fixtures: history (5 past days x 2 clinics) written like the trigger would have, plus today's rows through the trigger ----
const today = (await q(`select ((now() at time zone 'Africa/Cairo')::date)::text d`))[0].d;
await db.exec('alter table public.iapp_appointments disable trigger trg_iapp_refresh_queue_public_cache');
let id = 1000;
for (let back = 5; back >= 1; back--) {
  for (const clinic of ['CLINIC-A', 'CLINIC-B']) {
    for (let k = 0; k < 2; k++) {
      id++;
      await db.exec(`insert into public.iapp_appointments values (${id}, 'Test Patient ${id}', '${clinic}', 'Dr X', 'done', (date '${today}' - ${back}), '10:00', ${id}00, ${id}50, ${k + 1}, false)`);
    }
  }
}
await db.exec(`insert into public.iapp_queue_public_cache (id,patient,clinic,doctor,wait_status,date,time,arrived_at,called_at,queue_number)
  select id::text, patient, clinic, doctor, wait_status, date::text, time, arrived_at::text, called_at::text, queue_number::text from public.iapp_appointments`);
await db.exec('alter table public.iapp_appointments enable trigger trg_iapp_refresh_queue_public_cache');
for (const [i, st, clinic] of [[1, 'waiting', 'CLINIC-A'], [2, 'called', 'CLINIC-A'], [3, 'in', 'CLINIC-B'], [4, 'waiting', 'CLINIC-B']]) {
  await db.exec(`insert into public.iapp_appointments values (${5000 + i}, 'Today Patient ${i}', '${clinic}', 'Dr Y', '${st}', date '${today}', '11:0${i}', ${i}000, null, ${i}, false)`);
}
await db.exec(`insert into public.iapp_appointments values (6001, 'Tomorrow Patient', 'CLINIC-A', 'Dr Y', 'waiting', date '${today}' + 1, '09:00', null, null, null, false)`);
const snapshotStale = await q(`select id,patient,clinic,doctor,wait_status,date,time,arrived_at,called_at,queue_number from public.iapp_queue_public_cache where date < '${today}' order by id`);

const apptJson = JSON.stringify((await q(`select json_agg(a order by id) j from public.iapp_appointments a where id between 1001 and 1020`))[0].j);
console.log(`# cairo today=${today}; stale cache rows=${snapshotStale.length}`);

// ---- BEFORE ----
await ok('BEFORE: anon reads ALL days from the table (the leak)', async () => assert.equal(n(await as('anon', 'select count(*) n from public.iapp_queue_public_cache')), snapshotStale.length + 4));
await ok('BEFORE: anon via the view sees only today (view filter works)', async () => assert.equal(n(await as('anon', 'select count(*) n from public.iapp_queue_public')), 4));
await ok('BEFORE: anon cannot read appointments (permission denied)', async () => assert.match(await asErr('anon', 'select * from public.iapp_appointments'), /permission denied/));

// ---- helpers: full-state snapshot so every negative test proves 'no partial change' ----
const BAK = 'public.iapp_queue_public_cache_bak_20261011';
const state = async () => JSON.stringify({
  pol: await q(`select policyname, qual from pg_policies where tablename='iapp_queue_public_cache' order by 1`),
  cache: await q('select * from public.iapp_queue_public_cache order by id'),
  bak: (await q(`select to_regclass('${BAK}')::text r`))[0].r ? await q(`select * from ${BAK} order by id`) : null,
});
const quiet = async sql => { await db.exec('alter table public.iapp_appointments disable trigger trg_iapp_refresh_queue_public_cache'); try { await db.exec(sql); } finally { await db.exec('alter table public.iapp_appointments enable trigger trg_iapp_refresh_queue_public_cache'); } };
const abortCase = async (label, file, expect, setup, cleanup) => ok(label, async () => {
  if (setup) await quiet(setup);
  const s0 = await state(); let err = null;
  try { await db.exec(file); } catch (e) { err = e.message; }
  await db.exec('rollback').catch(() => {});
  const s1 = await state();
  if (cleanup) await quiet(cleanup);
  assert.match(err || '(no error: the file succeeded)', expect);
  assert.equal(s1, s0, 'policy, cache and backup are exactly as before the failed run');
});

// ---- APPLY ----
// mimic Supabase: tables created later in public get ALL privileges for the API roles (the apply script must close them on the backup table)
await db.exec('alter default privileges in schema public grant all on tables to anon, authenticated, service_role');
await abortCase('FRESH ABORT: a failing guard on a first run leaves no backup table, no policy change, no deleted row', APPLY, /ABORT G1: stale=21 no_matching_appointment=1/,
  `insert into public.iapp_queue_public_cache (id,patient,clinic,date) values ('orphan0','Orphan','CLINIC-A', ((now() at time zone 'Africa/Cairo')::date - 3)::text)`,
  `delete from public.iapp_queue_public_cache where id='orphan0'`);
await ok('FRESH ABORT: backup table did not get created', async () => assert.equal((await q(`select to_regclass('${BAK}')::text r`))[0].r, null));
await db.exec(APPLY);
await ok('AFTER apply: exactly one policy, the new one, scoped to anon+authenticated SELECT', async () => {
  const p = await q(`select policyname, cmd, roles::text from pg_policies where tablename='iapp_queue_public_cache'`);
  assert.equal(p.length, 1); assert.equal(p[0].policyname, 'public_read_queue_cache_today'); assert.equal(p[0].cmd, 'SELECT');
});
await ok('AFTER: anon table read = today only (4 rows)', async () => assert.equal(n(await as('anon', 'select count(*) n from public.iapp_queue_public_cache')), 4));
await ok('AFTER: anon sees 0 stale rows', async () => assert.equal(n(await as('anon', `select count(*) n from public.iapp_queue_public_cache where date < '${today}'`)), 0));
await ok('AFTER: authenticated table read = today only', async () => assert.equal(n(await as('authenticated', 'select count(*) n from public.iapp_queue_public_cache')), 4));
await ok('AFTER: TV query (view, select *, eq clinic) returns the same rows as before for each clinic', async () => {
  assert.equal(n(await as('anon', `select count(*) n from public.iapp_queue_public where clinic='CLINIC-A'`)), 2);
  assert.equal(n(await as('anon', `select count(*) n from public.iapp_queue_public where clinic='CLINIC-B'`)), 2);
  const cols = Object.keys((await as('anon', 'select * from public.iapp_queue_public limit 1'))[0]);
  assert.deepEqual(cols, ['id', 'patient', 'clinic', 'doctor', 'wait_status', 'date', 'time', 'arrived_at', 'called_at', 'queue_number']);
});
await ok('AFTER: owner sees stale rows deleted, today rows intact', async () => {
  assert.equal(n(await q(`select count(*) n from public.iapp_queue_public_cache where date < '${today}'`)), 0);
  assert.equal(n(await q(`select count(*) n from public.iapp_queue_public_cache where date = '${today}'`)), 4);
});
await ok('AFTER: authenticated cannot INSERT (RLS), UPDATE/DELETE touch 0 rows', async () => {
  assert.match(await asErr('authenticated', `insert into public.iapp_queue_public_cache (id,patient,date) values ('x','y','${today}')`), /row-level security/);
  await db.exec('set role authenticated');
  const u = await db.query(`update public.iapp_queue_public_cache set patient='hacked'`); const d = await db.query(`delete from public.iapp_queue_public_cache`);
  await db.exec('reset role');
  assert.equal(u.affectedRows, 0); assert.equal(d.affectedRows, 0);
  assert.equal(n(await q(`select count(*) n from public.iapp_queue_public_cache where date = '${today}'`)), 4);
});
await ok('AFTER: anon cannot write the cache or read appointments', async () => {
  assert.match(await asErr('anon', `insert into public.iapp_queue_public_cache (id,date) values ('z','${today}')`), /permission denied/);
  assert.match(await asErr('anon', 'select * from public.iapp_appointments'), /permission denied/);
});
await ok('AFTER: trigger (SECURITY DEFINER) still maintains the cache: insert, status change, cancel, delete, date move', async () => {
  await db.exec(`insert into public.iapp_appointments values (7001, 'New Patient', 'CLINIC-A', 'Dr Y', 'waiting', date '${today}', '12:00', 7000, null, 9, false)`);
  assert.equal(n(await as('anon', `select count(*) n from public.iapp_queue_public where id='7001'`)), 1);
  await db.exec(`update public.iapp_appointments set wait_status='called', called_at=7100 where id=7001`);
  assert.equal((await as('anon', `select wait_status s from public.iapp_queue_public where id='7001'`))[0].s, 'called');
  await db.exec(`update public.iapp_appointments set cancelled=true where id=7001`);
  assert.equal(n(await as('anon', `select count(*) n from public.iapp_queue_public where id='7001'`)), 0);
  await db.exec(`update public.iapp_appointments set cancelled=false where id=7001`);
  assert.equal(n(await as('anon', `select count(*) n from public.iapp_queue_public where id='7001'`)), 1);
  await db.exec(`update public.iapp_appointments set date = date '${today}' - 1 where id=7001`);
  assert.equal(n(await q(`select count(*) n from public.iapp_queue_public_cache where id='7001'`)), 0);
  await db.exec(`delete from public.iapp_appointments where id=7001`);
});
await ok('IDEMPOTENT: applying the file a second time succeeds and leaves one policy', async () => {
  await db.exec(APPLY);
  assert.equal(n(await q(`select count(*) n from pg_policies where tablename='iapp_queue_public_cache'`)), 1);
});

// ---- date predicate vs Africa/Cairo (fixed instants; Egypt is UTC+3 in summer, UTC+2 in winter) ----
const cairoDay = ts => `select ((timestamptz '${ts}' at time zone 'Africa/Cairo')::date)::text d`;
await ok('TZ: 2026-10-11T20:59:59Z is still 2026-10-11 in Cairo; 21:00:00Z is 2026-10-12', async () => {
  assert.equal((await q(cairoDay('2026-10-11 20:59:59+00')))[0].d, '2026-10-11');
  assert.equal((await q(cairoDay('2026-10-11 21:00:00+00')))[0].d, '2026-10-12');
});
await ok('TZ: winter offset (UTC+2): 2026-12-31T21:59:59Z = 2026-12-31, 22:00:00Z = 2027-01-01', async () => {
  assert.equal((await q(cairoDay('2026-12-31 21:59:59+00')))[0].d, '2026-12-31');
  assert.equal((await q(cairoDay('2026-12-31 22:00:00+00')))[0].d, '2027-01-01');
});
await ok('TYPES: policy compares text with text (no cast of the column) and the ISO strings sort as dates', async () => {
  const def = (await q(`select qual from pg_policies where tablename='iapp_queue_public_cache'`))[0].qual;
  assert.match(def, /\(date = /); assert.match(def, /Africa\/Cairo/);
  assert.equal((await q(`select ('2026-10-09' < '2026-10-11') b`))[0].b, true);
});

// ---- ROLLBACK + DATA RESTORE ----
await db.exec(ROLLBACK);
await ok('ROLLBACK: old open policy restored (using true) and the new one removed', async () => {
  const p = await q(`select policyname, qual from pg_policies where tablename='iapp_queue_public_cache'`);
  assert.equal(p.length, 1); assert.equal(p[0].policyname, 'public_read_queue_cache'); assert.equal(p[0].qual, 'true');
});
await ok('RESTORE: the rollback restores the deleted history from the backup table, identical to the pre-change snapshot', async () => {
  const now = await q(`select id,patient,clinic,doctor,wait_status,date,time,arrived_at,called_at,queue_number from public.iapp_queue_public_cache where date < '${today}' order by id`);
  assert.deepEqual(now, snapshotStale);
});
await ok('RESTORE is idempotent (running the rollback again does not duplicate or fail)', async () => {
  await db.exec(ROLLBACK);
  assert.equal(n(await q(`select count(*) n from public.iapp_queue_public_cache where date < '${today}'`)), snapshotStale.length);
});
await ok('RE-APPLY after rollback works', async () => {
  await db.exec(APPLY);
  assert.equal(n(await as('anon', 'select count(*) n from public.iapp_queue_public_cache')), 4);
});


// ---- G1 aborts (precise counters, zero partial change) ----
const d3 = `((now() at time zone 'Africa/Cairo')::date - 3)::text`, d2 = `((now() at time zone 'Africa/Cairo')::date - 2)`;
const ins = (id, patient, date, cancelled = false) => `insert into public.iapp_appointments values (${id},'${patient}','CLINIC-A','Dr X','done',${d2},'10:00',1,2,3,${cancelled});`;
const cins = (id, patient, dateExpr) => `insert into public.iapp_queue_public_cache (id,patient,clinic,doctor,wait_status,date,time,arrived_at,called_at,queue_number) values ('${id}','${patient}','CLINIC-A','Dr X','done',${dateExpr},'10:00','1','2','3');`;
const del = id => `delete from public.iapp_queue_public_cache where id='${id}'; delete from public.iapp_appointments where id=${id};`;
await abortCase('G1: stale row with no appointment', APPLY, /ABORT G1: stale=1 no_matching_appointment=1/, cins('orphan1', 'Orphan', d3), del('orphan1').replace('delete from public.iapp_appointments where id=orphan1;', ''));
await abortCase('G1: cache date differs from the appointment date', APPLY, /ABORT G1: stale=1 no_matching_appointment=0 date_mismatch=1 field_mismatch=0/, ins(8001, 'G P') + cins('8001', 'G P', d3), del(8001));
await abortCase('G1: same date, a field differs', APPLY, /ABORT G1: stale=1 no_matching_appointment=0 date_mismatch=0 field_mismatch=1/, ins(8002, 'Edited Name') + cins('8002', 'Old Name', d2 + '::text'), del(8002));
await abortCase('G1: appointment cancelled', APPLY, /ABORT G1: stale=1 no_matching_appointment=1/, ins(8003, 'C P', null, true) + cins('8003', 'C P', d2 + '::text'), del(8003));

// ---- backup as a trustworthy source: positive checks ----
await ok('BACKUP: holds all deleted rows, identical to the snapshot; invisible to anon/authenticated; RLS on', async () => {
  const b = await q(`select id,patient,clinic,doctor,wait_status,date,time,arrived_at,called_at,queue_number from ${BAK} order by id`);
  assert.deepEqual(b, snapshotStale);
  assert.match(await asErr('anon', `select * from ${BAK}`), /permission denied/);
  assert.match(await asErr('authenticated', `select * from ${BAK}`), /permission denied/);
  for (const r of ['anon', 'authenticated', 'service_role', 'public'])
    for (const priv of ['select', 'insert', 'update', 'delete', 'truncate', 'references', 'trigger'])
      assert.equal((await q(`select has_table_privilege('${r}', '${BAK}', '${priv}') b`))[0].b, false, `${r} must not have ${priv}`);
  assert.match(await asErr('service_role', `delete from ${BAK}`), /permission denied/);
  assert.equal(n(await q(`select count(*) n from pg_class where relname='iapp_queue_public_cache_bak_20261011' and relrowsecurity`)), 1);
});
await ok('no hardcoded LOWER BOUND or date literal in the rollback; drift switch defaults to false', async () => {
  assert.doesNotMatch(ROLLBACK, /LOWER BOUND|date '20\d\d-/);
  assert.match(ROLLBACK, /allow_drift boolean := false/);
});

// ---- ROLLBACK negative tests ----
await abortCase('ROLLBACK aborts, nothing changed, if the backup table is missing', ROLLBACK, /ABORT: backup table/,
  `alter table ${BAK} rename to hidden_bak`, `alter table hidden_bak rename to iapp_queue_public_cache_bak_20261011`);
await abortCase('ROLLBACK R3: a cache row with the same id but DIFFERENT content is a conflict (not counted as restored), nothing changed', ROLLBACK, /ABORT R3: not restored=0 content_conflict=1/,
  `insert into public.iapp_queue_public_cache select * from ${BAK} where id='1009'; update public.iapp_queue_public_cache set patient='Changed' where id='1009'`,
  `delete from public.iapp_queue_public_cache where id='1009'`);
await abortCase('ROLLBACK R3: a conflict on updated_at alone is also detected', ROLLBACK, /ABORT R3: not restored=0 content_conflict=1/,
  `insert into public.iapp_queue_public_cache select * from ${BAK} where id='1010'; update public.iapp_queue_public_cache set updated_at = updated_at + interval '1 second' where id='1010'`,
  `delete from public.iapp_queue_public_cache where id='1010'`);
await abortCase('ROLLBACK R2: old appointments edited/deleted/cancelled/moved after the apply => outdated backup is refused (drift=4)', ROLLBACK, /ABORT drift: 4 backup row/,
  `delete from public.iapp_appointments where id=1001; update public.iapp_appointments set patient='Renamed' where id=1002; update public.iapp_appointments set cancelled=true where id=1003; update public.iapp_appointments set date=date '2020-01-01' where id=1004`, null);

// deliberate restore of the old snapshot (allow_drift=true), data identical to the snapshot
const ROLLBACK_FORCE = ROLLBACK.replace(/^(\s*allow_drift boolean := )false/m, '$1true');
await ok('ROLLBACK with allow_drift=true (deliberate) restores the exact snapshot even though appointments changed', async () => {
  assert.notEqual(ROLLBACK_FORCE, ROLLBACK);
  await db.exec(ROLLBACK_FORCE);
  const now = await q(`select id,patient,clinic,doctor,wait_status,date,time,arrived_at,called_at,queue_number from public.iapp_queue_public_cache where date < '${today}' order by id`);
  assert.deepEqual(now, snapshotStale);
  const p = await q(`select policyname, qual from pg_policies where tablename='iapp_queue_public_cache'`);
  assert.equal(p.length, 1); assert.equal(p[0].policyname, 'public_read_queue_cache'); assert.equal(p[0].qual, 'true');
});

// ---- APPLY again after rollback, with the appointment edited in between: must not proceed silently ----
await abortCase('RE-APPLY after rollback with edited old appointments: G1 stops it (drift=cache rows vs appointments), nothing changes', APPLY, /ABORT G1: stale=20 no_matching_appointment=\d+ date_mismatch=\d+ field_mismatch=\d+/, null, null);

// restore the appointments to their original content (quietly, no trigger) and continue
await quiet(`delete from public.iapp_appointments where id between 1001 and 1020; insert into public.iapp_appointments select * from json_populate_recordset(null::public.iapp_appointments, '${apptJson}')`);

// ---- G2 negatives (old backup table that exists) ----
await abortCase('G2a: existing backup row with the same id but a different field => content_conflict, nothing changed', APPLY, /ABORT G2a: 1 existing backup row.*content_conflict=1/,
  `update ${BAK} set patient='TAMPERED' where id='1006'`, `update ${BAK} b set patient=c.patient from public.iapp_queue_public_cache c where c.id=b.id and b.id='1006'`);
await abortCase('G2a: difference only in updated_at is also detected', APPLY, /ABORT G2a: 1 existing backup row/,
  `update ${BAK} set updated_at = updated_at - interval '1 hour' where id='1011'`, `update ${BAK} b set updated_at=c.updated_at from public.iapp_queue_public_cache c where c.id=b.id and b.id='1011'`);
await abortCase('G2b: backup has a leftover row that is not in the current stale set (old backup would be silently reused) => abort', APPLY, /ABORT G2b: backup table holds 1 row/,
  `delete from public.iapp_queue_public_cache where id='1005'`, `insert into public.iapp_queue_public_cache select * from ${BAK} where id='1005'`);
await ok('G2c: if the copy into the backup is not identical (simulated by a BEFORE INSERT trigger altering data) the apply aborts with nothing changed', async () => {
  await db.exec(`delete from ${BAK} where id in ('1007','1008')`);
  await db.exec(`create function public.tmp_alter() returns trigger language plpgsql as $f$ begin new.patient := upper(new.patient); return new; end $f$;
    create trigger tmp_alter before insert on ${BAK} for each row execute function public.tmp_alter();`);
  const s0 = await state(); let err = null;
  try { await db.exec(APPLY); } catch (e) { err = e.message; }
  await db.exec('rollback').catch(() => {});
  const s1 = await state();
  await db.exec(`drop trigger tmp_alter on ${BAK}; drop function public.tmp_alter(); insert into ${BAK} select * from public.iapp_queue_public_cache c where c.date < '${today}' and not exists (select 1 from ${BAK} b where b.id=c.id)`);
  assert.match(err || '', /ABORT G2c: 2 stale row\(s\) have no identical backup row/);
  assert.equal(s1, s0);
});

// ---- successful path after all negatives ----
await ok('APPLY succeeds when backup and cache agree; second run is a no-op', async () => {
  await db.exec(APPLY);
  assert.equal(n(await as('anon', 'select count(*) n from public.iapp_queue_public_cache')), 4);
  assert.equal(n(await q(`select count(*) n from public.iapp_queue_public_cache where date < '${today}'`)), 0);
  const s0 = await state(); await db.exec(APPLY); assert.equal(await state(), s0);
});
await ok('ROLLBACK (normal, no drift) restores the exact snapshot, content-verified; running it twice is idempotent', async () => {
  await db.exec(ROLLBACK); await db.exec(ROLLBACK);
  const now = await q(`select id,patient,clinic,doctor,wait_status,date,time,arrived_at,called_at,queue_number from public.iapp_queue_public_cache where date < '${today}' order by id`);
  assert.deepEqual(now, snapshotStale);
});
await db.exec(APPLY);
await abortCase('OLD BACKUP REUSE: a later apply with NEW stale rows while the earlier backup still exists is refused (leftover=20)', APPLY, /ABORT G2b: backup table holds 20 row/,
  ins(9001, 'Later Patient') + cins('9001', 'Later Patient', d2 + '::text'), del(9001));

await ok('G3 + delete-only-identical: a row that appears during the delete is never removed unbacked; the script aborts and rolls everything back', async () => {
  await db.exec(ROLLBACK); // back to the open policy with the stale rows restored
  await db.exec(`create function public.tmp_late() returns trigger language plpgsql as $f$ begin
      insert into public.iapp_queue_public_cache (id,patient,clinic,date) values ('late9','Late','CLINIC-A', ((now() at time zone 'Africa/Cairo')::date - 1)::text) on conflict do nothing; return null; end $f$;
    create trigger tmp_late after delete on public.iapp_queue_public_cache for each statement execute function public.tmp_late();`);
  const s0 = await state(); let err = null;
  try { await db.exec(APPLY); } catch (e) { err = e.message; }
  await db.exec('rollback').catch(() => {});
  const s1 = await state();
  await db.exec('drop trigger tmp_late on public.iapp_queue_public_cache; drop function public.tmp_late()');
  assert.match(err || '(no error)', /ABORT G3: 1 stale row/);
  assert.equal(s1, s0);
  await db.exec(APPLY);
});

console.log(`\nRESULT: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
