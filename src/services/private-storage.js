// Phase 2 / G3: private clinical file storage (Supabase bucket `clinical-private`) with signed URLs.
// Behind the `private_storage` flag; nothing calls this yet and the existing Cloudinary upload paths are untouched.
// Only a storage PATH is ever saved in a record; a short-lived URL is created when the file is opened.
// The Supabase client is injected, so everything here runs in tests with a fake client.
import { drawingPath, pathKind } from '../modules/atlas/drawings.js';
import { createSignedUrlCache, makeSupabaseResolver, DEFAULT_TTL_S } from '../modules/atlas/signed-urls.js';
import { registerUrlResolver, STORAGE_PROVIDERS } from './storage.js';
import { isEnabled } from '../modules/feature-flags/index.js';

export const PRIVATE_BUCKET = 'clinical-private';
export const MAX_PRIVATE_BYTES = 10 * 1024 * 1024; // same cap as the bucket
export const PRIVATE_MIMES = Object.freeze({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' });

export const privateStorageEnabled = () => isEnabled('private_storage');

async function sha256Hex(blob) {
  try {
    const buf = await blob.arrayBuffer();
    const d = await globalThis.crypto.subtle.digest('SHA-256', buf);
    return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('');
  } catch { return ''; }
}

export function createPrivateStorage({ client, bucket = PRIVATE_BUCKET, enabled = privateStorageEnabled, newId = () => globalThis.crypto.randomUUID() } = {}) {
  if (!client || !client.storage) throw new Error('client required');
  const bkt = () => client.storage.from(bucket);
  const guard = () => { if (!enabled()) throw new Error('private storage is off'); };

  async function sign(path, ttl = DEFAULT_TTL_S) {
    guard();
    if (!pathKind(path)) throw new Error('bad path');
    const { data, error } = await bkt().createSignedUrl(path, ttl);
    if (error || !data || !data.signedUrl) throw new Error((error && error.message) || 'sign failed');
    return { url: data.signedUrl };
  }

  // Upload one file. Never overwrites (upsert false): a changed drawing is a new file/version.
  async function putFile(path, blob) {
    guard();
    if (!blob) throw new Error('file required');
    const mime = blob.type;
    if (!PRIVATE_MIMES[mime]) throw new Error('type not allowed');
    if (blob.size > MAX_PRIVATE_BYTES) throw new Error('file too large');
    const { error } = await bkt().upload(path, blob, { contentType: mime, upsert: false, cacheControl: '3600' });
    if (error) throw new Error(error.message || 'upload failed');
    return { provider: STORAGE_PROVIDERS.SUPABASE, bucket, path, bytes: blob.size, mime, sha256: await sha256Hex(blob) };
  }

  // An atlas drawing image (+ optional thumbnail). Returns the `image` object stored in the drawing record.
  async function uploadAtlasImage({ patientId, blob, thumbBlob = null, id = newId() }) {
    guard();
    const ext = PRIVATE_MIMES[blob && blob.type];
    if (!ext) throw new Error('type not allowed');
    const path = drawingPath('atlas', patientId, id, ext);
    const main = await putFile(path, blob);
    let thumbPath = '';
    if (thumbBlob) {
      const tExt = PRIVATE_MIMES[thumbBlob.type];
      if (!tExt) throw new Error('type not allowed');
      thumbPath = drawingPath('atlas', patientId, id + '-t', tExt);
      try { await putFile(thumbPath, thumbBlob); } catch { thumbPath = ''; } // a missing thumbnail never blocks the drawing
    }
    return { ...main, thumbPath };
  }

  return { sign, putFile, uploadAtlasImage, bucket };
}

// Wire the signed-URL renewal for files whose provider is `supabase`. Called once, only when the flag is on.
export function enablePrivateStorage({ client, ...opts } = {}) {
  if (!privateStorageEnabled()) return null;
  const store = createPrivateStorage({ client, ...opts });
  const cache = createSignedUrlCache({ sign: store.sign });
  registerUrlResolver(STORAGE_PROVIDERS.SUPABASE, makeSupabaseResolver(cache));
  return { store, cache };
}
