// REAL-PostgreSQL concurrency test of docs/sql/queue-public-today-only(.sql|-rollback.sql). Synthetic data only. No network, no production access.
// PGlite is single-session and cannot test this; this file needs a throwaway local PostgreSQL server (see README). It never touches anything else.
//   env: PGSOCK=<unix socket dir>  PGPORT=<port>  PGUSER=<superuser, default postgres>  IAPP_REPO=<repo root>  NODE_PATH=<dir with node_modules/pg>
import pg from 'pg';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = (process.env.IAPP_REPO || path.resolve(HERE, '../../..')) + '/docs/sql/';
const APPLY = fs.readFileSync(REPO + 'queue-public-today-only.sql', 'utf8');
const ROLLBACK = fs.readFileSync(REPO + 'queue-public-today-only-rollback.sql', 'utf8');
const SCHEMA = fs.readFileSync(HERE + '/schema.sql', 'utf8').replace(/create role [^;]*;/g, '');
const CONN = { host: process.env.PGSOCK, port: Number(process.env.PGPORT || 5432), user: process.env.PGUSER || 'postgres' };
const BAK = 'public.iapp_queue_public_cache_bak_20261011';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let passed = 0, failed = 0;
const ok = async (name, fn) => { try { await fn(); passed++; console.log('PASS', name); } catch (e) { failed++; console.log('FAIL', name, '->', String(e.message).split('\n')[0]); } };

const admin = new pg.Client({ ...CONN, database: 'postgres' }); await admin.connect();
for (const r of ['anon', 'authenticated', 'service_role']) await admin.query(`do $$ begin if not exists (select 1 from pg_roles where rolname='${r}') then create role ${r} nologin; end if; end $$`);
for (const d of (await admin.query("select datname from pg_database where datname like 'iapp\\_c%' or datname='iapp_tpl'")).rows) await admin.query(`drop database ${d.datname} with (force)`);
await admin.query('create database iapp_tpl');
const mk = async db => { const c = new pg.Client({ ...CONN, database: db }); await c.connect(); return c; };

// leftovers from an earlier run were dropped above
// ---- template database with the fixtures (past days written like the trigger would have, today through the trigger) ----
const t = await mk('iapp_tpl');
await t.query(SCHEMA);
await t.query('alter table public.iapp_appointments disable trigger trg_iapp_refresh_queue_public_cache');
let id = 1000;
for (let back = 5; back >= 1; back--) for (const clinic of ['CLINIC-A', 'CLINIC-B']) for (let k = 0; k < 2; k++) {
  id++;
  await t.query(`insert into public.iapp_appointments values (${id}, 'Test Patient ${id}', '${clinic}', 'Dr X', 'done', (((now() at time zone 'Africa/Cairo')::date) - ${back}), '10:00', ${id}00, ${id}50, ${k + 1}, false)`);
}
await t.query(`insert into public.iapp_queue_public_cache (id,patient,clinic,doctor,wait_status,date,time,arrived_at,called_at,queue_number)
  select id::text, patient, clinic, doctor, wait_status, date::text, time, arrived_at::text, called_at::text, queue_number::text from public.iapp_appointments`);
await t.query('alter table public.iapp_appointments enable trigger trg_iapp_refresh_queue_public_cache');
for (const [i, st] of [[1, 'waiting'], [2, 'called'], [3, 'in'], [4, 'waiting']])
  await t.query(`insert into public.iapp_appointments values (${5000 + i}, 'Today Patient ${i}', 'CLINIC-A', 'Dr Y', '${st}', ((now() at time zone 'Africa/Cairo')::date), '11:0${i}', ${i}000, null, ${i}, false)`);
await t.query('alter default privileges in schema public grant all on tables to anon, authenticated, service_role');
const STALE = 20;
assert.equal(Number((await t.query(`select count(*) n from public.iapp_queue_public_cache where date < ((now() at time zone 'Africa/Cairo')::date)::text`)).rows[0].n), STALE);
await t.end();

let seq = 0;
const fresh = async () => { const name = 'iapp_c' + (++seq); await admin.query(`create database ${name} template iapp_tpl`); return name; };
const state = async c => JSON.stringify({
  pol: (await c.query(`select policyname, qual from pg_policies where tablename='iapp_queue_public_cache' order by 1`)).rows,
  cache: (await c.query('select * from public.iapp_queue_public_cache order by id')).rows,
  bak: (await c.query(`select to_regclass('${BAK}')::text r`)).rows[0].r ? (await c.query(`select * from ${BAK} order by id`)).rows : null,
});
const waitSleeping = async db => { for (let i = 0; i < 100; i++) { const r = await admin.query(`select 1 from pg_stat_activity where datname=$1 and wait_event='PgSleep'`, [db]); if (r.rowCount) return; await sleep(30); } throw new Error('script never reached the injected pause'); };
const timed = async fn => { const t0 = Date.now(); const r = await fn(); return { ms: Date.now() - t0, r }; };
const run = async (c, sql) => { try { await c.query(sql); return null; } catch (e) { return e; } };
const afterLocks = (f, s) => f.replace('-- G1\n', `select pg_sleep(${s});\n-- G1\n`);
const afterChecks = (f, s) => f.replace('-- Policy:', `select pg_sleep(${s});\n-- Policy:`);
const OLD = id => `update public.iapp_appointments set patient='Edited ${id}' where id=${id}`;

