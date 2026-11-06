// Approve the current atlas drawing as part of the exam being edited, and list the exam's drawings.
// Works on the exam form's own drawing list (`drawings` / `onChange`): nothing is written anywhere until the doctor presses
// the normal "Save exam" button. Visible only to doctor/admin with the `private_storage` flag on.
import React, { useMemo, useState } from 'react';
import { C } from '../../modules/theme/index.js';
import { t } from '../../modules/i18n/index.js';
import { pick, getPlate } from '../../modules/atlas/model.js';
import { canApproveDrawing } from '../../modules/atlas/drawings.js';
import { approveIntoList, setReportInList } from '../../modules/atlas/attach.js';
import { getPrivateStorage } from './private-instance.js';
import SignedImg from './SignedImg.jsx';

const btn = (on, extra = {}) => ({
  background: on ? `${C.accent}22` : C.card, border: `1px solid ${on ? C.accent : C.border}`, color: on ? C.accent : C.text,
  borderRadius: 10, padding: '7px 11px', fontSize: 13, fontWeight: 600, cursor: 'pointer', minHeight: 36, ...extra
});
function plateTitle(id, lang) { try { return pick(getPlate(id).title, lang); } catch { return id; } }

export default function AttachDrawing({ lang, plate, annotations, renderBlobs, user, role, patient, exam, drawings = [], onChange }) {
  const priv = useMemo(() => (canApproveDrawing(role) ? getPrivateStorage() : null), [role]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  if (!priv) return null;

  const current = drawings.find(d => d.status === 'approved' && d.plateId === plate.id) || null;
  const muted = { fontSize: 12, color: C.muted };

  const approve = async () => {
    setMsg(null);
    if (!annotations.length) { setMsg({ bad: true, text: t('atlas.attach.empty', lang) }); return; }
    setBusy(true);
    try {
      const { png, thumb } = await renderBlobs();
      const { list } = await approveIntoList({ storage: priv.store, list: drawings, plate, annotations, png, thumb, patient, exam, user, role, replaceId: current ? current.id : null });
      onChange(list);
      setMsg({ text: t('atlas.attach.doneForm', lang) });
    } catch { setMsg({ bad: true, text: t('atlas.attach.fail', lang) }); } finally { setBusy(false); }
  };
  const toggleReport = d => {
    try { onChange(setReportInList({ list: drawings, id: d.id, value: !d.includeInReport, user, role })); } catch { setMsg({ bad: true, text: t('atlas.attach.fail', lang) }); }
  };

  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 15, fontWeight: 800 }}>{t('atlas.attach.title', lang)}</div>
      <div style={muted}>{t('atlas.attach.helpFixed', lang)}</div>
      <div style={muted}>{t('atlas.attach.private', lang)}</div>
      <button type="button" style={btn(true, { alignSelf: 'flex-start' })} disabled={busy} onClick={approve}>
        {busy ? t('atlas.attach.busy', lang) : current ? t('atlas.attach.replace', lang) : t('atlas.attach.btn', lang)}
      </button>
      {msg ? <div role={msg.bad ? 'alert' : 'status'} style={{ fontSize: 13, color: msg.bad ? C.danger : C.accent }}>{msg.text}</div> : null}

      <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>{t('atlas.attach.list', lang)}</div>
      {drawings.length === 0 ? <div style={muted}>{t('atlas.attach.none', lang)}</div> : null}
      {[...drawings].reverse().map(d => (
        <div key={d.id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '6px 0', borderTop: `1px solid ${C.border}`, opacity: d.status === 'approved' ? 1 : 0.65 }}>
          <SignedImg cache={priv.cache} path={d.image.thumbPath || d.image.path} alt={d.plateId} lang={lang} style={{ width: 72, height: 54, objectFit: 'contain', background: '#fbf9f4', borderRadius: 6 }} />
          <div style={{ flex: 1, fontSize: 12, lineHeight: 1.6 }}>
            <div style={{ fontWeight: 700 }}>{plateTitle(d.plateId, lang)} · {t('atlas.attach.version', lang)} {d.revisions.filter(r => r.action === 'approve' || r.action === 'edit').length}</div>
            <div style={{ color: C.muted }}>{t(`atlas.attach.status.${d.status}`, lang)} · {t('atlas.attach.by', lang)} {d.approvedByName || d.approvedBy} · {String(d.approvedAt).slice(0, 16).replace('T', ' ')}</div>
          </div>
          {d.status === 'approved' ? (
            <label style={{ fontSize: 12, display: 'flex', gap: 4, alignItems: 'center' }}>
              <input type="checkbox" checked={!!d.includeInReport} onChange={() => toggleReport(d)} />
              {t('atlas.attach.report', lang)}
            </label>
          ) : null}
        </div>
      ))}
      {drawings.length ? <div style={muted}>{t('atlas.attach.reportNote', lang)}</div> : null}
    </div>
  );
}
