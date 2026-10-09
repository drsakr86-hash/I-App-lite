// Verifies that dist/ is ONE consistent build: index.html, every js/css file, precache.json and sw.js agree.
// Usage: node scripts/verify-dist.mjs [dist-dir]      (exit 1 on any inconsistency)
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2] || 'dist';
const errors = [];
const read = f => readFileSync(join(dir, f), 'utf8');
const assets = existsSync(join(dir, 'assets')) ? readdirSync(join(dir, 'assets')).filter(f => /\.(js|css)$/.test(f)).map(f => './assets/' + f).sort() : [];

const html = read('index.html');
const referenced = [...html.matchAll(/(?:src|href)="(\.\/assets\/[^"]+)"/g)].map(m => m[1]);
if (!referenced.length) errors.push('index.html references no assets');
for (const r of referenced) if (!existsSync(join(dir, r))) errors.push('index.html references a missing file: ' + r);

const manifest = JSON.parse(read('precache.json')).slice().sort();
if (JSON.stringify(manifest) !== JSON.stringify(assets)) errors.push('precache.json differs from the emitted assets');
for (const r of referenced) if (!manifest.includes(r)) errors.push('precache.json lacks ' + r);

const sw = read('sw.js');
const id = (/const BUILD = "([^"]+)"/.exec(sw) || [])[1];
if (!id || id === '__BUILD_ID__' || id === 'dev') errors.push('sw.js has no build id');
if (sw.includes('__PRECACHE_LIST__') || sw.includes('__BUILD_ID__')) errors.push('sw.js still has placeholders');
const m = /const PRECACHE = (\[.*?\]);/.exec(sw);
const swList = m ? JSON.parse(m[1]).slice().sort() : null;
if (!swList) errors.push('sw.js has no precache list');
else if (JSON.stringify(swList) !== JSON.stringify(assets)) errors.push('sw.js precache list differs from the emitted assets');

// every static import ("./Foo-hash.js") inside a chunk must exist too
for (const a of assets.filter(f => f.endsWith('.js'))) {
  const src = read(a.slice(2));
  for (const mm of src.matchAll(/["']\.\/([\w.-]+-[\w-]{8}\.(?:js|css))["']/g)) if (!existsSync(join(dir, 'assets', mm[1]))) errors.push(a + ' imports a missing chunk ./' + mm[1]);
}

if (errors.length) { console.error('dist is INCONSISTENT:\n - ' + errors.join('\n - ')); process.exit(1); }
console.log('dist consistent: build ' + id + ', ' + assets.length + ' assets, index.html -> ' + referenced.join(', '));
