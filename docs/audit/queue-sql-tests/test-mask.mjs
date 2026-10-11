import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const HERE = new URL('.', import.meta.url).pathname;
const SCHEMA = fs.readFileSync(HERE + 'schema.sql', 'utf8');
const DRAFT = fs.readFileSync((process.env.IAPP_REPO || '/root/I-App-lite') + '/docs/sql/queue-public-mask-names.sql', 'utf8');
const MROLL = fs.readFileSync((process.env.IAPP_REPO || '/root/I-App-lite') + '/docs/sql/queue-public-mask-names-rollback.sql', 'utf8');
const html = fs.readFileSync((process.env.IAPP_REPO || '/root/I-App-lite') + '/public/queue-display.html', 'utf8');
// the real JS functions of the TV screen, extracted verbatim
const words = new Function('return ' + html.match(/function words\(n\)\{[\s\S]*?\n/)[0].replace('function words(n)', 'function(n)'))();
const wordsSrc = html.match(/function words\(n\)\{.*\}/)[0];
const dispSrc = html.match(/function displayName\(n\)\{.*\}/)[0];
const displayName = new Function('SHOW_FULL_NAME', wordsSrc + dispSrc + ';return displayName;')(false);
const db = new PGlite(); await db.exec(SCHEMA);
let pass = 0, fail = 0; const ok = async (n, f) => { try { await f(); pass++; console.log('PASS', n); } catch (e) { fail++; console.log('FAIL', n, '->', String(e.message).split('\n')[0]); } };
// G0: a trigger function that is not the reviewed one must stop the script, nothing changed
await ok('G0: an unexpected live trigger function aborts the apply and changes nothing', async () => {
  await db.exec(`create or replace function public.iapp_refresh_queue_public_cache() returns trigger language plpgsql security definer set search_path to 'public' as $f$ begin return coalesce(new,old); end $f$`);
  let err = null; try { await db.exec(DRAFT); } catch (e) { err = e.message; } await db.exec('rollback').catch(() => {});
  assert.match(err || '(no error)', /ABORT G0/);
  assert.equal((await db.query(`select to_regprocedure('public.iapp_mask_name(text)')::text r`)).rows[0].r, null, 'mask function not created');
  await db.exec(SCHEMA.match(/create or replace function public\.iapp_refresh_queue_public_cache\(\)[\s\S]*?\$function\$;/)[0]); // restore the reviewed function
});
// rows that exist BEFORE the apply (full names, written by the old trigger)
await db.exec(`insert into public.iapp_appointments values (50, 'سارة أحمد علي', 'A', 'Dr', 'waiting', ((now() at time zone 'Africa/Cairo')::date), '09:00', 1, null, 1, false), (51, 'منى', 'A', 'Dr', 'waiting', ((now() at time zone 'Africa/Cairo')::date), '09:05', 2, null, 2, false)`);
await ok('BEFORE: the cache holds the full name', async () => assert.equal((await db.query(`select patient p from public.iapp_queue_public_cache where id='50'`)).rows[0].p, 'سارة أحمد علي'));
await db.exec(DRAFT);
await ok('AFTER apply: existing cache rows are masked; one-word names unchanged; appointments untouched', async () => {
  assert.equal((await db.query(`select patient p from public.iapp_queue_public_cache where id='50'`)).rows[0].p, 'سارة أ.');
  assert.equal((await db.query(`select patient p from public.iapp_queue_public_cache where id='51'`)).rows[0].p, 'منى');
  assert.equal((await db.query(`select patient p from public.iapp_appointments where id=50`)).rows[0].p, 'سارة أحمد علي');
});
await ok('AFTER apply: anon cannot call iapp_mask_name directly, and cannot read appointments', async () => {
  await db.exec('set role anon'); let e1 = null; try { await db.query(`select public.iapp_mask_name('x')`); } catch (e) { e1 = e.message; } await db.exec('reset role');
  assert.match(e1 || '(no error)', /permission denied/);
});
await ok('IDEMPOTENT: applying twice is fine (G0 accepts the already-masked function)', async () => { await db.exec(DRAFT); assert.equal((await db.query(`select patient p from public.iapp_queue_public_cache where id='50'`)).rows[0].p, 'سارة أ.'); });
await ok('ROLLBACK: reviewed function back, today\'s full names back in the cache', async () => {
  await db.exec(MROLL);
  assert.equal((await db.query(`select patient p from public.iapp_queue_public_cache where id='50'`)).rows[0].p, 'سارة أحمد علي');
  assert.doesNotMatch((await db.query(`select prosrc from pg_proc where proname='iapp_refresh_queue_public_cache'`)).rows[0].prosrc, /iapp_mask_name/);
  await db.exec(MROLL); // twice
  await db.exec(DRAFT); // and apply again
  assert.equal((await db.query(`select patient p from public.iapp_queue_public_cache where id='50'`)).rows[0].p, 'سارة أ.');
});
await db.exec(`delete from public.iapp_appointments where id in (50,51)`);
const names = ['محمد علي السيد', 'أحمد', '', null, '   سارة   أحمد ,  علي', '<b>x</b> y', 'عبد الستار سالم صقر الدين محمد', 'منى، سعيد', 'Mona Hassan', 'علي ', '،،'];
for (const nm of names) await ok(`parity SQL mask == TV displayName for ${JSON.stringify(nm)}`, async () => {
  const sql = (await db.query('select public.iapp_mask_name($1) m', [nm])).rows[0].m;
  assert.equal(sql, displayName(nm));
});
await ok('idempotent: mask(mask(x)) == mask(x)', async () => { for (const nm of names) { const a = (await db.query('select public.iapp_mask_name($1) m', [nm])).rows[0].m; const b = (await db.query('select public.iapp_mask_name($1) m', [a])).rows[0].m; assert.equal(b, a); } });
await ok('trigger stores masked names, appointments keep the full name, anon view shows masked + same row', async () => {
  await db.exec(`insert into public.iapp_appointments values (1, 'محمد علي السيد', 'A', 'Dr', 'waiting', ((now() at time zone 'Africa/Cairo')::date), '10:00', 1, null, 1, false)`);
  assert.equal((await db.query(`select patient p from public.iapp_appointments where id=1`)).rows[0].p, 'محمد علي السيد');
  await db.exec('set role anon'); const r = (await db.query(`select patient p, queue_number q from public.iapp_queue_public`)).rows; await db.exec('reset role');
  assert.deepEqual(r, [{ p: 'محمد ع.', q: '1' }]);
});
console.log(`RESULT: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
