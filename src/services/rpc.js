const DEFAULT_TIMEOUT_MS = 6000;
const inflight = new Map();

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timeout`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function isTransient(error) {
  const msg = String(error?.message || '');
  return /timeout|network|fetch|failed to fetch|503|502|504/i.test(msg);
}

function stableKey(name, args) {
  try { return name + ':' + JSON.stringify(args); } catch { return null; }
}

/**
 * options:
 *  timeoutMs  - per-attempt timeout (default 6000)
 *  retries    - extra attempts for transient errors (default 0). Never use
 *               retries on non-idempotent clinical writes.
 *  dedupe     - share one in-flight request between identical concurrent calls
 *               (blocks double-tap duplicate writes)
 */
export async function rpc(client, functionName, args = {}, options = {}) {
  if (!client) throw new Error('Supabase client is required');
  const timeoutMs = Number(options.timeoutMs || DEFAULT_TIMEOUT_MS);
  const retries = Number(options.retries || 0);

  const run = async () => {
    let lastError;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const result = await withTimeout(client.rpc(functionName, args), timeoutMs, functionName);
        if (result.error) throw result.error;
        return result.data;
      } catch (error) {
        lastError = error;
        if (attempt === retries || !isTransient(error)) break;
        await new Promise(r => setTimeout(r, 300 * (attempt + 1)));
      }
    }
    throw lastError;
  };

  if (!options.dedupe) return run();
  const key = stableKey(functionName, args);
  if (!key) return run();
  if (inflight.has(key)) return inflight.get(key);
  const p = run().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

export function rpcError(error, fallback = 'Supabase request failed') {
  return error?.message || error?.hint || error?.details || fallback;
}

const WRITE_RE = /_(create|sync|complete|update|delete|save)_/;

// Supabase-style wrapper for the legacy runtime: never throws, always
// resolves to { data, error }. Writes get a longer timeout and in-flight
// dedupe (no automatic retry); reads get a short timeout and one retry.
export async function rpcSafe(client, functionName, args = {}, options = {}) {
  const isWrite = WRITE_RE.test(functionName);
  const opts = {
    timeoutMs: isWrite ? 20000 : 6000,
    retries: isWrite ? 0 : 1,
    dedupe: isWrite,
    ...options
  };
  try {
    const data = await rpc(client, functionName, args, opts);
    return { data, error: null };
  } catch (error) {
    return { data: null, error };
  }
}
