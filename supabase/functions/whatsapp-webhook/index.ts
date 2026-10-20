// @ts-nocheck  (Deno runtime; logic lives in ../_shared/handlers.js and is unit-tested in Node)
import { handleVerify, handleWebhook } from '../_shared/handlers.js';
import { env, makeStore, log, kickWorker } from '../_shared/runtime.js';

Deno.serve(async (req) => {
  const reply = (r) => new Response(r.text ? r.body : JSON.stringify(r.body), { status: r.status, headers: { 'content-type': r.text ? 'text/plain' : 'application/json' } });
  if (req.method === 'GET') {
    const q = Object.fromEntries(new URL(req.url).searchParams);
    return reply(handleVerify(q, { META_VERIFY_TOKEN: env('META_VERIFY_TOKEN') }));
  }
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });
  const rawBody = await req.text();            // raw bytes: the signature is computed over exactly this
  return reply(await handleWebhook({ rawBody, signature: req.headers.get('x-hub-signature-256'), env: { META_APP_SECRET: env('META_APP_SECRET') }, store: makeStore(), kickWorker, log }));
});
