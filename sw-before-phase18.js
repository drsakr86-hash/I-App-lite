// I App — Service Worker: يخلّي التطبيق يفتح بدون إنترنت.
// الصفحة نفسها (index.html) فيها كل المكتبات مضمّنة، فيكفي تخزينها.
const VERSION = "iapp-v3-20260925";
const SHELL = "iapp-shell-" + VERSION;
const IMGS = "iapp-img-" + VERSION;
const FONTS = "iapp-font-" + VERSION;
const MAX_IMGS = 150;

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(SHELL).then(c => c.addAll(["./", "./index.html"])).catch(() => {}).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== SHELL && k !== IMGS && k !== FONTS).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function trim(cacheName, max) {
  const c = await caches.open(cacheName);
  const keys = await c.keys();
  for (let i = 0; i < keys.length - max; i++) await c.delete(keys[i]);
}

// الصفحة: الشبكة أولاً (عشان التحديثات توصل)، ولو فشلت أو تأخرت نستخدم النسخة المخزّنة
async function pageHandler(req) {
  const cache = await caches.open(SHELL);
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch(req, { signal: ctrl.signal });
    clearTimeout(t);
    if (res && res.ok) cache.put("./index.html", res.clone());
    return res;
  } catch (_) {
    return (await cache.match(req, { ignoreSearch: true })) ||
           (await cache.match("./index.html")) ||
           (await cache.match("./")) ||
           new Response("لا يوجد اتصال ولم يتم تخزين التطبيق بعد. افتحه مرة واحدة بالإنترنت.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
}

// صور الإشعاعات (Cloudinary): من الكاش أولاً ثم نحدّث في الخلفية
async function imageHandler(req) {
  const cache = await caches.open(IMGS);
  const hit = await cache.match(req);
  const net = fetch(req).then(res => {
    if (res && (res.ok || res.type === "opaque")) { cache.put(req, res.clone()).then(() => trim(IMGS, MAX_IMGS)); }
    return res;
  }).catch(() => null);
  return hit || (await net) || Response.error();
}

// الخطوط (Google Fonts): من الكاش أولاً ثم نحدّث في الخلفية
async function fontHandler(req) {
  const cache = await caches.open(FONTS);
  const hit = await cache.match(req);
  const net = fetch(req).then(res => { if (res && (res.ok || res.type === "opaque")) cache.put(req, res.clone()); return res; }).catch(() => null);
  return hit || (await net) || Response.error();
}

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  if (url.hostname.endsWith("supabase.co")) return;                 // بيانات: لا تُخزَّن أبداً
  if (url.hostname === "api.cloudinary.com") return;                // رفع
  if (url.hostname.endsWith("cloudinary.com")) { e.respondWith(imageHandler(req)); return; }
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") { e.respondWith(fontHandler(req)); return; }

  if (url.origin === self.location.origin) {
    if (req.mode === "navigate") { e.respondWith(pageHandler(req)); return; }
    e.respondWith(
      caches.open(SHELL).then(async cache => {
        const hit = await cache.match(req);
        const net = fetch(req).then(res => { if (res && res.ok) cache.put(req, res.clone()); return res; }).catch(() => null);
        return hit || (await net) || Response.error();
      })
    );
  }
});
