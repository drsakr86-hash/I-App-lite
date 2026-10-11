// Local test (PGlite, synthetic data) of docs/sql/patient-code-duplicates-fix.sql and its rollback. No production access.
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const REPO = (process.env.IAPP_REPO || '/root/I-App-lite') + '/docs/sql/';
const FIX = fs.readFileSync(REPO + 'patient-code-duplicates-fix.sql', 'utf8');
const ROLL = fs.readFileSync(REPO + 'patient-code-duplicates-fix-rollback.sql', 'utf8');
let pass = 0, fail = 0; const ok = async (n, f) => { try { await f(); pass++; console.log('PASS', n); } catch (e) { fail++; console.log('FAIL', n, '->', String(e.message).split('\n')[0]); } };

const build = async () => {
  const db = new PGlite();
  await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin; grant usage on schema public to anon, authenticated;
    create table public.iapp_patients_core (id bigint primary key, legacy_id bigint unique, patient_code text, full_name text, created_at timestamptz default now(), updated_at timestamptz default now());
    create table public.iapp_visits_core (id bigint primary key, patient_id bigint references public.iapp_patients_core(id));
    create table public.iapp_store (id bigint generated always as identity primary key, key text unique, value jsonb, updated_at timestamptz default now());
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;`);
  const rows = [[445, 1790449049635, 'P-0062'], [597, 1790455811522, 'P-0062'], [866, 1790539973831, 'P-0062'], [444, 1790451671674, 'P-0063'], [673, 1790456281540, 'P-0063'], [904, 1790540114843, 'P-0063'],
    [443, 1790454401665, 'P-0064'], [712, 1790456943739, 'P-0064'], [943, 1790621009597, 'P-0064'], [1, 11, 'P-0001'], [2, 12, 'P-0002']];
  for (const [id, lg, code] of rows) { await db.exec(`insert into public.iapp_patients_core values (${id}, ${lg}, '${code}', 'Synthetic ${id}')`); await db.exec(`insert into public.iapp_visits_core values (${id}, ${id})`); }
  const active = [866, 904, 943, 1, 2].map(id => { const r = rows.find(x => x[0] === id); return { id: r[1], patientCode: r[2], name: 'Synthetic ' + id }; });
  const trash = [445, 597, 444, 673, 443, 712].map((id, i) => { const r = rows.find(x => x[0] === id); return { id: 'tr' + i, storeKey: 'iapp_patients', deletedAt: 1, label: 'x', record: { id: r[1], patientCode: r[2], name: 'Synthetic ' + id } }; });
  trash.push({ id: 'tr1b', storeKey: 'iapp_patients', deletedAt: 2, label: 'x', record: { id: 1790455811522, patientCode: 'P-0062', name: 'Synthetic 597 (deleted twice)' } }); // same patient deleted twice
  trash.push({ id: 'trX', storeKey: 'iapp_exams', record: { id: 5, patientCode: 'P-0062' } }); // another store key with the same code: must NOT change
  await db.query(`insert into public.iapp_store(key,value) values ('iapp_patients', $1::jsonb), ('iapp_trash', $2::jsonb)`, [JSON.stringify(active), JSON.stringify(trash)]);
  return db;
};
const snap = async db => JSON.stringify([(await db.query('select id,legacy_id,patient_code from public.iapp_patients_core order by id')).rows, (await db.query('select key,value from public.iapp_store order by key')).rows, (await db.query(`select to_regclass('public.iapp_patients_core_codefix_bak_20261011')::text a, to_regclass('public.iapp_store_trash_codefix_bak_20261011')::text b`)).rows]);
const fails = async (db, sql, re) => { const s0 = await snap(db); let err = null; try { await db.exec(sql); } catch (e) { err = e.message; } await db.exec('rollback').catch(() => {}); assert.match(err || '(no error)', re); assert.equal(await snap(db), s0, 'nothing changed'); };

let db = await build();
const before = await snap(db);
await ok('BEFORE: 3 duplicated codes', async () => assert.equal(Number((await db.query(`select count(*) n from (select patient_code from public.iapp_patients_core group by 1 having count(*)>1) d`)).rows[0].n), 3));
await db.exec(FIX);
await ok('AFTER fix: no duplicates, 11 patients still, active patients keep their codes, 6 archive codes', async () => {
  assert.equal(Number((await db.query(`select count(*) n from (select patient_code from public.iapp_patients_core group by 1 having count(*)>1) d`)).rows[0].n), 0);
  assert.equal(Number((await db.query('select count(*) n from public.iapp_patients_core')).rows[0].n), 11);
  const c = Object.fromEntries((await db.query('select id, patient_code from public.iapp_patients_core')).rows.map(r => [r.id, r.patient_code]));
  assert.deepEqual([c[866], c[904], c[943], c[1], c[2]], ['P-0062', 'P-0063', 'P-0064', 'P-0001', 'P-0002']);
  assert.deepEqual([c[445], c[597], c[444], c[673], c[443], c[712]], ['P-0062-D1', 'P-0062-D2', 'P-0063-D1', 'P-0063-D2', 'P-0064-D1', 'P-0064-D2']);
});
await ok('AFTER fix: visits still point to the same patients (no clinical row moved or deleted)', async () => assert.equal(Number((await db.query('select count(*) n from public.iapp_visits_core where id = patient_id')).rows[0].n), 11));
await ok('AFTER fix: trash records got the new code; other trash entries and the patients list are untouched; order and length preserved', async () => {
  const t = (await db.query(`select value v from public.iapp_store where key='iapp_trash'`)).rows[0].v;
  assert.equal(t.length, 8);
  assert.deepEqual(t.slice(0, 6).map(e => e.record.patientCode), ['P-0062-D1', 'P-0062-D2', 'P-0063-D1', 'P-0063-D2', 'P-0064-D1', 'P-0064-D2']);
  assert.equal(t[6].record.patientCode, 'P-0062-D2', 'the second trash record of the same patient is renumbered too');
  assert.equal(t[7].record.patientCode, 'P-0062', 'a record of another store key is untouched');
  assert.deepEqual(t.map(e => e.id), ['tr0', 'tr1', 'tr2', 'tr3', 'tr4', 'tr5', 'tr1b', 'trX']);
  const p = (await db.query(`select value v from public.iapp_store where key='iapp_patients'`)).rows[0].v;
  assert.deepEqual(p.map(e => e.patientCode), ['P-0062', 'P-0063', 'P-0064', 'P-0001', 'P-0002']);
});
await ok('backups hold the 6 original core rows and the original trash blob; closed to API roles', async () => {
  assert.deepEqual((await db.query('select id, patient_code from public.iapp_patients_core_codefix_bak_20261011 order by id')).rows.map(r => r.patient_code), ['P-0064', 'P-0063', 'P-0062', 'P-0062', 'P-0063', 'P-0064']);
  assert.equal((await db.query(`select value v from public.iapp_store_trash_codefix_bak_20261011`)).rows[0].v[0].record.patientCode, 'P-0062');
  for (const t of ['iapp_patients_core_codefix_bak_20261011', 'iapp_store_trash_codefix_bak_20261011']) for (const r of ['anon', 'authenticated', 'service_role'])
    assert.equal((await db.query(`select has_table_privilege('${r}','public.${t}','select,insert,update,delete') b`)).rows[0].b, false);
});
await ok('second run is refused (state no longer the verified pre-change state), nothing changed', async () => fails(db, FIX, /ABORT G0a/));
await ok('ROLLBACK restores the duplicated codes in core and in the trash records, nothing else', async () => {
  await db.exec(ROLL);
  const after = await snap(db); // identical to the start except the two backup tables and updated_at of the store row
  const norm = s => JSON.stringify(JSON.parse(s).slice(0, 2).map((x, i) => i === 1 ? x.map(r => ({ key: r.key, value: r.value })) : x));
  assert.equal(norm(after), norm(before));
});
await ok('G0: an extra duplicated code (a 4th pair) stops the fix', async () => { db = await build(); await db.exec(`insert into public.iapp_patients_core values (7, 77, 'P-0001', 'Dup')`); await fails(db, FIX, /ABORT G0e: expected exactly 3/); });
await ok('G0: an active patient whose code changed in the app store stops the fix', async () => { db = await build(); await db.exec(`update public.iapp_store set value = jsonb_set(value, '{0,patientCode}', '"P-9999"') where key='iapp_patients'`); await fails(db, FIX, /ABORT G0b/); });
await ok('G0: one of the 6 is active again in the app store (restored from trash) stops the fix', async () => { db = await build(); await db.exec(`update public.iapp_store set value = value || '[{"id":1790449049635,"patientCode":"P-0062"}]'::jsonb where key='iapp_patients'`); await fails(db, FIX, /ABORT G0c/); });
await ok('G0: a missing trash record stops the fix', async () => { db = await build(); await db.exec(`update public.iapp_store set value = value - 0 where key='iapp_trash'`); await fails(db, FIX, /ABORT G0d/); });
await ok('G0: an archive code already in use stops the fix', async () => { db = await build(); await db.exec(`update public.iapp_patients_core set patient_code='P-0062-D1' where id=1`); await fails(db, FIX, /ABORT G0[ef]/); });
console.log(`RESULT: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
