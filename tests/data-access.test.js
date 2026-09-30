import test from 'node:test';
import assert from 'node:assert/strict';
import { getSB, iappRpc } from '../src/modules/data-access/index.js';

// These tests run in order and rely on getSB()'s module-private cache
// (mirrors the legacy `_sb` variable), so each test builds on the global
// state the previous one left behind -- same approach as theme.test.js.

test('getSB: returns null when neither the shared client nor window.supabase exist (the initial _sb value)', () => {
  delete globalThis.__IAppSupabaseClient;
  delete globalThis.supabase;
  assert.equal(getSB(), null);
});

test('getSB: falls back to globalThis.supabase.createClient(...) with the expected args', () => {
  delete globalThis.__IAppSupabaseClient;
  let calledWith = null;
  const fakeClient = { fake: true };
  globalThis.supabase = {
    createClient(url, key, opts) {
      calledWith = { url, key, opts };
      return fakeClient;
    }
  };
  const sb = getSB();
  assert.equal(sb, fakeClient);
  assert.equal(calledWith.url, 'https://mofdveiwlaymlabvsypu.supabase.co');
  assert.equal(calledWith.key, 'sb_publishable_tVZ1mUOyb3vOjRV1jBpq6g_P2u-xIqF');
  assert.deepEqual(calledWith.opts, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'iapp_sb_auth' } });
});

test('getSB: caches the result -- a later call does not re-resolve even if the globals change', () => {
  const previous = getSB();
  globalThis.__IAppSupabaseClient = { different: true };
  assert.equal(getSB(), previous);
  delete globalThis.__IAppSupabaseClient;
});

test('iappRpc: forwards to globalThis.IAppModules.rpc.safe and returns its result as-is', async () => {
  const calls = [];
  globalThis.IAppModules = {
    rpc: {
      safe: async (sb, name, args) => {
        calls.push({ sb, name, args });
        return { data: { ok: true }, error: null };
      }
    }
  };
  const sbStub = { id: 'sb' };
  const result = await iappRpc(sbStub, 'iapp_do_thing', { a: 1 });
  assert.deepEqual(calls, [{ sb: sbStub, name: 'iapp_do_thing', args: { a: 1 } }]);
  assert.deepEqual(result, { data: { ok: true }, error: null });
});
