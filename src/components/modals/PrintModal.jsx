import React from 'react';
import { Modal, Btn } from '../common.jsx';
import {
  printDoctorName, printPatient, GLASSES_HEADERS, GLASSES_ROWS, GLASSES_KEYS, glassesCell,
  medicinePreview, moreMedicinesCount, hasMoreMedicines
} from './print-modal-model.js';

const L = () => globalThis.IAppLegacy;

// "Choose what to print" sheet for a prescription (Prescriptions list and the
// patient file). Port of the legacy runtime's PrintModal
// (public/legacy/app-runtime.js), which stays in place for the legacy
// screens. The documents are built by the runtime's getGlassesHTML /
// getRxHTML templates and printed with printDoc, all read from the bridge
// and called with exactly the legacy arguments. Theme C is read from the
// bridge too.
export default function PrintModal({ rx, patient, onClose, primaryDoctor, clinic }) {
  const { C, printDoc, getGlassesHTML, getRxHTML } = L();
  const docName = printDoctorName(primaryDoctor);
  const p = printPatient(patient);
  return (
    <Modal title="🖨️ اختر نوع الطباعة" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, padding: 12 }}>
          <div style={{ color: C.text, fontWeight: 700, fontSize: 13, marginBottom: 4 }}>{rx.patient}</div>
          <div style={{ color: C.muted, fontSize: 11 }}>{rx.date}{' · '}{rx.eye}</div>
        </div>
        <div
          onClick={() => {
            printDoc(getGlassesHTML(rx, p, docName, clinic));
          }}
          style={{ background: C.accent + '11', border: `2px solid ${C.accent}`, borderRadius: 14, padding: 16, cursor: 'pointer' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ fontSize: 28 }}>👓</div>
            <div>
              <div style={{ color: C.accent, fontWeight: 700, fontSize: 14 }}>كشف النظارة</div>
              <div style={{ color: C.muted, fontSize: 11, marginTop: 2 }}>جدول Right / Left — SPH · CYL · AX · ADD · IPD</div>
            </div>
          </div>
          <div style={{ marginTop: 12, background: C.bg, borderRadius: 8, padding: 10, direction: 'ltr' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '60px 1fr 1fr 1fr 1fr 1fr 1fr', gap: 4, fontSize: 10 }}>
              <div />
              {GLASSES_HEADERS.map((h, i) => (
                <div
                  key={i}
                  style={{ background: C.accent, color: C.bg, borderRadius: 4, padding: '2px 4px', textAlign: 'center', fontWeight: 700 }}
                >{h}</div>
              ))}
              {GLASSES_ROWS.map(row => [
                <div key={row} style={{ color: C.muted, fontSize: 9, display: 'flex', alignItems: 'center' }}>{row}</div>,
                ...GLASSES_KEYS.map((k, i) => (
                  <div
                    key={k + i}
                    style={{ background: C.border, borderRadius: 4, padding: '3px 4px', textAlign: 'center', color: C.text, fontWeight: 600 }}
                  >{glassesCell(rx, row, k)}</div>
                ))
              ])}
            </div>
          </div>
          <div style={{ color: C.accent, fontWeight: 700, fontSize: 12, textAlign: 'center', marginTop: 10 }}>اضغط للطباعة →</div>
        </div>
        <div
          onClick={() => {
            printDoc(getRxHTML(rx, p, docName, clinic));
          }}
          style={{ background: C.gold + '11', border: `2px solid ${C.gold}`, borderRadius: 14, padding: 16, cursor: 'pointer' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ fontSize: 28 }}>💊</div>
            <div>
              <div style={{ color: C.gold, fontWeight: 700, fontSize: 14 }}>روشتة الأدوية</div>
              <div style={{ color: C.muted, fontSize: 11, marginTop: 2 }}>قائمة الأدوية والجرعات</div>
            </div>
          </div>
          {rx.medicines && (
            <div style={{ marginTop: 10, background: C.bg, borderRadius: 8, padding: 10 }}>
              {medicinePreview(rx.medicines).map((m, i) => (
                <div key={i} style={{ color: C.text, fontSize: 11, marginBottom: 4, display: 'flex', gap: 6 }}>
                  <span
                    style={{
                      background: C.gold,
                      color: C.bg,
                      borderRadius: '50%',
                      width: 16,
                      height: 16,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 9,
                      fontWeight: 800,
                      flexShrink: 0
                    }}
                  >{i + 1}</span>
                  <span>{m}</span>
                </div>
              ))}
              {hasMoreMedicines(rx.medicines) && (
                <div style={{ color: C.muted, fontSize: 10 }}>{'+'}{moreMedicinesCount(rx.medicines)}{' أدوية أخرى...'}</div>
              )}
            </div>
          )}
          <div style={{ color: C.gold, fontWeight: 700, fontSize: 12, textAlign: 'center', marginTop: 10 }}>اضغط للطباعة →</div>
        </div>
        <Btn outline full onClick={onClose}>إغلاق</Btn>
      </div>
    </Modal>
  );
}