const orig = async c => (await c.query(`select * from public.iapp_queue_public_cache where date < ((now() at time zone 'Africa/Cairo')::date)::text order by id`)).rows;
const staleCount = async c => Number((await c.query(`select count(*) n from public.iapp_queue_public_cache where date < ((now() at time zone 'Africa/Cairo')::date)::text`)).rows[0].n);
const closeAll = async cs => { for (const c of cs) await c.end().catch(() => {}); };
const NEWBOOK = `insert into public.iapp_appointments values (7001,'New Booking','CLINIC-A','Dr Y','waiting',((now() at time zone 'Africa/Cairo')::date),'12:00',1,null,9,false)`;

await ok('C1 while the script holds its locks, appointment writers WAIT (none fail, none is lost); appointment readers do not wait; afterwards every waiting write is applied and consistent', async () => {
  const db = await fresh(); const cs = await Promise.all([1, 2, 3, 4, 5, 6].map(() => mk(db))); const [A, B, C, D, E, X] = cs;
  const before = await orig(X);
  const applyP = run(A, afterLocks(APPLY, 2)); await waitSleeping(db);
  const read = await timed(() => E.query('select count(*) from public.iapp_appointments'));
  const w = [timed(() => B.query(NEWBOOK)), timed(() => C.query(OLD(1005))), timed(() => D.query(`update public.iapp_appointments set wait_status='called' where id=5001`))];
  const [ae, ...ws] = [await applyP, ...(await Promise.all(w))];
  assert.equal(ae, null, 'script succeeded');
  assert.ok(read.ms < 500, `reading appointments did not wait (${read.ms}ms)`);
  for (const x of ws) assert.ok(x.ms > 900, `a write waited for the script (${x.ms}ms) and then succeeded`);
  const r = (await X.query(`select (select count(*) from public.iapp_queue_public_cache where id='7001')::int newrow, (select wait_status from public.iapp_queue_public_cache where id='5001') st,
    (select patient from public.iapp_appointments where id=1005) edited, (select count(*) from public.iapp_queue_public_cache where id='1005')::int cache1005`)).rows[0];
  assert.deepEqual(r, { newrow: 1, st: 'called', edited: 'Edited 1005', cache1005: 0 });
  assert.equal(await staleCount(X), 0);
  assert.deepEqual((await X.query(`select * from ${BAK} order by id`)).rows, before, 'backup = exact original stale rows (incl. 1005 as it was before the edit)');
  await closeAll(cs);
});

await ok('C2 a direct writer to the cache (service_role job, SQL editor) waits too; its row is written after the commit and is then simply hidden from anon (and caught by a rerun)', async () => {
  const db = await fresh(); const cs = await Promise.all([1, 2, 3].map(() => mk(db))); const [A, B, X] = cs;
  const applyP = run(A, afterChecks(APPLY, 1.5)); await waitSleeping(db);
  const ins = await timed(() => B.query(`insert into public.iapp_queue_public_cache (id,patient,clinic,date) values ('late1','Late','CLINIC-A', ((now() at time zone 'Africa/Cairo')::date - 1)::text)`));
  assert.equal(await applyP, null); assert.ok(ins.ms > 900, `insert waited (${ins.ms}ms)`);
  assert.equal(await staleCount(X), 1);
  await X.query('set role anon'); const seen = Number((await X.query(`select count(*) n from public.iapp_queue_public_cache where id='late1'`)).rows[0].n); await X.query('reset role');
  assert.equal(seen, 0, 'anon cannot see it');
  await closeAll(cs);
});

await ok('C3 an in-flight transaction that does not finish: the script gives up after 1 s with 55P03, changes nothing, and reception is stalled at most ~that second', async () => {
  const db = await fresh(); const cs = await Promise.all([1, 2, 3, 4].map(() => mk(db))); const [A, B, C, X] = cs;
  await B.query('begin'); await B.query(OLD(1007));
  const s0 = await state(X); // B uncommitted
  const t0 = Date.now(); const applyP = run(A, APPLY); await sleep(250);
  const book = await timed(() => C.query(NEWBOOK)); const err = await applyP; const ms = Date.now() - t0;
  await B.query('rollback');
  assert.equal(err?.code, '55P03', err?.message); assert.ok(ms >= 950 && ms < 3000, `script gave up after ${ms}ms`);
  assert.ok(book.ms < 1500, `the booking waited ${book.ms}ms (bounded by the script's lock_timeout), then succeeded`);
  const s1 = JSON.parse(await state(X)); const base = JSON.parse(s0);
  base.cache = s1.cache; // the booking added its (today) cache row; everything else must be identical
  assert.deepEqual(s1.pol, base.pol); assert.equal(s1.bak, null);
  assert.deepEqual(s1.cache.filter(r => r.date < s1.cache.find(x => x.id === '7001').date), JSON.parse(s0).cache.filter(r => r.date < s1.cache.find(x => x.id === '7001').date));
  await closeAll(cs);
});

