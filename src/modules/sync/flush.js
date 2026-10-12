import { t } from '../i18n/index.js';

// Offline-first flush of ONE dirty key: read remote, merge with the local copy,
// write back, and clear the dirty flag only if nothing changed meanwhile.
// All side effects are injected so the logic is testable without a browser.
//
// deps:
//   storage      { get, set, del }            (localStorage-like, string values)
//   dirtyPrefix, basePrefix, noCacheKeys
//   ensureAuthed () => Promise<{ok, reason?}>
//   readRemote   (key) => Promise<any | null | undefined>   undefined = read failed
//   writeRemote  (key, value) => Promise<boolean>
//   merge        (base, local, remote) => merged
//   setError     (key, message) / clearError(key) / markSynced()
//   emitChange   (key, merged)               called when the merge changed the local view
export function createFlusher(deps) {
  const {
    storage, dirtyPrefix, basePrefix, noCacheKeys = [],
    ensureAuthed, readRemote, writeRemote, merge,
    setError = () => {}, clearError = () => {}, markSynced = () => {}, emitChange = () => {}
  } = deps;
  const flushing = {};
  const MAX_CONFLICTS = 5;

  async function run(key, job) {
    let ok = false;
    let conflicts = 0;
    do {
      job.again = false;
      const stamp = storage.get(dirtyPrefix + key);
      if (!stamp) { ok = true; break; }

      let local;
      try { local = JSON.parse(storage.get(key)); }
      catch (e) { setError(key, t('g4.sync.errInvalidLocal')); break; }

      const authed = await ensureAuthed();
      if (!authed.ok) {
        ok = false;
        setError(key, authed.reason === 'network' ? t('g4.sync.errNetwork') : t('g4.sync.errSession'));
        break;
      }

      // `token` ties this read to the write below: the server can then refuse the write if the row changed in between (compare-and-swap, F-18)
      const token = {};
      const remote = await readRemote(key, token);
      if (remote === undefined) { ok = false; setError(key, t('g4.sync.errRead')); break; }

      let base = null;
      try { const b = storage.get(basePrefix + key); base = b ? JSON.parse(b) : null; } catch { /* ignore */ }

      const merged = remote === null ? local : merge(base, local, remote);
      const saved = await writeRemote(key, merged, token);
      if (saved === 'conflict') {
        // another device wrote this key after we read it: read again, merge again (bounded)
        if (++conflicts <= MAX_CONFLICTS) { job.again = true; continue; }
        ok = false; setError(key, t('g4.sync.errWrite')); break;
      }
      if (!saved) { ok = false; setError(key, t('g4.sync.errWrite')); break; }

      const mergedStr = JSON.stringify(merged);
      if (storage.get(dirtyPrefix + key) === stamp) {
        storage.del(dirtyPrefix + key);
        storage.del(basePrefix + key);
        if (noCacheKeys.includes(key)) storage.del(key); else storage.set(key, mergedStr);
        if (mergedStr !== JSON.stringify(local)) emitChange(key, merged);
        clearError(key);
        markSynced();
        ok = true;
      } else {
        // Edited again while we were writing: keep the dirty flag, move the base forward, go again.
        storage.set(basePrefix + key, mergedStr);
        job.again = true;
      }
    } while (job.again);
    return ok;
  }

  async function flushKey(key) {
    if (flushing[key]) { flushing[key].again = true; return flushing[key].p; }
    const job = { again: false };
    job.p = run(key, job);
    flushing[key] = job;
    try { return await job.p; }
    finally { if (flushing[key] === job) delete flushing[key]; }
  }

  return { flushKey, isFlushing: key => !!flushing[key] };
}
