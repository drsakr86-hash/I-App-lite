// Drug-name list and dosing-frequency options used by MedicinesStep --
// moved here from public/legacy/app-runtime.js (Phase 8, batch 15). Exact
// copies of the original values/logic; app-runtime.js now delegates to the
// moved MedicinesStep component instead of redefining any of this.

export const DEFAULT_DRUGS = [
  'Vigamox ED', 'Optipred ED', 'Tobradex ED', 'Tobradex EO', 'Dexaflox ED',
  'Cyanaro ED', 'Solofresh ED', 'Timolol 0.5% ED', 'Tobramycin ED',
  'Prednisolone ED', 'Moxifloxacin ED', 'Dorzolamide ED', 'Latanoprost ED',
  'Ketorolac ED', 'Cyclopentolate ED', 'Tropicamide ED', 'Atropine ED',
  'Tetracycline EO', 'Vitamins A&E cap'
];

const CUSTOM_DRUGS_KEY = 'iapp_custom_drugs';

export function loadDrugs() {
  try {
    const custom = JSON.parse(localStorage.getItem(CUSTOM_DRUGS_KEY) || '[]');
    const all = [...DEFAULT_DRUGS];
    custom.forEach(d => {
      if (!all.includes(d)) all.push(d);
    });
    return all;
  } catch {
    return [...DEFAULT_DRUGS];
  }
}

export function saveDrug(name) {
  try {
    const custom = JSON.parse(localStorage.getItem(CUSTOM_DRUGS_KEY) || '[]');
    if (!custom.includes(name) && !DEFAULT_DRUGS.includes(name)) {
      custom.push(name);
      localStorage.setItem(CUSTOM_DRUGS_KEY, JSON.stringify(custom));
    }
  } catch { /* storage unavailable (private mode / quota): non-fatal */ }
}

export function deleteDrug(name) {
  try {
    const custom = JSON.parse(localStorage.getItem(CUSTOM_DRUGS_KEY) || '[]');
    localStorage.setItem(CUSTOM_DRUGS_KEY, JSON.stringify(custom.filter(d => d !== name)));
  } catch { /* storage unavailable (private mode / quota): non-fatal */ }
}

export const DOSE_OPTIONS = [
  'مرة يومياً', 'مرتين يومياً', '3 مرات يومياً', '4 مرات يومياً',
  'كل 4 ساعات', 'كل 6 ساعات', 'عند اللزوم', 'قبل النوم'
];
