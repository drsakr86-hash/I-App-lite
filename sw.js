// I App — Service Worker
const VERSION = "iapp-v7-20260925";
const SHELL = "iapp-shell-" + VERSION;
const IMGS = "iapp-img-" + VERSION;
const FONTS = "iapp-font-" + VERSION;
const MAX_IMGS = 150;

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(SHELL)
      .then(cache => cache.addAll(["./", "./index.html"]))
      .catch(() => {})
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== SHELL && k !== IMGS && k !== FONTS).map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

async function trim(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  for (let i = 0; i < Math.max(0, keys.length - max); i++) await cache.delete(keys[i]);
}

async function pageHandler(request) {
  const cache = await caches.open(SHELL);
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const response = await fetch(request, { signal: controller.signal });
    clearTimeout(timer);
    if (response && response.ok) await cache.put("./index.html", response.clone());
    return response;
  } catch (_) {
    return (await cache.match(request, {ignoreSearch:true})) ||
           (await cache.match("./index.html")) ||
           (await cache.match("./")) ||
           new Response("لا يوجد اتصال ولم يتم تخزين التطبيق بعد.", {status:503});
  }
}

async function imageHandler(request) {
  const cache = await caches.open(IMGS);
  const hit = await cache.match(request);
  const net = fetch(request).then(response => {
    if (response && (response.ok || response.type === "opaque")) {
      cache.put(request, response.clone()).then(() => trim(IMGS, MAX_IMGS));
    }
    return response;
  }).catch(() => null);
  return hit || (await net) || Response.error();
}

async function fontHandler(request) {
  const cache = await caches.open(FONTS);
  const hit = await cache.match(request);
  const net = fetch(request).then(response => {
    if (response && (response.ok || response.type === "opaque")) cache.put(request, response.clone());
    return response;
  }).catch(() => null);
  return hit || (await net) || Response.error();
}

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  if (url.hostname.endsWith("supabase.co")) return;
  if (url.hostname === "api.cloudinary.com") return;
  if (url.hostname.endsWith("cloudinary.com")) { event.respondWith(imageHandler(request)); return; }
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") { event.respondWith(fontHandler(request)); return; }

  if (url.origin === self.location.origin) {
    if (request.mode === "navigate") { event.respondWith(pageHandler(request)); return; }
    event.respondWith(caches.open(SHELL).then(async cache => {
      const hit = await cache.match(request);
      const net = fetch(request).then(response => {
        if (response && response.ok) cache.put(request, response.clone());
        return response;
      }).catch(() => null);
      return hit || (await net) || Response.error();
    }));
  }
});
