import test from 'node:test';
import assert from 'node:assert/strict';
import { createPrivateStorage, PRIVATE_BUCKET } from '../src/services/private-storage.js';
import { resolveFileUrl, registerUrlResolver, normalizeFileMeta } from '../src/services/storage.js';
import { createSignedUrlCache, makeSupabaseResolver } from '../src/modules/atlas/signed-urls.js';

const blob = (type = 'image/png', size = 10) => ({ type, size, arrayBuffer: async () => new ArrayBuffer(size) });
function fake({ uploadError = null, signError = null } = {}) {
  const calls = { upload: [], sign: [], bucket: [] };
  return { calls, storage: { from: b => { calls.bucket.push(b); return {
    upload: async (p, f, o) => { calls.upload.push([p, o]); return { error: uploadError }; },
    createSignedUrl: async (p, ttl) => { calls.sign.push([p, ttl]); return signError ? { data: null, error: signError } : { data: { signedUrl: 'https://x/' + p + '?t=1' }, error: null }; }
  }; } } };
}
const on = () => true;

test('everything is refused while the flag is off', async () => {
  const s = createPrivateStorage({ client: fake(), enabled: () => false });
  await assert.rejects(() => s.sign('atlas/1/a.png'), /off/);
  await assert.rejects(() => s.putFile('atlas/1/a.png', blob()), /off/);
  await assert.rejects(() => s.uploadAtlasImage({ patientId: 1, blob: blob() }), /off/);
});

test('upload goes to the private bucket, never overwrites, returns path not url', async () => {
  const c = fake();
  const s = createPrivateStorage({ client: c, enabled: on, newId: () => 'aaaa1111' });
  const img = await s.uploadAtlasImage({ patientId: 12, blob: blob(), thumbBlob: blob('image/jpeg') });
  assert.equal(img.path, 'atlas/12/aaaa1111.png');
  assert.equal(img.thumbPath, 'atlas/12/aaaa1111-t.jpg');
  assert.equal(img.bucket, PRIVATE_BUCKET);
  assert.equal(img.provider, 'supabase');
  assert.ok(!('url' in img));
  assert.ok(c.calls.bucket.every(b => b === PRIVATE_BUCKET));
  assert.ok(c.calls.upload.every(([, o]) => o.upsert === false));
  assert.equal(img.sha256.length, 64);
});

test('bad type, big file, bad patient id and traversal paths are rejected before any network call', async () => {
  const c = fake();
  const s = createPrivateStorage({ client: c, enabled: on, newId: () => 'aaaa1111' });
  await assert.rejects(() => s.uploadAtlasImage({ patientId: 1, blob: blob('image/gif') }), /type/);
  await assert.rejects(() => s.putFile('atlas/1/a.png', blob('image/png', 11 * 1024 * 1024)), /large/);
  await assert.rejects(() => s.uploadAtlasImage({ patientId: '1/../2', blob: blob() }));
  await assert.rejects(() => s.sign('../etc/passwd'), /bad path/);
  assert.equal(c.calls.upload.length, 0);
});

test('a failed thumbnail never blocks the drawing; a failed main upload does', async () => {
  const c = fake();
  let n = 0;
  c.storage.from = () => ({ upload: async () => (++n === 2 ? { error: { message: 'x' } } : { error: null }) });
  const s = createPrivateStorage({ client: c, enabled: on, newId: () => 'aaaa1111' });
  const img = await s.uploadAtlasImage({ patientId: 1, blob: blob(), thumbBlob: blob() });
  assert.equal(img.thumbPath, '');
  const s2 = createPrivateStorage({ client: fake({ uploadError: { message: 'denied' } }), enabled: on });
  await assert.rejects(() => s2.uploadAtlasImage({ patientId: 1, blob: blob() }), /denied/);
});

test('signed url resolver is used for private supabase files, public files are untouched', async () => {
  const c = fake();
  const s = createPrivateStorage({ client: c, enabled: on });
  const cache = createSignedUrlCache({ sign: s.sign });
  registerUrlResolver('supabase', makeSupabaseResolver(cache));
  const priv = normalizeFileMeta({ key: 'atlas/1/a.png' }, 'supabase'); priv.access = 'private';
  assert.match(await resolveFileUrl(priv), /^https:\/\/x\/atlas\/1\/a\.png/);
  await resolveFileUrl(priv);
  assert.equal(c.calls.sign.length, 1); // cached
  const old = normalizeFileMeta({ src: 'https://res.cloudinary.com/x/y.jpg', public_id: 'y' });
  assert.equal(await resolveFileUrl(old), 'https://res.cloudinary.com/x/y.jpg'); // legacy files unchanged
  await assert.rejects(() => createPrivateStorage({ client: fake({ signError: { message: 'nope' } }), enabled: on }).sign('atlas/1/a.png'), /nope/);
});
