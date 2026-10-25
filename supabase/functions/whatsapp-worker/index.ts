// @ts-nocheck
import { runWorker } from '../_shared/handlers.js';
import { safeEqual } from '../_shared/signature.js';
import { notifyWaiting } from '../_shared/push.js';
import { env, makeStore, makeMeta, makeLlm, log } from '../_shared/runtime.js';

// Called by pg_cron (docs/sql/whatsapp-cron.sql) and by the webhook; both present the shared WORKER_SECRET.
Deno.serve(async (req) => {
  const secret = env('WORKER_SECRET');
  if (!secret || !safeEqual(req.headers.get('x-worker-secret') || '', secret)) return new Response('unauthorized', { status: 401 });
  try {
    const store = makeStore();
    const out = await runWorker({ store, meta: makeMeta(), llm: makeLlm(), log });
    await notifyWaiting({ store, privateKey: env('VAPID_PRIVATE_KEY'), subject: env('VAPID_SUBJECT') || undefined, log });   // closed-app alert for chats waiting for staff; never throws
    return new Response(JSON.stringify(out), { headers: { 'content-type': 'application/json' } });
  } catch (e) { log('worker_error', { err: String(e && e.message || e).slice(0, 200) }); return new Response('error', { status: 500 }); }
});
