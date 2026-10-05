import React, { useState } from 'react';
import { listPatients, isNewToday } from '../modules/patients/list.js';
import { Modal, Confirm, Btn } from '../components/common.jsx';
import { PatientForm } from '../components/forms/index.js';
import { C } from '../modules/theme/index.js';
import { SC, Tag } from '../modules/ui/atoms.jsx';
import { t, useLang, dirOf } from '../modules/i18n/index.js';
import { tv } from '../modules/i18n/tv.js';

// List mode of the Patients tab only. The patient file (PatientFile) and every
// save/sync function live in src/modules/patients/patients-orchestration.js
// (via src/screens/PatientsContainer.jsx); this screen receives
// addP / updP / delP / onOpenFile from there and only renders the list.
export default function Patients({
  patients = [], search = '', setSearch, addP, updP, delP, onOpenFile, session, initNewName, onInitDone
}) {
  const lang = useLang();
  const [modal, setModal] = useState(null);
  const filtered = listPatients(patients, search);
  const close = () => setModal(null);

  return (
    <div style={{ padding: '16px 16px 90px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <span style={{ color: C.text, fontWeight: 700, fontSize: 16 }}>{t('g6.pts.title', lang)} ({patients.length})</span>
        <Btn small onClick={() => setModal('add')}>{t('g6.pts.new', lang)}</Btn>
      </div>

      <div style={{
        background: C.card, border: `1px solid ${search ? C.accent : C.border}`, borderRadius: 12,
        padding: '10px 14px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8, transition: 'border 0.2s'
      }}>
        <span style={{ color: C.accent }}>🔍</span>
        <input autoFocus={!!initNewName} value={search} onChange={e => setSearch(e.target.value)}
          placeholder={t('g6.pts.searchPh', lang)}
          style={{ background: 'none', border: 'none', outline: 'none', color: C.text, fontSize: 13, flex: 1, direction: dirOf(lang), fontFamily: 'inherit' }} />
        {search && <span onClick={() => setSearch('')} style={{ color: C.muted, cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>×</span>}
      </div>

      {search && filtered.length === 0 && (
        <div style={{
          background: C.gold + '11', border: `1px solid ${C.gold}33`, borderRadius: 14,
          padding: '14px 16px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10
        }}>
          <span style={{ fontSize: 20 }}>👤</span>
          <div style={{ flex: 1 }}>
            <div style={{ color: C.gold, fontWeight: 700, fontSize: 13 }}>{t('g6.pts.notFound', lang, { q: search })}</div>
            <div style={{ color: C.muted, fontSize: 11, marginTop: 2 }}>{t('g6.pts.addAsNew', lang)}</div>
          </div>
          <Btn small color={C.gold} onClick={() => setModal({ addNew: search })}>{t('g6.pts.add', lang)}</Btn>
        </div>
      )}

      {filtered.map(p => {
        const isNew = isNewToday(p);
        return (
          <div key={p.id} style={{
            background: C.card, border: `1px solid ${isNew ? C.teal + '66' : C.border}`, borderRadius: 16,
            padding: 14, marginBottom: 10, position: 'relative'
          }}>
            {isNew && (
              <span style={{
                position: 'absolute', top: 10, insetInlineStart: 10, background: C.teal, color: C.bg,
                borderRadius: 6, padding: '1px 7px', fontSize: 9, fontWeight: 800
              }}>{t('g6.pts.newBadge', lang)}</span>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
              <div style={{
                width: 44, height: 44, borderRadius: '50%', background: `linear-gradient(135deg,${C.accent}33,${C.teal}33)`,
                border: `2px solid ${isNew ? C.teal : C.accent}44`, display: 'flex', alignItems: 'center',
                justifyContent: 'center', color: C.accent, fontWeight: 800, fontSize: 16
              }}>{(p.name || '?')[0]}</div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ color: C.text, fontWeight: 700, fontSize: 14 }}>{p.name}</div>
                  <span style={{
                    background: C.accent + '22', color: C.accent, borderRadius: 6, padding: '1px 7px',
                    fontSize: 10, fontWeight: 700, letterSpacing: 1
                  }}>{p.patientCode || '—'}</span>
                </div>
                <div style={{ color: C.muted, fontSize: 11 }}>{(p.age || p.age === 0) ? t('g6.pts.ageYears', lang, { n: p.age }) : '—'} · {tv(p.condition) || '—'}</div>
              </div>
              <Tag label={tv(p.status)} color={SC[p.status] || C.muted} />
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <div onClick={() => onOpenFile(p.id)} style={{
                background: C.teal + '22', borderRadius: 8, padding: '7px 0', color: C.teal, fontSize: 11,
                fontWeight: 700, cursor: 'pointer', flex: 1, textAlign: 'center'
              }}>{t('g6.pts.fullFile', lang)}</div>
              <div onClick={() => setModal({ edit: p })} style={{
                background: C.accent + '22', borderRadius: 8, padding: '7px 12px', color: C.accent, fontSize: 11, cursor: 'pointer'
              }}>✏</div>
              {session && session.role === 'admin' && (
                <div onClick={() => setModal({ del: p.id })} style={{
                  background: C.danger + '22', borderRadius: 8, padding: '7px 10px', color: C.danger, fontSize: 11, cursor: 'pointer'
                }}>🗑</div>
              )}
            </div>
          </div>
        );
      })}

      {filtered.length === 0 && <div style={{ color: C.muted, textAlign: 'center', padding: 30, fontSize: 13 }}>{t('g6.pts.noResults', lang)}</div>}

      {(modal === 'add' || (modal && modal.addNew)) && (
        <Modal title={t('g6.pts.newTitle', lang)} onClose={close}>
          <PatientForm initial={modal && modal.addNew ? { name: modal.addNew } : null}
            onSave={f => { addP(f); close(); if (onInitDone) onInitDone(); }} onClose={close} />
        </Modal>
      )}
      {modal && modal.edit && (
        <Modal title={t('g6.pts.editTitle', lang)} onClose={close}>
          <PatientForm initial={modal.edit} onSave={f => { updP(f); close(); }} onClose={close} />
        </Modal>
      )}
      {modal && modal.del && (
        <Confirm msg={t('g6.pts.confirmDelete', lang)} onOk={() => { delP(modal.del); close(); }} onNo={close} />
      )}
    </div>
  );
}
