import { defineConfig } from 'vite';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

// Relative base so the build works from any sub-path
// (e.g. https://<user>.github.io/<repo>/) as well as from a root domain.
//
// One build = one consistent set. This plugin
//   1. writes dist/precache.json (every emitted js/css asset; code-split chunks are not referenced by index.html),
//   2. derives a BUILD id from the emitted file names (content-hashed) + index.html, and
//   3. stamps that id and the exact precache list into dist/sw.js (public/sw.js holds placeholders),
// so index.html, the chunks, precache.json and the service worker can never come from different builds, and every
// deploy ships a byte-different worker (a worker that never changes is never updated → stale cache → missing chunks).
function precacheManifest() {
  let files = [];
  let buildId = 'dev';
  let outDir = 'dist';
  return {
    name: 'iapp-precache-manifest',
    apply: 'build',
    configResolved(cfg) { outDir = resolve(cfg.root, cfg.build.outDir); },
    generateBundle(_opts, bundle) {
      files = Object.keys(bundle).filter(f => /\.(js|css)$/.test(f)).sort().map(f => './' + f);
      const html = bundle['index.html'];
      const h = createHash('sha256');
      h.update(files.join('\n'));
      if (html && html.source) h.update(String(html.source));
      buildId = h.digest('hex').slice(0, 12);
      this.emitFile({ type: 'asset', fileName: 'precache.json', source: JSON.stringify(files) });
    },
    closeBundle() {
      const swPath = resolve(outDir, 'sw.js');
      if (!existsSync(swPath)) return;
      let sw = readFileSync(swPath, 'utf8');
      if (!sw.includes('__BUILD_ID__') || !sw.includes('/*__PRECACHE_LIST__*/ []')) throw new Error('sw.js placeholders missing');
      sw = sw.replace('"__BUILD_ID__"', JSON.stringify(buildId)).replace('/*__PRECACHE_LIST__*/ []', JSON.stringify(files));
      writeFileSync(swPath, sw);
    }
  };
}

export default defineConfig({
  base: './',
  plugins: [precacheManifest()]
});
