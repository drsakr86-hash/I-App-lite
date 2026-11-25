import React, { useState, useRef, useEffect } from 'react';
import { C } from '../modules/theme/index.js';
import { inp } from '../modules/ui/atoms.jsx';
import { t, useLang } from '../modules/i18n/index.js';
import { tv } from '../modules/i18n/tv.js';
import { clinicLabel, CLINICS_LIST, localISO } from '../modules/constants/index.js';
import { matchSecretaryPrice } from './forms/secretary-forms-model.js';
import {
  ARRIVAL_TYPES, defaultArrivalType, matchPatients, alreadyToday, arrivalError, buildArrival, readMySite, saveMySite
} from '../modules/quick-desk/model.js';
import { askConfirm } from '../modules/ui/dialogs.js';

const chip = (on, color) => ({
  background: on ? color + '2a' : 'transparent',
  border: '1px solid ' + (on ? color : C.border),
  color: on ? color : C.muted,
  borderRadius: 999,
  padding: '7px 12px',
  fontSize: 12,
  fontWeight: 700,
  cursor: 'pointer',
  fontFamily: 'inherit',
  minHeight: 36
});

const storage = () => { try { return window.localStorage; } catch { return null; } };

// Quick arrival (secretary): one box finds the patient by name / phone / file number; one tap puts them in today's
// waiting list at this device's site with the listed price. Unknown name -> the same box becomes a new patient.
// onSave(apt) returns true when saved.
export default function QuickArrival({ patients = [], appointments = [], prices = [], onSave, onClose }) {
  const lang = useLang();
  const [site, setSite] = useState(() => readMySite(storage()));
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState(null);
  const [phone, setPhone] = useState('');
  const [type, setType] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const box = useRef(null);
  useEffect(() => { if (site && box.current) box.current.focus(); }, [site]);

  const chooseSite = s => { saveMySite(storage(), s); setSite(s); };

  if (!site) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ color: C.text, fontSize: 14, fontWeight: 700 }}>{t('qd.site.ask', lang)}</div>
        <div style={{ color: C.muted, fontSize: 12 }}>{t('qd.site.hint', lang)}</div>
        {CLINICS_LIST.map(c => (
          <button key={c} onClick={() => chooseSite(c)} style={{ ...chip(false, C.teal), borderRadius: 12, padding: 14, fontSize: 14, color: C.text }}>{tv(clinicLabel(c), lang)}</button>
        ))}
      </div>
    );
  }

  const hits = picked ? [] : matchPatients(patients, q);
  const isNew = !picked;
  const curType = type || defaultArrivalType(!!picked);
  const priceRow = matchSecretaryPrice(prices, curType, site);
  const price = priceRow ? priceRow.price : '';
  const name = picked ? picked.name : q.trim();

  const save = async () => {
    const e = arrivalError({ name, phone: picked ? '' : phone, site });
    if (e) { setErr(t(e, lang)); return; }
    if (alreadyToday(appointments, { patientId: picked ? picked.id : null, name }, localISO())) {
      const go = await askConfirm(t('qd.dupToday', lang, { name }));
      if (!go) return;
    }
    setErr('');
    setBusy(true);
    const apt = buildArrival({ patient: picked, name, phone, site, type: curType, price, appointments });
    const ok = await onSave(apt);
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12, color: C.muted }}>
        <span>{t('qd.site.label', lang)} <b style={{ color: C.teal }}>{tv(clinicLabel(site), lang)}</b></span>
        <button onClick={() => setSite('')} style={{ background: 'transparent', border: 'none', color: C.accent, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>{t('qd.site.change', lang)}</button>
      </div>

      {picked ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: C.teal + '18', border: '1px solid ' + C.teal + '55', borderRadius: 12, padding: '10px 12px' }}>
          <div>
            <div style={{ color: C.text, fontWeight: 800, fontSize: 15 }}>{picked.name}</div>
            <div style={{ color: C.muted, fontSize: 11 }}>{[picked.patientCode, picked.phone].filter(Boolean).join(' · ')}</div>
          </div>
          <button onClick={() => { setPicked(null); setType(null); setTimeout(() => box.current && box.current.focus(), 0); }} style={{ background: 'transparent', border: '1px solid ' + C.border, borderRadius: 8, color: C.muted, padding: '6px 10px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12 }}>{t('qd.change', lang)}</button>
        </div>
      ) : (
        <input
          ref={box}
          style={{ ...inp(), fontSize: 16, padding: '12px 14px' }}
          value={q}
          onChange={e => { setQ(e.target.value); setErr(''); }}
          placeholder={t('qd.searchPh', lang)}
          aria-label={t('qd.searchPh', lang)}
          autoComplete="off"
        />
      )}

      {hits.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {hits.map(p => (
            <button key={p.id} onClick={() => { setPicked(p); setType(null); setErr(''); }} style={{ textAlign: 'start', background: C.card, border: '1px solid ' + C.border, borderRadius: 10, padding: '10px 12px', cursor: 'pointer', fontFamily: 'inherit', color: C.text }}>
              <span style={{ fontWeight: 700 }}>{p.name}</span>
              <span style={{ color: C.muted, fontSize: 11 }}>{'  ' + [p.patientCode, p.phone].filter(Boolean).join(' · ')}</span>
            </button>
          ))}
        </div>
      )}

      {isNew && q.trim().length >= 2 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ color: C.gold, fontSize: 12, fontWeight: 700 }}>{t('qd.newPatient', lang, { name: q.trim() })}</div>
          <input style={inp()} type="tel" inputMode="tel" value={phone} onChange={e => { setPhone(e.target.value); setErr(''); }} placeholder={t('qd.phonePh', lang)} aria-label={t('qd.phonePh', lang)} />
        </div>
      )}

      {(picked || q.trim().length >= 2) && (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {ARRIVAL_TYPES.map(ty => (
              <button key={ty} onClick={() => setType(ty)} style={chip(curType === ty, C.accent)}>{tv(ty, lang)}</button>
            ))}
          </div>
          <div style={{ color: C.muted, fontSize: 12 }}>{t('qd.price', lang)} <b style={{ color: C.text }}>{price !== '' ? price : '—'}</b></div>
        </>
      )}

      {err && <div role="alert" style={{ background: C.danger + '22', border: '1px solid ' + C.danger + '44', borderRadius: 10, padding: '9px 12px', color: C.danger, fontSize: 12, textAlign: 'center' }}>{err}</div>}

      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={onClose} style={{ flex: 1, background: 'transparent', border: '1px solid ' + C.border, borderRadius: 10, padding: 12, color: C.muted, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>{t('g3.common.cancel', lang)}</button>
        <button disabled={busy || !(picked || q.trim().length >= 2)} onClick={save} style={{ flex: 2, background: 'linear-gradient(135deg,' + C.accent + ',' + C.teal + ')', border: 'none', borderRadius: 10, padding: 12, color: C.bg, fontWeight: 800, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit', opacity: busy || !(picked || q.trim().length >= 2) ? 0.5 : 1 }}>{t('qd.save', lang)}</button>
      </div>
    </div>
  );
}
