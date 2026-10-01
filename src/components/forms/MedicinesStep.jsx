import React, { useState, useEffect } from 'react';
import { Btn } from '../common.jsx';
import { C } from '../../modules/theme/index.js';
import { inp } from '../../modules/ui/atoms.jsx';
import {
  DEFAULT_DRUGS, DOSE_OPTIONS, loadDrugs, saveDrug, deleteDrug,
  loadRxTemplates, refreshRxTemplates, addRxTemplate, deleteRxTemplate
} from '../../modules/prescriptions/index.js';
import { parseMedicines, serializeMedicines, medicinesTextForTemplate } from './medicines-step-model.js';

// The "medicines" step of RxForm's 3-step wizard: a drug picker (with a
// custom-drug list stored locally), a dosing-frequency chooser, and a small
// reusable-Rx-templates shortcut (save/apply a saved medicines list).
//
// Moved out of public/legacy/app-runtime.js (Phase 8, batch 15) -- this is
// now the single implementation, used both by the new RxForm.jsx (imported
// directly) and the legacy runtime's own RxForm (via the
// window.IAppModules bridge), same unification as Btn/Modal/Confirm/Toast/
// ThemeToggle in batch 6. Exact copy of the original markup and logic.
export default function MedicinesStep({ medicines, onChange }) {
  const [meds, setMeds] = useState(() => parseMedicines(medicines));
  const [drugList, setDrugList] = useState(loadDrugs);
  const [templates, setTemplates] = useState(loadRxTemplates);
  useEffect(() => {
    (async () => {
      const t = await refreshRxTemplates();
      setTemplates(t);
    })();
  }, []);
  const [newDrug, setNewDrug] = useState('');
  const [addingNew, setAddingNew] = useState(false);

  const save = list => {
    setMeds(list);
    onChange(serializeMedicines(list));
  };
  const addMed = () => save([...meds, { name: '', dose: '' }]);
  const update = (i, k, v) => {
    const n = [...meds];
    n[i] = { ...n[i], [k]: v };
    save(n);
  };
  const remove = i => save(meds.filter((_, idx) => idx !== i));
  const handleAddNewDrug = () => {
    const name = newDrug.trim();
    if (!name) return;
    saveDrug(name);
    setDrugList(loadDrugs());
    setNewDrug('');
    setAddingNew(false);
  };
  const handleDeleteDrug = drugName => {
    if (DEFAULT_DRUGS.includes(drugName)) {
      alert('لا يمكن حذف الأدوية الأصلية');
      return;
    }
    if (!window.confirm('حذف ' + drugName + ' من القائمة؟')) return;
    deleteDrug(drugName);
    setDrugList(loadDrugs());
  };

  return React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 10 } },
    React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 } },
      React.createElement('span', { style: { color: C.text, fontWeight: 700, fontSize: 13 } }, '💊 الأدوية الموصوفة'),
      React.createElement('div', { style: { display: 'flex', gap: 6 } },
        React.createElement(Btn, { small: true, color: C.teal, onClick: () => setAddingNew(v => !v) }, '+ صنف جديد'),
        React.createElement(Btn, { small: true, onClick: addMed }, '+ إضافة')
      )
    ),
    React.createElement('div', { style: { background: C.bg, border: `1px solid ${C.border}`, borderRadius: 12, padding: 10 } },
      React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: templates.length ? 8 : 0 } },
        React.createElement('span', { style: { color: C.muted, fontSize: 11, fontWeight: 700 } }, '⚡ قوالب جاهزة'),
        React.createElement('span', {
          onClick: async () => {
            const txt = medicinesTextForTemplate(meds);
            if (!txt) {
              alert('أضف الأدوية أولاً ثم احفظها كقالب');
              return;
            }
            const name = window.prompt('اسم القالب (مثال: ما بعد المياه البيضاء)');
            if (!name || !name.trim()) return;
            const next = await addRxTemplate({ name: name.trim(), medicines: txt });
            if (next) setTemplates(next); else alert('❌ تعذر حفظ القالب');
          },
          style: { color: C.teal, fontSize: 11, cursor: 'pointer', background: C.teal + '22', borderRadius: 8, padding: '3px 9px' }
        }, '💾 حفظ الحالي كقالب')
      ),
      templates.length === 0
        ? React.createElement('div', { style: { color: C.muted, fontSize: 11, marginTop: 6 } }, 'لا توجد قوالب بعد — اكتب روشتة ثم احفظها كقالب لاستخدامها لاحقاً')
        : React.createElement('div', { style: { display: 'flex', gap: 6, flexWrap: 'wrap' } },
            templates.map(t => React.createElement('span', {
              key: t.id,
              style: { display: 'inline-flex', alignItems: 'center', gap: 6, background: C.gold + '18', border: `1px solid ${C.gold}44`, borderRadius: 9, padding: '5px 9px' }
            },
              React.createElement('span', {
                onClick: () => {
                  const add = parseMedicines(t.medicines || '');
                  save([...meds.filter(m => m.name), ...add]);
                },
                style: { color: C.gold, fontSize: 11, fontWeight: 700, cursor: 'pointer' }
              }, t.name),
              React.createElement('span', {
                onClick: async () => {
                  if (!window.confirm('حذف القالب «' + t.name + '»؟')) return;
                  const next = await deleteRxTemplate(t.id);
                  if (next) setTemplates(next);
                },
                style: { color: C.danger, fontSize: 12, cursor: 'pointer' }
              }, '×')
            ))
          )
    ),
    addingNew && React.createElement('div', {
      style: { background: C.teal + '11', border: '1px solid ' + C.teal + '44', borderRadius: 12, padding: 12, display: 'flex', gap: 8, alignItems: 'center' }
    },
      React.createElement('input', {
        autoFocus: true,
        value: newDrug,
        onChange: e => setNewDrug(e.target.value),
        onKeyDown: e => e.key === 'Enter' && handleAddNewDrug(),
        placeholder: 'اسم الدواء الجديد...',
        style: { ...inp(), flex: 1, fontSize: 12 }
      }),
      React.createElement(Btn, { small: true, color: C.teal, onClick: handleAddNewDrug }, 'حفظ'),
      React.createElement('span', { onClick: () => setAddingNew(false), style: { color: C.muted, fontSize: 20, cursor: 'pointer' } }, '×')
    ),
    meds.length === 0 && React.createElement('div', {
      style: { color: C.muted, fontSize: 12, textAlign: 'center', padding: 20, background: C.card, borderRadius: 10 }
    }, 'اضغط "+ إضافة" لإضافة الأدوية'),
    meds.map((m, i) => React.createElement('div', {
      key: i,
      style: { background: C.card, border: '1px solid ' + C.border, borderRadius: 12, padding: 12 }
    },
      React.createElement('div', { style: { display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' } },
        React.createElement('div', {
          style: { width: 24, height: 24, borderRadius: 6, background: C.gold, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: C.bg, flexShrink: 0 }
        }, i + 1),
        React.createElement('div', { style: { flex: 1 } },
          React.createElement('select', {
            style: { ...inp(), fontSize: 12 },
            value: m.name,
            onChange: e => update(i, 'name', e.target.value)
          },
            React.createElement('option', { value: '' }, '-- اختر دواء --'),
            drugList.map(d => React.createElement('option', { key: d, value: d }, d))
          )
        ),
        React.createElement('div', {
          onClick: () => remove(i),
          style: { color: C.danger, fontSize: 20, cursor: 'pointer', flexShrink: 0, paddingRight: 4 }
        }, '×')
      ),
      React.createElement('div', { style: { display: 'flex', gap: 6, flexWrap: 'wrap' } },
        DOSE_OPTIONS.map(d => React.createElement('div', {
          key: d,
          onClick: () => update(i, 'dose', d),
          style: {
            background: m.dose === d ? C.teal + '22' : C.bg,
            border: '1px solid ' + (m.dose === d ? C.teal : C.border),
            borderRadius: 8,
            padding: '4px 10px',
            fontSize: 10,
            color: m.dose === d ? C.teal : C.muted,
            cursor: 'pointer',
            fontWeight: m.dose === d ? 700 : 400
          }
        }, d))
      ),
      m.dose && React.createElement('div', { style: { color: C.muted, fontSize: 11, marginTop: 6 } }, '📋 ', m.name, ' - ', m.dose)
    ))
  );
}

// Note: handleDeleteDrug (above) is defined for parity with the legacy
// original (custom-drug deletion), but -- same as in the legacy source --
// nothing in the rendered markup currently wires up a delete button for a
// custom drug in the <select> list. Kept as dead code here deliberately,
// matching the pre-existing quirk rather than silently fixing or removing
// it.
