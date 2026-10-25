// Web Push: VAPID header is a valid ES256 JWT, subscriptions that are gone get dropped, nothing runs without the secret key,
// and the SQL/worker/service-worker wiring is in place. (Mocked network: no real push was sent by these tests.)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { vapidAuthHeader, sendPush, notifyWaiting } from '../supabase/functions/_shared/push.js';

const b64u = b => Buffer.from(b).toString('base64url');
function keys() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jp = publicKey.export({ format: 'jwk' }), jd = privateKey.export({ format: 'jwk' });
  const raw = Buffer.concat([Buffer.from([4]), Buffer.from(jp.x, 'base64url'), Buffer.from(jp.y, 'base64url')]);
  return { pub: b64u(raw), priv: jd.d, publicKey };
}
const EP = 'https://fcm.googleapis.com/fcm/send/abc123';

test('VAPID header: ES256 JWT with the endpoint origin, 12h expiry and a signature the public key verifies', async () => {
  const k = keys(); const now = Date.parse('2026-10-25T12:00:00Z');
  const h = await vapidAuthHeader({ endpoint: EP, publicKey: k.pub, privateKey: k.priv, subject: 'mailto:a@b.c', now });
  const m = /^vapid t=([\w-]+)\.([\w-]+)\.([\w-]+), k=([\w-]+)$/.exec(h); assert.ok(m, h);
  assert.equal(m[4], k.pub);
  const claims = JSON.parse(Buffer.from(m[2], 'base64url')); assert.deepEqual(claims, { aud: 'https://fcm.googleapis.com', exp: Math.floor(now / 1000) + 43200, sub: 'mailto:a@b.c' });
  assert.equal(JSON.parse(Buffer.from(m[1], 'base64url')).alg, 'ES256');
  const ok = crypto.verify('sha256', Buffer.from(m[1] + '.' + m[2]), { key: k.publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(m[3], 'base64url'));
  assert.equal(ok, true);
  assert.equal(Buffer.from(m[3], 'base64url').length, 64);
});

test('bad public key is rejected, no request is made', async () => {
  let called = false; const f = async () => { called = true; return { status: 201 }; };
  assert.equal(await sendPush({ endpoint: EP }, { publicKey: 'AAAA', privateKey: 'x', subject: 's' }, f), 'error');
  assert.equal(called, false);
});

test('sendPush maps 201 ok, 404/410 gone, 5xx and network errors error; sends no body', async () => {
  const k = keys(); const v = { publicKey: k.pub, privateKey: k.priv, subject: 'mailto:a@b.c' };
  let seen; const f = status => async (u, o) => { seen = o; return { status }; };
  assert.equal(await sendPush({ endpoint: EP }, v, f(201)), 'ok'); assert.equal(seen.body, undefined); assert.equal(seen.headers['Content-Length'], '0'); assert.equal(seen.headers.Urgency, 'high');
  assert.equal(await sendPush({ endpoint: EP }, v, f(410)), 'gone'); assert.equal(await sendPush({ endpoint: EP }, v, f(404)), 'gone');
  assert.equal(await sendPush({ endpoint: EP }, v, f(503)), 'error');
  assert.equal(await sendPush({ endpoint: EP }, v, async () => { throw new Error('net'); }), 'error');
});

test('notifyWaiting: no key = nothing claimed; gone subscriptions are dropped; failures never throw', async () => {
  const k = keys(); const calls = { claim: 0, drop: [] };
  const store = job => ({ pushClaim: async () => { calls.claim++; return job; }, pushDrop: async ids => { calls.drop.push(...ids); } });
  assert.deepEqual(await notifyWaiting({ store: store(null), privateKey: '' }), { skipped: 'no_key' }); assert.equal(calls.claim, 0, 'must not mark chats as notified without a key');
  assert.deepEqual(await notifyWaiting({ store: store(null), privateKey: k.priv }), { sent: 0 });
  const job = { count: 2, public_key: k.pub, subs: [{ id: 1, endpoint: EP }, { id: 2, endpoint: 'https://updates.push.services.mozilla.com/x' }] };
  const f = async u => ({ status: u.includes('mozilla') ? 410 : 201 });
  assert.deepEqual(await notifyWaiting({ store: store(job), privateKey: k.priv, fetchImpl: f }), { sent: 1, gone: 1 }); assert.deepEqual(calls.drop, [2]);
  const boom = { pushClaim: async () => { throw new Error('db'); }, pushDrop: async () => {} };
  assert.deepEqual(await notifyWaiting({ store: boom, privateKey: k.priv }), { error: true });
});

test('wiring: SQL is staff-checked and service-only where needed; worker calls push; service worker shows a fixed notice', () => {
  const sql = fs.readFileSync(new URL('../docs/sql/whatsapp-push.sql', import.meta.url), 'utf8');
  const worker = fs.readFileSync(new URL('../supabase/functions/whatsapp-worker/index.ts', import.meta.url), 'utf8');
  const sw = fs.readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
  assert.equal((sql.match(/iapp_has_role\(array\['admin', 'secretary'\]\)/g) || []).length, 3);
  assert.match(sql, /grant execute on function public\.wa_push_claim\(\), public\.wa_push_drop\(bigint\[\]\) to service_role/);
  assert.doesNotMatch(sql, /grant[^;]*wa_push_claim[^;]*authenticated/);
  assert.match(sql, /revoke all on table public\.wa_push_subscriptions from public, anon, authenticated/);
  assert.match(worker, /notifyWaiting\(\{ store, privateKey: env\('VAPID_PRIVATE_KEY'\)/);
  assert.match(sw, /addEventListener\("push"/); assert.match(sw, /addEventListener\("notificationclick"/);
  const pushHandler = sw.slice(sw.indexOf('addEventListener("push"'), sw.indexOf('addEventListener("notificationclick"'));
  assert.doesNotMatch(pushHandler, /event\.data/, 'the push shows a fixed text, never payload content');
});
