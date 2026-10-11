import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const src = fs.readFileSync('./test-queue.mjs', 'utf8');
const SCHEMA = src.match(/await db\.exec\(`\n(create role[\s\S]*?)`\);/)[1];
const DRAFT = fs.readFileSync((process.env.IAPP_REPO || '/root/I-App-lite') + '/docs/sql/queue-public-mask-names.DRAFT.sql', 'utf8');
const html = fs.readFileSync((process.env.IAPP_REPO || '/root/I-App-lite') + '/public/queue-display.html', 'utf8');
// the real JS functions of the TV screen, extracted verbatim
const words = new Function('return ' + html.match(/function words\(n\)\{[\s\S]*?\n/)[0].replace('function words(n)', 'function(n)'))();
const wordsSrc = html.match(/function words\(n\)\{.*\}/)[0];
const dispSrc = html.match(/function displayName\(n\)\{.*\}/)[0];
const displayName = new Function('SHOW_FULL_NAME', wordsSrc + dispSrc + ';return displayName;')(false);
const db = new PGlite(); await db.exec(SCHEMA);
let pass = 0, fail = 0; const ok = async (n, f) => { try { await f(); pass++; console.log('PASS', n); } catch (e) { fail++; console.log('FAIL', n, '->', String(e.message).split('\n')[0]); } };
await db.exec(DRAFT);
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
