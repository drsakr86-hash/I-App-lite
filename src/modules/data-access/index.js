// A couple of small, self-contained data-access helpers moved out of
// public/legacy/app-runtime.js (Phase 8, batch 4): getSB (the lazily-cached
// Supabase client getter) and iappRpc (the RPC wrapper). The legacy runtime
// now delegates to this module (see the "const { getSB, iappRpc } =
// window.IAppModules.db;" line there) instead of redefining them.
//
// Exact copies of the legacy originals, with `window.*` reads changed to
// `globalThis.*` so this loads safely outside a browser too (e.g. under
// node:test) — same as src/modules/theme/index.js. In a browser window IS
// globalThis, so behavior is identical.
//
// getSB() almost always returns the one shared client src/services/
// supabase.js's getSupabaseClient() already created and stored at
// globalThis.__IAppSupabaseClient (set up in main.jsx before the legacy
// script loads) — the `globalThis.supabase.createClient(...)` branch below
// is the legacy fallback for if that singleton were ever missing, kept
// exactly as-is even though it is not expected to run in practice.
const SB_URL = 'https://mofdveiwlaymlabvsypu.supabase.co';
const SB_KEY = 'sb_publishable_tVZ1mUOyb3vOjRV1jBpq6g_P2u-xIqF';

let _sb = null;

export function getSB() {
  if (_sb) return _sb;
  if (globalThis.__IAppSupabaseClient) {
    _sb = globalThis.__IAppSupabaseClient;
  } else if (globalThis.supabase) {
    _sb = globalThis.supabase.createClient(SB_URL, SB_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: 'iapp_sb_auth' }
    });
  }
  return _sb;
}

// Phase 48-52 (legacy): all Supabase RPC calls go through the shared service
// layer (timeout, in-flight dedupe for writes) at globalThis.IAppModules.rpc.
// Always resolves to { data, error }.
export function iappRpc(sb, name, args) {
  return globalThis.IAppModules.rpc.safe(sb, name, args);
}
