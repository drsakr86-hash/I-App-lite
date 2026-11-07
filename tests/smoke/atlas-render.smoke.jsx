// Render smoke test: mounts the real AtlasScreen, opens every plate, selects every part, uses every tool and checks the DOM.
// Run with:  npm run test:smoke:atlas
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
const store = new Map();
globalThis.localStorage = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.window = globalThis.window || {};
globalThis.window.confirm = () => true;
const { default: AtlasScreen } = await import('../../src/screens/AtlasScreen.jsx');
const { PLATES } = await import('../../src/modules/atlas/plates/index.js');
const { setLang } = await import('../../src/modules/i18n/index.js');

let failed = 0;
const ok = (c, m) => { if (!c) { failed++; console.error('FAIL: ' + m); } };
const json = r => JSON.stringify(r.toJSON());
for (const lang of ['ar', 'en']) {
  setLang(lang);
  let r;
  await act(async () => { r = TestRenderer.create(<AtlasScreen showLibrary />); });
  const tabs = r.root.findAll(n => n.props.role === 'tab');
  ok(tabs.length === PLATES.length, `${lang}: ${PLATES.length} plate tabs`);
  for (let i = 0; i < tabs.length; i++) {
    await act(async () => { r.root.findAll(n => n.props.role === 'tab')[i].props.onClick(); });
    const parts = r.root.findAll(n => n.props['data-part'] && n.props.className === 'atlas-part');
    ok(parts.length === PLATES[i].parts.length, `${lang}/${PLATES[i].id}: ${parts.length} selectable parts`);
    for (const p of parts) {
      await act(async () => { p.props.onKeyDown({ key: 'Enter', preventDefault() {} }); });
      ok(json(r).includes(p.props['aria-label']), `${lang}/${PLATES[i].id}: info panel shows ${p.props['aria-label']}`);
    }
  }
  const press = async name => { const b = r.root.findAll(n => n.type === 'button' && n.props.children === name)[0]; ok(!!b, `${lang}: button ${name}`); if (b) await act(async () => { b.props.onClick(); }); };
  await press('＋'); await press('－');
  await act(async () => { r.root.findAll(n => n.props.role === 'tab')[0].props.onClick(); });
  const search = r.root.findByProps({ 'aria-label': lang === 'ar' ? 'ابحث عن بنية (مثلاً: شبكية، macula)' : 'Search a structure (e.g. retina, macula)' });
  await act(async () => { search.props.onChange({ target: { value: lang === 'ar' ? 'القرنية' : 'cornea' } }); });
  ok(json(r).includes(lang === 'ar' ? 'القرنية' : 'Cornea'), `${lang}: search result listed`);
  await act(async () => { r.unmount(); });
  // default screen (library hidden): only the blank canvas, with free-drawing tools and the add-image control
  let b;
  await act(async () => { b = TestRenderer.create(<AtlasScreen />); });
  ok(b.root.findAll(n => n.props.role === 'tab').length === 0, `${lang}: blank canvas has no plate tabs`);
  ok(b.root.findAll(n => n.props['data-part']).length === 0, `${lang}: blank canvas has no structures`);
  ok(b.root.findAll(n => n.type === 'input' && n.props.type === 'file' && /image/.test(n.props.accept || '')).length === 1, `${lang}: add-image file input`);
  ok(json(b).includes(lang === 'ar' ? 'إضافة صورة' : 'Add image'), `${lang}: add-image button text`);
  ok(b.root.findAll(n => n.type === 'svg').length === 1, `${lang}: one drawing surface`);
  await act(async () => { b.unmount(); });
}
if (failed) { console.error(failed + ' smoke check(s) failed'); process.exit(1); }
console.log('atlas render smoke: ok');
process.exit(0);
