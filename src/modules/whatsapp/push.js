// Browser side of Web Push for "a WhatsApp chat is waiting". The key comes from the server (RPC, staff only); the subscription is stored by RPC.
// No Meta credentials and no private keys exist here. iPhone: only works from the app added to the Home Screen (iOS 16.4+).
import { rpc } from './service.js';

const b64uToBytes = s => { const p = String(s).replace(/-/g, '+').replace(/_/g, '/'); const b = atob(p.padEnd(Math.ceil(p.length / 4) * 4, '=')); return Uint8Array.from(b, c => c.charCodeAt(0)); };

export const pushSupported = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
export const isIos = () => typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent || '');
export const isStandalone = () => { try { return !!(window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true; } catch { return false; } };
// 'unsupported' | 'needs-install' (iPhone, not on Home Screen) | 'denied' | 'on' | 'off'
export async function pushStatus() {
  if (!pushSupported()) return isIos() && !isStandalone() ? 'needs-install' : 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  try { const reg = await navigator.serviceWorker.ready; return (await reg.pushManager.getSubscription()) && Notification.permission === 'granted' ? 'on' : 'off'; } catch { return 'off'; }
}
export async function enablePush() {
  const key = await rpc('wa_push_public_key', {});
  if (!key) throw new Error('push-not-configured');
  if ((await Notification.requestPermission()) !== 'granted') throw new Error('permission-denied');
  const reg = await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uToBytes(key) });
  const j = sub.toJSON();
  await rpc('wa_push_subscribe', { p_endpoint: j.endpoint, p_p256dh: j.keys && j.keys.p256dh, p_auth: j.keys && j.keys.auth });
}
export async function disablePush() {
  const reg = await navigator.serviceWorker.ready; const sub = await reg.pushManager.getSubscription();
  if (sub) { try { await rpc('wa_push_unsubscribe', { p_endpoint: sub.endpoint }); } finally { await sub.unsubscribe(); } }
}
