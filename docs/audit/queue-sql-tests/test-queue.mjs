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

console.log(`# cairo today=${today}; stale cache rows=${snapshotStale.length}`);

// ---- BEFORE ----
await ok('BEFORE: anon reads ALL days from the table (the leak)', async () => assert.equal(n(await as('anon', 'select count(*) n from public.iapp_queue_public_cache')), snapshotStale.length + 4));
await ok('BEFORE: anon via the view sees only today (view filter works)', async () => assert.equal(n(await as('anon', 'select count(*) n from public.iapp_queue_public')), 4));
await ok('BEFORE: anon cannot read appointments (permission denied)', async () => assert.match(await asErr('anon', 'select * from public.iapp_appointments'), /permission denied/));

// ---- APPLY ----
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
await ok('RESTORE: the rollback file rebuilds the deleted history from iapp_appointments, identical to the pre-change snapshot', async () => {
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

// ---- GUARD: a stale cache row that cannot be rebuilt must stop the whole change ----
await ok('GUARD: an un-rebuildable stale row aborts the apply and changes nothing', async () => {
  await db.exec(`insert into public.iapp_queue_public_cache (id,patient,clinic,date) values ('orphan1','Orphan','CLINIC-A', ((now() at time zone 'Africa/Cairo')::date - 3)::text)`);
  await db.exec(`drop policy public_read_queue_cache_today on public.iapp_queue_public_cache; create policy public_read_queue_cache on public.iapp_queue_public_cache for select to anon, authenticated using (true);`);
  let err = null;
  try { await db.exec(APPLY); } catch (e) { err = e.message; }
  await db.exec('rollback').catch(() => {});
  assert.match(err || '', /ABORT: 1 stale cache row/);
  assert.equal(n(await q(`select count(*) n from pg_policies where tablename='iapp_queue_public_cache' and policyname='public_read_queue_cache'`)), 1, 'old policy still in place');
  assert.equal(n(await q(`select count(*) n from public.iapp_queue_public_cache where id='orphan1'`)), 1, 'row not deleted');
  await db.exec(`delete from public.iapp_queue_public_cache where id='orphan1'`);
});

console.log(`\nRESULT: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
