import React, { useState, useEffect } from 'react';
import { C } from '../modules/theme/index.js';
import { Field, inp } from '../modules/ui/atoms.jsx';
import { Btn } from './common.jsx';
import { sbGet } from '../modules/sync/wiring.js';
import { localISO, newId } from '../modules/constants/misc.js';
import { INJ_KEY, INJ_DRUGS } from '../modules/followups/index.js';
import { saveInjection, deleteInjection } from '../modules/followups/injections.js';

// Intravitreal-injection log shown in the patient file's Visits tab. Exact
// port of the legacy runtime's InjectionsSection (public/legacy/
// app-runtime.js) -- only consumer is src/screens/patient-file/VisitsTab.jsx.
export default function InjectionsSection({ patient }) {
  const [list, setList] = useState([]);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const r = await sbGet(INJ_KEY);
    if (Array.isArray(r)) setList(r.filter(x => x.patientId === patient.id));
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patient.id]);

  const blank = () => {
    const mine = list.filter(x => x.eye === 'العين اليمنى');
    return {
      id: newId(),
      patientId: patient.id,
      patient: patient.name,
      phone: patient.phone || '',
      date: localISO(),
      eye: 'العين اليمنى',
      drug: INJ_DRUGS[0],
      doseNo: mine.length + 1,
      nextDate: '',
      notes: ''
    };
  };

  const save = async () => {
    if (!form.drug || !form.date) {
      alert('اكتب الدواء والتاريخ');
      return;
    }
    setBusy(true);
    const next = await saveInjection(form);
    setBusy(false);
    if (next) {
      setList(next.filter(x => x.patientId === patient.id));
      setForm(null);
    } else alert('❌ تعذر الحفظ — تحقق من الاتصال');
  };

  const del = async x => {
    if (!window.confirm('نقل هذه الحقنة إلى سلة المحذوفات؟')) return;
    const next = await deleteInjection(x.id, x);
    if (next) setList(next.filter(y => y.patientId === patient.id));
  };

  const sorted = [...list].sort((a, b) => String(b.date).localeCompare(String(a.date)));

  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 14, marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ color: C.text, fontWeight: 700, fontSize: 13 }}>💉 الحقن داخل العين ({list.length})</div>
        <span
          onClick={() => setForm(form ? null : blank())}
          style={{ color: C.teal, fontSize: 11, cursor: 'pointer', background: C.teal + '22', borderRadius: 8, padding: '4px 10px' }}
        >{form ? 'إلغاء' : '+ حقنة'}</span>
      </div>
      {form && (
        <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 12, padding: 12, marginBottom: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Field label="التاريخ">
            <input type="date" style={inp()} value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
          </Field>
          <Field label="العين">
            <select style={inp()} value={form.eye} onChange={e => setForm(f => ({ ...f, eye: e.target.value }))}>
              {['العين اليمنى', 'العين اليسرى', 'كلتا العينين'].map(x => <option key={x}>{x}</option>)}
            </select>
          </Field>
          <Field label="الدواء">
            <select style={inp()} value={form.drug} onChange={e => setForm(f => ({ ...f, drug: e.target.value }))}>
              {INJ_DRUGS.map(x => <option key={x}>{x}</option>)}
            </select>
          </Field>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <Field label="رقم الجرعة">
                <input type="number" min="1" style={inp()} value={form.doseNo} onChange={e => setForm(f => ({ ...f, doseNo: e.target.value }))} />
              </Field>
            </div>
            <div style={{ flex: 1 }}>
              <Field label="الحقنة القادمة">
                <input type="date" style={inp()} value={form.nextDate} onChange={e => setForm(f => ({ ...f, nextDate: e.target.value }))} />
              </Field>
            </div>
          </div>
          <Field label="ملاحظات">
            <input style={inp()} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="اختياري" />
          </Field>
          <Btn full color={C.teal} onClick={save}>{busy ? '⏳ جاري الحفظ...' : '✓ حفظ الحقنة'}</Btn>
        </div>
      )}
      {sorted.length === 0 && !form && (
        <div style={{ color: C.muted, fontSize: 12, textAlign: 'center', padding: '10px 0' }}>لا توجد حقن مسجلة</div>
      )}
      {sorted.map(x => (
        <div key={x.id} style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, padding: '9px 11px', marginBottom: 7 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ color: C.text, fontSize: 12, fontWeight: 700 }}>{x.drug} · {x.eye}</span>
            <span style={{ color: C.muted, fontSize: 11 }}>{x.date}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 4 }}>
            <span style={{ color: C.muted, fontSize: 11 }}>الجرعة رقم {x.doseNo || '—'}{x.nextDate ? ' · القادمة ' + x.nextDate : ''}</span>
            <span onClick={() => del(x)} style={{ color: C.danger, fontSize: 11, cursor: 'pointer' }}>حذف</span>
          </div>
          {x.notes && <div style={{ color: C.text, fontSize: 11, marginTop: 4 }}>📝 {x.notes}</div>}
        </div>
      ))}
    </div>
  );
}
