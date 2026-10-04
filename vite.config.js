import { defineConfig } from 'vite';

// Relative base so the build works from any sub-path
// (e.g. https://<user>.github.io/<repo>/) as well as from a root domain.
//
// Code splitting (React.lazy screens) creates chunks that index.html does not reference, so the
// service worker could not precache them and a screen opened for the first time while offline
// would fail to load. This plugin writes dist/precache.json (every emitted js/css asset) and
// sw.js precaches that list too.
function precacheManifest() {
  return {
    name: 'iapp-precache-manifest',
    apply: 'build',
    generateBundle(_opts, bundle) {
      const files = Object.keys(bundle).filter(f => /\.(js|css)$/.test(f)).map(f => './' + f);
      this.emitFile({ type: 'asset', fileName: 'precache.json', source: JSON.stringify(files) });
    }
  };
}

export default defineConfig({
  base: './',
  plugins: [precacheManifest()],
  define: { __BUILD_ID__: JSON.stringify(String(Date.now())) }
});
