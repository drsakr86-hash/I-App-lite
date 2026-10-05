// GlobalSearch -- moved here from public/legacy/app-runtime.js (Phase 8,
// combined batch 19). Exact copy of the original JSX/logic, now a React
// component instead of a legacy function. Its only dependency (C) was
// already moved in an earlier batch, so this moves as a self-contained
// component; the filtering itself lives in global-search-model.js.
import React, { useState } from 'react';
import { C } from '../modules/theme/index.js';
import { globalSearchResults } from './global-search-model.js';
import { t, useLang, dirOf } from '../modules/i18n/index.js';
import { tv } from '../modules/i18n/tv.js';

export default function GlobalSearch({ patients, prescriptions, appointments, onNavigate, onClose }) {
  const lang = useLang();
  const [q, setQ] = useState('');
  const { trimmed, pRes, rRes, aRes, hasResults } = globalSearchResults(patients, prescriptions, appointments, q);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.85)',
        zIndex: 500,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: 60
      }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: C.surface,
          borderRadius: 20,
          padding: 20,
          width: '90%',
          maxWidth: 420,
          maxHeight: '85vh',
          overflowY: 'auto',
          border: '1px solid ' + C.border
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <span style={{ color: C.accent, fontSize: 18 }}>🔍</span>
          <input
            autoFocus
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder={t('g3.search.placeholder', lang)}
            aria-label={t('g3.search.placeholder', lang)}
            style={{
              flex: 1,
              background: C.bg,
              border: '1px solid ' + C.border,
              borderRadius: 10,
              padding: '10px 12px',
              color: C.text,
              fontSize: 14,
              outline: 'none',
              direction: dirOf(lang),
              fontFamily: 'inherit'
            }}
          />
          <span onClick={onClose} role="button" aria-label={t('common.close', lang)} style={{ color: C.muted, fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>×</span>
        </div>
        {!trimmed && (
          <div style={{ color: C.muted, fontSize: 12, textAlign: 'center', padding: 20 }}>{t('g3.search.start', lang)}</div>
        )}
        {trimmed && !hasResults && (
          <div style={{ color: C.muted, fontSize: 12, textAlign: 'center', padding: 20 }}>{t('g3.search.noResults', lang, { q: trimmed })}</div>
        )}
        {pRes.length > 0 && (
          <>
            <div style={{ color: C.muted, fontSize: 10, fontWeight: 700, marginBottom: 8 }}>{t('g3.search.patients', lang)}</div>
            {pRes.map(p => (
              <div
                key={p.id}
                onClick={() => onNavigate('patients', p.id)}
                style={{
                  background: C.card,
                  borderRadius: 10,
                  padding: '10px 12px',
                  marginBottom: 6,
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <div>
                  <div style={{ color: C.text, fontWeight: 600, fontSize: 13 }}>{p.name}</div>
                  <div style={{ color: C.muted, fontSize: 10 }}>{p.patientCode || ''} · {p.phone || ''}</div>
                </div>
                <div style={{ color: C.accent, fontSize: 14 }}>{lang === 'en' ? '→' : '←'}</div>
              </div>
            ))}
          </>
        )}
        {rRes.length > 0 && (
          <>
            <div style={{ color: C.muted, fontSize: 10, fontWeight: 700, margin: '10px 0 8px' }}>{t('g3.search.prescriptions', lang)}</div>
            {rRes.map(r => (
              <div
                key={r.id}
                onClick={() => onNavigate('prescriptions')}
                style={{ background: C.card, borderRadius: 10, padding: '10px 12px', marginBottom: 6, cursor: 'pointer' }}
              >
                <div style={{ color: C.text, fontSize: 13 }}>{r.patient || ''}</div>
                <div style={{ color: C.muted, fontSize: 10 }}>{r.date || ''} · {tv(r.eye || '', lang)}</div>
              </div>
            ))}
          </>
        )}
        {aRes.length > 0 && (
          <>
            <div style={{ color: C.muted, fontSize: 10, fontWeight: 700, margin: '10px 0 8px' }}>{t('g3.search.appointments', lang)}</div>
            {aRes.map(a => (
              <div
                key={a.id}
                onClick={() => onNavigate('appointments')}
                style={{ background: C.card, borderRadius: 10, padding: '10px 12px', marginBottom: 6, cursor: 'pointer' }}
              >
                <div style={{ color: C.text, fontSize: 13 }}>{a.patient || ''}</div>
                <div style={{ color: C.muted, fontSize: 10 }}>{a.time || ''} · {tv(a.type || '', lang)}</div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
