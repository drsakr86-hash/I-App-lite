import test from 'node:test';
import assert from 'node:assert/strict';
import { ensureSession } from '../src/services/auth.js';

const mem = obj => ({ getItem: k => (k in obj ? obj[k] : null) });
const okJson = body => ({ ok: true, status: 200, json: async () => body });

test('valid session: no network call', async () => {
  let fetched = false;
  const client = { auth: { getSession: async () => ({ data: { session: { expires_at: 2000 } } }) } };
  const r = await ensureSession(client, { now: () => 1000 * 1000, storage: mem({}), fetchImpl: async () => { fetched = true; } });
  assert.deepEqual(r, { ok: true });
  assert.equal(fetched, false);
});

test('SDK stuck: refreshes from the stored refresh token and sets the session', async () => {
  let set = null;
  const client = { auth: {
    getSession: async () => ({ data: { session: null }, error: { message: 'Failed to fetch' } }),
    setSession: async s => { set = s; return { error: null }; }
  } };
  const storage = mem({ iapp_sb_auth: JSON.stringify({ refresh_token: 'r1' }) });
  const fetchImpl = async (url, opts) => {
    assert.match(url, /grant_type=refresh_token$/);
    assert.equal(JSON.parse(opts.body).refresh_token, 'r1');
    return okJson({ access_token: 'a2', refresh_token: 'r2' });
  };
  const r = await ensureSession(client, { url: 'https://x', apiKey: 'k', storage, fetchImpl });
  assert.equal(r.ok, true);
  assert.deepEqual(set, { access_token: 'a2', refresh_token: 'r2' });
});

test('no stored session -> no-session', async () => {
  const client = { auth: { getSession: async () => ({ data: { session: null } }) } };
  const r = await ensureSession(client, { url: 'https://x', apiKey: 'k', storage: mem({}) });
  assert.deepEqual(r, { ok: false, reason: 'no-session' });
});

test('rejected refresh token -> expired; network failure -> network', async () => {
  const client = { auth: { getSession: async () => ({ data: { session: null } }) } };
  const storage = mem({ iapp_sb_auth: JSON.stringify({ refresh_token: 'r1' }) });
  const expired = await ensureSession(client, { url: 'https://x', apiKey: 'k', storage, fetchImpl: async () => ({ ok: false, status: 400 }) });
  assert.equal(expired.reason, 'expired');
  const net = await ensureSession(client, { url: 'https://x', apiKey: 'k', storage, fetchImpl: async () => { throw new TypeError('Failed to fetch'); } });
  assert.equal(net.reason, 'network');
});
