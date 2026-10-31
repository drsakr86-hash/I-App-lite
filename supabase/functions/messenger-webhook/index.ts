// @ts-nocheck  (Deno runtime; logic lives in ../_shared/handlers.js and is unit-tested in Node)
// Facebook Messenger + Instagram Direct webhook. Same Meta app as WhatsApp: same verify token and app secret (HMAC signature).
import { handleVerify, handleMessengerWebhook } from '../_shared/handlers.js';
import { env, makeStore, log, kickWorker } from '../_shared/runtime.js';

Deno.serve(async (req) => {
  const reply = (r) => new Response(r.text ? r.body : JSON.stringify(r.body), { status: r.status, headers: { 'content-type': r.text ? 'text/plain' : 'application/json' } });
  if (req.method === 'GET') {
    const q = Object.fromEntries(new URL(req.url).searchParams);
    return reply(handleVerify(q, { META_VERIFY_TOKEN: env('META_VERIFY_TOKEN') }));
  }
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });
  const rawBody = await req.text();
  return reply(await handleMessengerWebhook({ rawBody, signature: req.headers.get('x-hub-signature-256'), env: { META_APP_SECRET: env('META_APP_SECRET'), META_APP_ID: env('META_APP_ID') }, store: makeStore(), kickWorker, log }));
});
