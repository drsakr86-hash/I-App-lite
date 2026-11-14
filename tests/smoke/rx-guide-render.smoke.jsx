// Render smoke test: mounts the real RxGuide screen, loads the guide, searches, filters, opens a card (Arabic and English).
// Run with:  npm run test:smoke:rxguide
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
const store = new Map();
globalThis.localStorage = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.window = globalThis.window || {};
const { default: RxGuide } = await import('../../src/screens/RxGuide.jsx');
const { setLang } = await import('../../src/modules/i18n/index.js');

let failed = 0;
const ok = (c, m) => { if (!c) { failed++; console.error('FAIL: ' + m); } };
const json = r => JSON.stringify(r.toJSON());
const settle = async () => { for (let i = 0; i < 5; i++) await act(async () => { await new Promise(res => setTimeout(res, 20)); }); };

for (const lang of ['ar', 'en']) {
  setLang(lang);
  let r;
  await act(async () => { r = TestRenderer.create(<RxGuide />); });
  await settle();
  const cardButtons = () => r.root.findAll(n => n.type === 'button' && n.props['aria-expanded'] !== undefined);
  ok(cardButtons().length === 214, `${lang}: 214 cards listed (got ${cardButtons().length})`);
  ok(json(r).includes(lang === 'ar' ? 'روشتة في دقيقة' : 'Rx in a minute'), `${lang}: title`);
  ok(json(r).includes('Reem Fawzy'), `${lang}: credit line shown`);
  // search
  const search = r.root.findByProps({ type: 'search' });
  await act(async () => { search.props.onChange({ target: { value: 'hyphema' } }); });
  ok(cardButtons().length === 1, `${lang}: hyphema search gives one card`);
  ok(json(r).includes('Pred Forte 1% ×4'), `${lang}: a single result opens by itself and shows the Rx text`);
  await act(async () => { search.props.onChange({ target: { value: '' } }); });
  // urgent filter
  const urgent = r.root.findAll(n => n.type === 'button' && n.props['aria-pressed'] !== undefined && JSON.stringify(n.props.children).includes('🚨'))[0];
  ok(!!urgent, `${lang}: urgent chip`);
  await act(async () => { urgent.props.onClick(); });
  ok(cardButtons().length === 68, `${lang}: 68 urgent cards (got ${cardButtons().length})`);
  // open one card and check the section labels
  await act(async () => { cardButtons()[0].props.onClick(); });
  ok(json(r).includes(lang === 'ar' ? 'الروشتة' : '"Rx"') || json(r).includes('💊'), `${lang}: opened card shows the Rx section`);
  await act(async () => { r.unmount(); });
}
if (failed) { console.error(`rx-guide smoke: ${failed} failed`); process.exit(1); }
console.log('rx-guide smoke: all passed');
process.exit(0);
