import React, { useState } from 'react';
import { findPatientForRx, eyeRows } from '../modules/prescriptions/index.js';
import { Modal, Confirm, Btn } from '../components/common.jsx';
import { RxForm } from '../components/forms/index.js';

const L = () => globalThis.IAppLegacy;

const iconBtn = (bg, color, extra = {}) => ({
  background: bg, borderRadius: 8, padding: '6px 10px', color, fontSize: 11,
  fontWeight: 600, cursor: 'pointer', ...extra
});

export default function Prescriptions({ prescriptions, setRx, patients, doctorNames = [], primaryDoctor, clinic }) {
  const { C, PrintModal, trashPut, logAudit } = L();
  const [modal, setModal] = useState(null);
  const [viewRx, setViewRx] = useState(null);
  const [printRx, setPrintRx] = useState(null);

  const add = f => setRx([...prescriptions, { ...f, id: Date.now() }]);
  const edit = f => setRx(prescriptions.map(r => (r.id === f.id ? f : r)));
  const del = async id => {
    const rec = prescriptions.find(r => r.id === id);
    await trashPut('iapp_prescriptions', rec, 'روشتة');
    setRx(prescriptions.filter(r => r.id !== id));
    logAudit('حذف روشتة', (rec && rec.date + ' · ' + (rec.patient || '')) || id);
  };

  return (
    <div style={{ padding: '16px 16px 90px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <span style={{ color: C.text, fontWeight: 700, fontSize: 16 }}>الوصفات ({prescriptions.length})</span>
        <Btn small onClick={() => setModal('add')}>+ وصفة جديدة</Btn>
      </div>

      {prescriptions.map(rx => (
        <div key={rx.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 14, marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: C.teal + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🔬</div>
            <div style={{ flex: 1 }}>
              <div style={{ color: C.text, fontWeight: 700, fontSize: 14 }}>{rx.patient}</div>
              <div style={{ color: C.muted, fontSize: 11 }}>{rx.date} · {rx.eye}</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <div onClick={() => setViewRx(rx)} style={iconBtn(C.teal + '22', C.teal, { flex: 1, textAlign: 'center' })}>عرض</div>
            <div onClick={() => setPrintRx(rx)} style={iconBtn(C.purple + '22', C.purple)}>🖨️</div>
            <div onClick={() => setModal({ edit: rx })} style={iconBtn(C.accent + '22', C.accent, { fontWeight: 400 })}>✏</div>
            <div onClick={() => setModal({ del: rx.id })} style={iconBtn(C.danger + '22', C.danger, { fontWeight: 400 })}>🗑</div>
          </div>
        </div>
      ))}

      {prescriptions.length === 0 && <div style={{ color: C.muted, textAlign: 'center', padding: 30, fontSize: 13 }}>لا توجد وصفات</div>}

      {viewRx && (
        <Modal title={`وصفة: ${viewRx.patient}`} onClose={() => setViewRx(null)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {eyeRows(viewRx).map(({ eye, sph, cyl, axis }) => (
              <div key={eye} style={{ background: C.bg, borderRadius: 10, padding: 12 }}>
                <div style={{ color: C.teal, fontWeight: 600, marginBottom: 6 }}>العين {eye}</div>
                <div style={{ display: 'flex', gap: 16 }}>
                  <span style={{ color: C.muted, fontSize: 12 }}>SPH: <b style={{ color: C.text }}>{sph || '-'}</b></span>
                  <span style={{ color: C.muted, fontSize: 12 }}>CYL: <b style={{ color: C.text }}>{cyl || '-'}</b></span>
                  <span style={{ color: C.muted, fontSize: 12 }}>AXIS: <b style={{ color: C.text }}>{axis || '-'}</b></span>
                </div>
              </div>
            ))}
            {viewRx.add && <div style={{ color: C.muted, fontSize: 12 }}>ADD: <b style={{ color: C.text }}>{viewRx.add}</b></div>}
            {viewRx.medicines && (
              <div style={{ background: C.gold + '11', borderRadius: 10, padding: 12 }}>
                <div style={{ color: C.gold, fontWeight: 700, fontSize: 12, marginBottom: 4 }}>الأدوية</div>
                <div style={{ color: C.text, fontSize: 12, whiteSpace: 'pre-wrap' }}>{viewRx.medicines}</div>
              </div>
            )}
            {viewRx.notes && <div style={{ color: C.muted, fontSize: 12, background: C.card, borderRadius: 10, padding: 10 }}>{viewRx.notes}</div>}
            <div style={{ display: 'flex', gap: 8 }}>
              <Btn full onClick={() => setViewRx(null)}>إغلاق</Btn>
              <Btn full color={C.purple} onClick={() => { setViewRx(null); setPrintRx(viewRx); }}>🖨️ طباعة</Btn>
            </div>
          </div>
        </Modal>
      )}

      {modal === 'add' && (
        <Modal title="وصفة جديدة" onClose={() => setModal(null)}>
          <RxForm doctorNames={doctorNames} patients={patients} onSave={f => { add(f); setModal(null); }} onClose={() => setModal(null)} />
        </Modal>
      )}
      {modal && modal.edit && (
        <Modal title="تعديل الوصفة" onClose={() => setModal(null)}>
          <RxForm doctorNames={doctorNames} patients={patients} initial={modal.edit} onSave={f => { edit(f); setModal(null); }} onClose={() => setModal(null)} />
        </Modal>
      )}
      {modal && modal.del && (
        <Confirm msg="حذف هذه الوصفة؟" onOk={() => { del(modal.del); setModal(null); }} onNo={() => setModal(null)} />
      )}
      {printRx && (
        <PrintModal rx={printRx} patient={findPatientForRx(patients, printRx)} primaryDoctor={primaryDoctor} clinic={clinic} onClose={() => setPrintRx(null)} />
      )}
    </div>
  );
}
