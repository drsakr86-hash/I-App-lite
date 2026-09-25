import { createClient } from '@supabase/supabase-js';

export function createSupabaseService(url, key) {
  if (!url || !key) throw new Error('Supabase configuration is missing');
  return createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
}
