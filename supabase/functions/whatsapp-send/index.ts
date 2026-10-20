// @ts-nocheck
// Manual reply from the secretary inbox. The browser sends the staff member's Supabase JWT; the role is re-checked server-side.
import { handleStaffSend } from '../_shared/handlers.js';
import { serviceClient, makeStore, kickWorker } from '../_shared/runtime.js';

const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type, apikey', 'access-control-allow-methods': 'POST, OPTIONS' };
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405, headers: cors });
  const jwt = (req.headers.get('authorization') || '').replace(/^Bearer /i, '');
  const { data } = await serviceClient().auth.getUser(jwt);
  let body = null; try { body = await req.json(); } catch { /* invalid */ }
  const r = await handleStaffSend({ user: data && data.user, body, store: makeStore(), kickWorker });
  return new Response(JSON.stringify(r.body), { status: r.status, headers: { ...cors, 'content-type': 'application/json' } });
});
