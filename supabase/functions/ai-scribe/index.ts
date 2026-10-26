// @ts-nocheck
// AI scribe: the doctor's recording of a visit -> draft fields of the general exam sheet. The browser sends the staff JWT;
// the admin role is re-checked server-side. The audio goes to Gemini and is not stored; logs carry no clinical text.
import { handleScribe } from '../_shared/scribe.js';
import { createGeminiClient } from '../_shared/gemini.js';
import { serviceClient, makeStore, env, log } from '../_shared/runtime.js';

const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type, apikey', 'access-control-allow-methods': 'POST, OPTIONS' };
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405, headers: cors });
  const jwt = (req.headers.get('authorization') || '').replace(/^Bearer /i, '');
  const { data } = await serviceClient().auth.getUser(jwt);
  let body = null; try { body = await req.json(); } catch { /* invalid */ }
  const gemini = env('GEMINI_API_KEY') ? createGeminiClient({ apiKey: env('GEMINI_API_KEY'), model: env('GEMINI_MODEL') || undefined }) : null;
  const started = Date.now();
  const r = await handleScribe({ user: data && data.user, body, store: makeStore(), gemini });
  log('ai_scribe', { status: r.status, ms: Date.now() - started, fields: r.body && r.body.fields ? Object.keys(r.body.fields).length : 0, error: r.body && r.body.error, detail: r.body && r.body.detail });
  if (r.body) delete r.body.detail;
  return new Response(JSON.stringify(r.body), { status: r.status, headers: { ...cors, 'content-type': 'application/json' } });
});
