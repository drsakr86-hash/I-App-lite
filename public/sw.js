// I App — Service Worker
//
// BUILD and PRECACHE are stamped at build time by the vite plugin in vite.config.js (dist/sw.js), so every deploy ships a
// byte-different worker that is installed and activated as ONE consistent set:
//   index.html + every hashed js/css chunk of THAT build are precached together under the cache "iapp-shell-<BUILD>".
//   If any file of the set cannot be fetched, the install FAILS and the previous worker + cache stay in charge
//   (a half-filled cache is exactly what produced "Failed to fetch dynamically imported module").
// The previous shell cache is kept for one more generation so a tab that is still running the old build can keep loading
// its own chunks; older ones are deleted.
const BUILD = "__BUILD_ID__";
const PRECACHE = /*__PRECACHE_LIST__*/ [];
const IMG_VERSION = "iapp-v13-20261004"; // image/font caches are independent of the build: they survive deploys
const SHELL_PREFIX = "iapp-shell-";
const SHELL = SHELL_PREFIX + BUILD;
const IMGS = "iapp-img-" + IMG_VERSION;
const FONTS = "iapp-font-" + IMG_VERSION;
const MAX_IMGS = 150;

async function precacheAll(cache) {
  const urls = ["./", "./index.html", "./queue-display.html", ...PRECACHE];
  const unique = [...new Set(urls)];
  // "reload": bypass the HTTP cache so the files are the ones of this deploy, not a stale CDN/browser copy.
  await Promise.all(unique.map(async u => {
    const res = await fetch(new Request(u, { cache: "reload" }));
    if (!res || !res.ok) throw new Error("precache failed: " + u + " " + (res && res.status));
    await cache.put(u, res);
  }));
}

self.addEventListener("install", event => {
  // No catch: a failed precache rejects the install; the browser keeps the old worker and retries on the next update check.
  event.waitUntil(caches.open(SHELL).then(precacheAll).then(() => self.skipWaiting()));
});

// Sign-out: the page asks the worker to drop cached medical images so they are not
// left readable on a shared device.
self.addEventListener("message", event => {
  if (event.data && event.data.type === "iapp-clear-image-cache") {
    event.waitUntil(caches.delete(IMGS));
  }
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(async keys => {
      const shells = keys.filter(k => k.startsWith(SHELL_PREFIX));          // oldest first
      const keep = new Set([SHELL, ...shells.filter(k => k !== SHELL).slice(-1), IMGS, FONTS]);
      await Promise.all(keys.filter(k => !keep.has(k)).map(k => caches.delete(k)));
    }).then(() => self.clients.claim())
  );
});

async function trim(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  for (let i = 0; i < Math.max(0, keys.length - max); i++) await cache.delete(keys[i]);
}

// Pages: network first (always the newest index.html, which names the newest chunks). The HTML is NEVER written into
// the cache here — the cached index.html must stay the one that belongs to the cached chunks. Offline / slow network →
// the precached index.html of this worker's build (its chunks are in the same cache).
async function pageHandler(request) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const response = await fetch(request, { signal: controller.signal, cache: "no-cache" });
    clearTimeout(timer);
    if (response && response.ok) return response;
  } catch (_) { /* fall through to the cache */ }
  const cache = await caches.open(SHELL);
  return (await cache.match("./index.html")) ||
         (await cache.match("./")) ||
         new Response("لا يوجد اتصال ولم يتم تخزين التطبيق بعد.", { status: 503 });
}

// Hashed build files are immutable: cache first (this build, then the previous one), else network and remember it.
// A missing file stays missing (the 404 is returned as is) — it is never answered with index.html.
async function assetHandler(request) {
  const hit = await caches.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response && response.ok) {
    const copy = response.clone();
    caches.open(SHELL).then(c => c.put(request, copy)).catch(() => {});
  }
  return response;
}

// Other same-origin files (queue display, icons): network first, cache as a fallback.
async function otherHandler(request) {
  try {
    const response = await fetch(request, { cache: "no-cache" });
    if (response && response.ok) { const copy = response.clone(); caches.open(SHELL).then(c => c.put(request, copy)).catch(() => {}); }
    return response;
  } catch (e) {
    const hit = await caches.match(request);
    if (hit) return hit;
    throw e;
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
    if (/\/assets\/[^/]+\.(js|css)$/.test(url.pathname)) { event.respondWith(assetHandler(request)); return; }
    event.respondWith(otherHandler(request));
  }
});
