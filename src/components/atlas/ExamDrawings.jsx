// Read-only strip of the approved atlas drawings of one saved exam (used in the patient file's exam card).
import React from 'react';
import { C } from '../../modules/theme/index.js';
import { useLang, t } from '../../modules/i18n/index.js';
import { getPrivateStorage } from './private-instance.js';
import SignedImg from './SignedImg.jsx';

export default function ExamDrawings({ drawings }) {
  const lang = useLang();
  const priv = getPrivateStorage();
  const list = (Array.isArray(drawings) ? drawings : []).filter(d => d.status === 'approved');
  if (!priv || !list.length) return null;
  return (
    <div style={{ background: C.bg, borderRadius: 10, padding: 10, marginTop: 8 }}>
      <div style={{ color: C.muted, fontSize: 10, marginBottom: 6 }}>{t('atlas.exam.title', lang)}</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {list.map(d => <SignedImg key={d.id} cache={priv.cache} path={d.image.thumbPath || d.image.path} alt={d.plateId} lang={lang} style={{ width: 96, height: 72, objectFit: 'contain', background: '#fbf9f4', borderRadius: 6 }} />)}
      </div>
    </div>
  );
}
