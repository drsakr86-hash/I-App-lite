// The atlas as a part of the examination: a section at the end of the exam form. It lists the drawings already approved
// for this exam and opens the atlas full-screen with this patient and exam fixed (no patient search, no separate tab).
import React, { useEffect, useState, lazy, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { C } from '../../modules/theme/index.js';
import { useLang, t } from '../../modules/i18n/index.js';
import { isEnabled } from '../../modules/feature-flags/index.js';
import { can } from '../../app/permissions.js';
import { privateStorageEnabled } from '../../services/private-storage.js';
import { ATLAS_DRAWINGS_KEY } from '../../modules/atlas/drawings.js';
import { sbGet } from '../../modules/sync/wiring.js';

const AtlasScreen = lazy(() => import('../../screens/AtlasScreen.jsx'));

export default function ExamAtlasSection({ exam, patient, session }) {
  const lang = useLang();
  const role = session && session.role;
  const allowed = isEnabled('atlas') && can(role, 'atlas', 'read');
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);

  // number of approved drawings, re-read when the atlas is closed (an approval may have just happened)
  useEffect(() => {
    if (!allowed || !exam) return undefined;
    let live = true;
    sbGet('iapp_exams').then(list => {
      const e = Array.isArray(list) ? list.find(x => String(x.id) === String(exam.id)) : null;
      const d = e && Array.isArray(e[ATLAS_DRAWINGS_KEY]) ? e[ATLAS_DRAWINGS_KEY] : [];
      if (live) setCount(d.filter(x => x.status === 'approved').length);
    }).catch(() => {});
    return () => { live = false; };
  }, [allowed, exam, open]);

  if (!allowed) return null;
  const box = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 };
  const user = { id: session.id != null ? session.id : session.username, name: session.name || session.username || '' };

  return (
    <div style={box}>
      <div style={{ fontSize: 14, fontWeight: 800 }}>{t('atlas.exam.title', lang)}</div>
      {!exam ? (
        <div style={{ fontSize: 12, color: C.muted }}>{t('atlas.exam.saveFirst', lang)}</div>
      ) : (
        <>
          <div style={{ fontSize: 12, color: C.muted }}>{count ? `${t('atlas.attach.status.approved', lang)}: ${count}` : t('atlas.exam.none', lang)}</div>
          {!privateStorageEnabled() ? <div style={{ fontSize: 12, color: C.gold }}>{t('atlas.exam.needPrivate', lang)}</div> : null}
          <button type="button" onClick={() => setOpen(true)} style={{ alignSelf: 'flex-start', background: `${C.accent}22`, border: `1px solid ${C.accent}`, color: C.accent, borderRadius: 10, padding: '8px 12px', fontSize: 13, fontWeight: 700, cursor: 'pointer', minHeight: 40 }}>
            {t('atlas.exam.open', lang)}
          </button>
        </>
      )}
      {open && exam ? createPortal(
        <div style={{ position: 'fixed', inset: 0, zIndex: 2000, background: C.bg, overflowY: 'auto' }}>
          <Suspense fallback={<div style={{ padding: 20, color: C.muted }}>…</div>}>
            <AtlasScreen role={role} user={user} context={{ patient, exam }} onClose={() => setOpen(false)} />
          </Suspense>
        </div>,
        document.body
      ) : null}
    </div>
  );
}
