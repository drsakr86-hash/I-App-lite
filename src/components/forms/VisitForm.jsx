import React, { useState } from 'react';
import { Btn } from '../common.jsx';
import {
  DEFAULT_DOCTOR_NAMES, VISIT_COMPLAINTS, initialVisitState, matchPriceForType, withVisitType,
  visitTypeOptions, referencePriceShown, referencePriceText, withComplaintSelect, complaintSelectValue,
  customComplaintShown, customComplaintValue, complaintBadgeShown, togglePaid, buildVisitPayload
} from './visit-form-model.js';
import { C } from '../../modules/theme/index.js';
import { Field, inp } from '../../modules/ui/atoms.jsx';
import { localISO, CLINICS } from '../../modules/constants/index.js';

// Visit add/edit form. Exact port of the legacy runtime's VisitForm
// (public/legacy/app-runtime.js).
export default function VisitForm({ initial, patientId, onSave, onClose, doctorNames = DEFAULT_DOCTOR_NAMES, prices = [] }) {
  const [f, setF] = useState(() => initialVisitState(initial, localISO(), CLINICS[0].v));
  // Legacy dead state: set on complaint select, never read.
  const [customComplaint, setCustomComplaint] = useState('');
  const s = k => e => setF(v => ({ ...v, [k]: e.target.value }));
  const handleTypeChange = e => {
    const type = e.target.value;
    const matched = matchPriceForType(prices, type);
    setF(v => withVisitType(v, type, matched));
  };
  const handleComplaintSelect = e => {
    const val = e.target.value;
    setF(v => withComplaintSelect(v, val));
    setCustomComplaint('');
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Field label="تاريخ الزيارة">
          <input style={inp()} type="date" value={f.date} onChange={s('date')} />
        </Field>
        <Field label="الطبيب">
          <select style={inp()} value={f.doctor} onChange={s('doctor')}>
            {doctorNames.map(d => <option key={d}>{d}</option>)}
          </select>
        </Field>
      </div>
      <Field label="العيادة">
        <select style={inp()} value={f.clinic || CLINICS[0].v} onChange={s('clinic')}>
          {CLINICS.map(c => <option key={c.v} value={c.v}>{c.l}</option>)}
        </select>
      </Field>
      <Field label="نوع الزيارة">
        <select style={inp()} value={f.type} onChange={handleTypeChange}>
          {visitTypeOptions(prices).map(t => <option key={t}>{t}</option>)}
        </select>
        {referencePriceShown(prices, f.type) && (
          <div style={{ color: C.gold, fontSize: 11, marginTop: 4 }}>
            {'💰 السعر المرجعي: '}{referencePriceText(prices, f.type)}{' ج.م'}
          </div>
        )}
      </Field>
      <Field label="الشكوى">
        <select style={inp()} value={complaintSelectValue(f.complaint)} onChange={handleComplaintSelect}>
          <option value="">— اختر الشكوى —</option>
          {VISIT_COMPLAINTS.map(c => <option key={c}>{c}</option>)}
        </select>
        {customComplaintShown(f.complaint) && (
          <input
            style={{ ...inp(), marginTop: 6 }}
            value={customComplaintValue(f.complaint)}
            onChange={e => setF(v => ({ ...v, complaint: e.target.value }))}
            placeholder="اكتب الشكوى..."
          />
        )}
        {complaintBadgeShown(f.complaint) && (
          <div
            style={{
              background: C.accent + '22',
              border: `1px solid ${C.accent}33`,
              borderRadius: 8,
              padding: '6px 10px',
              marginTop: 6,
              color: C.accent,
              fontSize: 12
            }}
          >{'✓ '}{f.complaint}</div>
        )}
      </Field>
      <Field label="نتيجة الزيارة / التشخيص">
        <textarea style={{ ...inp(), resize: 'none' }} rows={2} value={f.result} onChange={s('result')} placeholder="نتيجة الكشف..." />
      </Field>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Field label="التكلفة (ج.م)">
          <input style={inp({ textAlign: 'center' })} type="number" value={f.cost} onChange={s('cost')} placeholder="350" />
        </Field>
        <Field label="موعد المتابعة">
          <input style={inp()} type="date" value={f.nextVisit} onChange={s('nextVisit')} />
        </Field>
      </div>
      <div
        onClick={() => setF(togglePaid)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          background: C.card,
          border: `1px solid ${f.paid ? C.success : C.border}`,
          borderRadius: 10,
          padding: '10px 14px',
          cursor: 'pointer'
        }}
      >
        <div
          style={{
            width: 20,
            height: 20,
            borderRadius: 6,
            background: f.paid ? C.success : C.bg,
            border: `2px solid ${f.paid ? C.success : C.border}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 12,
            color: C.bg,
            fontWeight: 700
          }}
        >{f.paid ? '✓' : ''}</div>
        <span style={{ color: f.paid ? C.success : C.muted, fontSize: 13, fontWeight: 600 }}>تم الدفع</span>
      </div>
      <Field label="ملاحظات">
        <textarea style={{ ...inp(), resize: 'none' }} rows={2} value={f.notes} onChange={s('notes')} placeholder="ملاحظات إضافية..." />
      </Field>
      <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
        <Btn outline full onClick={onClose}>إلغاء</Btn>
        <Btn full onClick={() => onSave(buildVisitPayload(f, patientId, Date.now()))}>حفظ الزيارة</Btn>
      </div>
    </div>
  );
}
