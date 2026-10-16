// Render smoke test: mounts the real RxForm and checks the allergy banner (synthetic data only).
// Run with:  npm run test:smoke:rx
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

const store = new Map();
globalThis.localStorage = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k), get length() { return store.size; }, key: i => [...store.keys()][i] ?? null };
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.window = globalThis.window || { __iappSyncInit: true };
globalThis.window.IAppModules = { auth: { ensureSession: async () => ({ ok: true }) } };

const { default: RxForm } = await import('../../src/components/forms/RxForm.jsx');

const flat = n => (n == null ? '' : typeof n === 'string' ? n : Array.isArray(n) ? n.map(flat).join(' ') : flat(n.children));
let failed = 0;
const check = (name, ok) => { console.log((ok ? 'ok   ' : 'FAIL ') + name); if (!ok) failed++; };

const render = (patient, medicines) => {
  let r;
  act(() => {
    r = TestRenderer.create(
      <RxForm
        patients={[patient]}
        initial={{ id: 1, patientId: patient.id, patient: patient.name, eye: 'كلتا العينين', date: '2026-10-16', medicines, notes: '' }}
        onSave={() => {}}
        onClose={() => {}}
      />
    );
  });
  return flat(r.toJSON());
};

const base = { id: 1, name: 'مريض تجريبي' };
const withAllergy = render({ ...base, allergies: 'سلفا' }, 'Tobradex - قطرة');
check('allergy recorded: banner shows it', withAllergy.includes('حساسية مسجلة') && withAllergy.includes('سلفا'));
check('allergy recorded, no matching medicine: no match warning', !withAllergy.includes('الأدوية المكتوبة تحتوي'));

const matched = render({ ...base, allergies: 'سلفا' }, 'سلفاسيتاميد - قطرة');
check('medicine contains the allergen: match warning shown', matched.includes('الأدوية المكتوبة تحتوي') && matched.includes('سلفا'));

const none = render({ ...base, allergies: 'لا يوجد' }, 'Tobradex - قطرة');
check('"none" allergy: no banner', !none.includes('حساسية مسجلة'));

const empty = render({ ...base }, '');
check('no allergy field: no banner', !empty.includes('حساسية مسجلة'));

if (failed) { console.log('rx allergy smoke: ' + failed + ' FAILED'); process.exit(1); }
console.log('rx allergy smoke: all passed');
