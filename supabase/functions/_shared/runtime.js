// Wiring shared by the three Edge Functions (Deno). Secrets come only from Edge Function secrets (Deno.env) - never from the repo.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { createStore } from './store.js';
import { createMetaClient } from './meta.js';
import { createAnthropicClient } from './llm.js';

export const env = k => Deno.env.get(k) || '';
export const serviceClient = () => createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
export const makeStore = () => createStore(serviceClient());
export const makeMeta = () => env('META_ACCESS_TOKEN') && env('META_PHONE_NUMBER_ID') ? createMetaClient({ token: env("META_ACCESS_TOKEN"), phoneNumberId: env("META_PHONE_NUMBER_ID"), version: env('META_GRAPH_VERSION') || undefined }) : null;
export const makeLlm = () => env('ANTHROPIC_API_KEY') ? createAnthropicClient({ apiKey: env('ANTHROPIC_API_KEY'), model: env('ANTHROPIC_MODEL') || undefined }) : null;
// Logs carry ids and error classes only - never message text, names or phone numbers.
export const log = (event, data) => console.log(JSON.stringify({ event, ...data }));
// Fire-and-forget call to the worker so a reply does not wait for the next cron tick (the cron run is the safety net).
export function kickWorker() {
  const p = fetch(env('SUPABASE_URL') + '/functions/v1/whatsapp-worker', { method: 'POST', headers: { 'x-worker-secret': env('WORKER_SECRET') } }).catch(() => {});
  try { (globalThis.EdgeRuntime && EdgeRuntime.waitUntil) ? EdgeRuntime.waitUntil(p) : void p; } catch { /* ignore */ }
}