await ok('C4 stress, 25 rounds: APPLY racing with single-row edits, multi-row batch updates and multi-statement transactions (today row then old row): no deadlock, no lost/unbacked row, no stale row left', async () => {
  let applied = 0; const other = []; let maxApplyMs = 0, maxStall = 0;
  for (let round = 0; round < 25; round++) {
    const db = await fresh(); const A = await mk(db); const X = await mk(db);
    const o = await orig(X); const workers = await Promise.all([1, 2, 3, 4, 5].map(() => mk(db)));
    let stop = false; const errs = [];
    const rnd = () => Math.random() < 0.65 ? 1001 + Math.floor(Math.random() * 20) : 5001 + Math.floor(Math.random() * 4);
    const stall = async (w, sql) => { const t0 = Date.now(); try { await w.query(sql); } catch (e) { errs.push(e); } maxStall = Math.max(maxStall, Date.now() - t0); };
    const work = workers.map(async (w, wi) => { while (!stop) { const tag = `W${wi}-${Date.now()}`;
      if (wi < 2) await stall(w, `update public.iapp_appointments set patient='${tag}' where id=${rnd()}`);
      else if (wi === 2) { const ids = [0, 1, 2].map(() => 1001 + Math.floor(Math.random() * 20)).filter((v, i, a) => a.indexOf(v) === i); // batch of OLD rows, locked in id order so the workers cannot deadlock with each other
        await stall(w, `with l as (select id from public.iapp_appointments where id in (${ids.join(',')}) order by id for update) update public.iapp_appointments a set patient='${tag}' from l where a.id=l.id`); }
      else if (wi === 3) { try { await w.query('begin'); await w.query(`update public.iapp_appointments set patient='${tag}' where id=${5001 + Math.floor(Math.random() * 4)}`); await w.query(`update public.iapp_appointments set patient='${tag}' where id=${1001 + Math.floor(Math.random() * 20)}`); await w.query('commit'); } catch (e) { errs.push(e); await w.query('rollback').catch(() => {}); } }
      else await stall(w, `select count(*) from public.iapp_queue_public`);
      await sleep(Math.random() * 6); } });
    await sleep(50);
    const t0 = Date.now(); const e = await run(A, APPLY); maxApplyMs = Math.max(maxApplyMs, Date.now() - t0); stop = true; await Promise.all(work);
    if (errs.some(x => x.code === '40P01')) throw new Error('deadlock detected in a worker');
    if (e) { if (e.code === '40P01') throw new Error('deadlock detected in the script'); other.push(e.message.split('\n')[0]); } else applied++;
    if (!e) {
      assert.equal(await staleCount(X), 0);
      const bak = (await X.query(`select * from ${BAK} order by id`)).rows; const byId = new Map(o.map(r => [r.id, r])); const inBak = new Set(bak.map(b => b.id));
      for (const b of bak) assert.deepEqual(b, byId.get(b.id), 'every backed-up row is exactly an original row');
      for (const r of o) if (!inBak.has(r.id)) assert.match((await X.query(`select patient from public.iapp_appointments where id=${r.id}`)).rows[0].patient, /^W\d-/, `row ${r.id} is missing from the backup only because its appointment was edited before the script got its locks`);
    }
    await closeAll([A, X, ...workers]);
  }
  console.log(`   rounds applied=${applied}/25 other=${JSON.stringify(other)} | longest script run=${maxApplyMs}ms | longest single worker statement=${maxStall}ms`);
  assert.equal(applied, 25, 'every round applied (no deadlock, no lock timeout)');
});

await ok('C5 rollback takes the same locks: an edit of an old appointment waits for it, then the app trigger removes that restored cache row (normal app behaviour); nothing else is lost', async () => {
  const db = await fresh(); const cs = await Promise.all([1, 2, 3].map(() => mk(db))); const [A, B, X] = cs;
  assert.equal(await run(A, APPLY), null);
  const rbP = run(A, ROLLBACK.replace('-- R1\n', 'select pg_sleep(1.5);\n-- R1\n')); await waitSleeping(db);
  const edit = await timed(() => B.query(OLD(1008)));
  assert.equal(await rbP, null); assert.ok(edit.ms > 900, `waited (${edit.ms}ms)`);
  assert.equal(await staleCount(X), STALE - 1);
  assert.equal(Number((await X.query(`select count(*) n from public.iapp_queue_public_cache where id='1008'`)).rows[0].n), 0);
  await closeAll(cs);
});

await admin.query('drop database iapp_tpl with (force)');
await admin.end();
console.log(`\nRESULT: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
