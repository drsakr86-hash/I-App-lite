// @ts-nocheck
// Suggested reply for the secretary inbox (draft only). The browser sends the staff JWT; the role is re-checked server-side.
// The conversation text goes to Anthropic (same as the WhatsApp assistant); logs carry ids and status only.
import { handleSuggest } from '../_shared/suggest.js';
import { serviceClient, makeStore, makeLlm, log } from '../_shared/runtime.js';

const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type, apikey', 'access-control-allow-methods': 'POST, OPTIONS' };
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405, headers: cors });
  const jwt = (req.headers.get('authorization') || '').replace(/^Bearer /i, '');
  const { data } = await serviceClient().auth.getUser(jwt);
  let body = null; try { body = await req.json(); } catch { /* invalid */ }
  const started = Date.now();
  const r = await handleSuggest({ user: data && data.user, body, store: makeStore(), llm: makeLlm() });
  log('wa_suggest', { action: body && body.action, status: r.status, ms: Date.now() - started, error: r.body && r.body.error, detail: r.body && r.body.detail });
  if (r.body) delete r.body.detail;
  return new Response(JSON.stringify(r.body), { status: r.status, headers: { ...cors, 'content-type': 'application/json' } });
});
