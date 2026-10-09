// Verifies a DEPLOYED site is one consistent build: index.html, its assets, precache.json and sw.js (same build id and
// the same file list); every file answers 200 with a non-HTML body (a 404 page served as HTML is a failure).
// Usage: node scripts/verify-live.mjs <site-url> [attempts]   (retries while the CDN propagates)
const base = (process.argv[2] || '').replace(/\/?$/, '/');
const attempts = Number(process.argv[3]) || 8;
if (!/^https?:\/\//.test(base)) { console.error('usage: node scripts/verify-live.mjs <site-url>'); process.exit(2); }

const get = async (path, bust) => fetch(new URL(path, base) + (bust ? '?cb=' + Date.now() : ''), { cache: 'no-store' });

async function check() {
  const errors = [];
  const home = await get('index.html', true);
  if (!home.ok) return ['index.html -> ' + home.status];
  const html = await home.text();
  const referenced = [...html.matchAll(/(?:src|href)="(\.\/assets\/[^"]+)"/g)].map(m => m[1]);
  if (!referenced.length) errors.push('index.html references no assets');
  const pre = await get('precache.json', true);
  const manifest = pre.ok ? await pre.json() : null;
  if (!manifest) errors.push('precache.json -> ' + pre.status);
  const sw = await get('sw.js', true);
  const swText = sw.ok ? await sw.text() : '';
  if (!sw.ok) errors.push('sw.js -> ' + sw.status);
  const id = (/const BUILD = "([^"]+)"/.exec(swText) || [])[1];
  if (!id || id === '__BUILD_ID__') errors.push('sw.js has no stamped build id');
  const m = /const PRECACHE = (\[.*?\]);/.exec(swText);
  const swList = m ? JSON.parse(m[1]) : null;
  if (manifest && swList && JSON.stringify([...manifest].sort()) !== JSON.stringify([...swList].sort())) errors.push('sw.js list differs from precache.json');
  if (manifest) for (const r of referenced) if (!manifest.includes(r)) errors.push('precache.json lacks ' + r);
  for (const f of new Set([...(manifest || []), ...referenced])) {
    const r = await get(f);
    const type = r.headers.get('content-type') || '';
    if (!r.ok) errors.push(f + ' -> ' + r.status);
    else if (/text\/html/.test(type)) errors.push(f + ' answered with HTML');
  }
  if (!errors.length) console.log('live site consistent: build ' + id + ', ' + (manifest || []).length + ' assets, index.html -> ' + referenced.join(', '));
  return errors;
}

let last = [];
for (let i = 1; i <= attempts; i++) {
  try { last = await check(); } catch (e) { last = ['request failed: ' + e.message]; }
  if (!last.length) process.exit(0);
  console.warn('attempt ' + i + '/' + attempts + ' not consistent yet:\n - ' + last.join('\n - '));
  if (i < attempts) await new Promise(r => setTimeout(r, 15000));
}
console.error('LIVE SITE INCONSISTENT');
process.exit(1);
