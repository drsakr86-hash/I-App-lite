import { createClient } from '@supabase/supabase-js';

const SB_URL = import.meta.env.VITE_SUPABASE_URL ||
  'https://mofdveiwlaymlabvsypu.supabase.co';
const SB_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'sb_publishable_tVZ1mUOyb3vOjRV1jBpq6g_P2u-xIqF';

export const SUPABASE_URL = SB_URL;

const AUTH_OPTIONS = {
  persistSession: true,
  autoRefreshToken: true,
  storageKey: 'iapp_sb_auth'
};

export function createSupabaseService(url, key) {
  if (!url || !key) throw new Error('Supabase configuration is missing');
  return createClient(url, key, { auth: { ...AUTH_OPTIONS, detectSessionInUrl: true } });
}

// Single shared client. The legacy runtime reuses this instance
// (window.__IAppSupabaseClient) so there is only one GoTrue client.
export function getSupabaseClient() {
  if (!globalThis.__IAppSupabaseClient) {
    globalThis.__IAppSupabaseClient = createClient(SB_URL, SB_KEY, { auth: AUTH_OPTIONS });
  }
  return globalThis.__IAppSupabaseClient;
}
