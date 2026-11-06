// "Approve & attach": links the current atlas drawing to a patient's exam, after an explicit doctor/admin click.
// Visible only when the `private_storage` flag is on AND the role may approve (doctor/admin). The data work lives in
// modules/atlas/attach.js; this component only collects the choice and shows the result.
import React, { useEffect, useMemo, useState } from 'react';
import { C } from '../../modules/theme/index.js';
import { t } from '../../modules/i18n/index.js';
import { pick, getPlate } from '../../modules/atlas/model.js';
import { canApproveDrawing, ATLAS_DRAWINGS_KEY } from '../../modules/atlas/drawings.js';
import { attachApprovedDrawing, setDrawingReport } from '../../modules/atlas/attach.js';
import { enablePrivateStorage, privateStorageEnabled } from '../../services/private-storage.js';
import { sbGet, sbMutate } from '../../modules/sync/wiring.js';
import { getSB } from '../../modules/data-access/index.js';
import { logAudit } from '../../modules/sync/index.js';

const norm = s => String(s == null ? '' : s).toLowerCase();
const same = (a, b) => String(a) === String(b);
const btn = (on, extra = {}) => ({
  background: on ? `${C.accent}22` : C.card, border: `1px solid ${on ? C.accent : C.border}`, color: on ? C.accent : C.text,
  borderRadius: 10, padding: '7px 11px', fontSize: 13, fontWeight: 600, cursor: 'pointer', minHeight: 36, ...extra
});

// A private image: the signed link is made on demand and renewed once if the browser fails to load it.
function SignedImg({ cache, path, alt, lang, style }) {
  const [url, setUrl] = useState('');
  const [failed, setFailed] = useState(false);
  const [tried, setTried] = useState(false);
  useEffect(() => {
    let live = true;
    setUrl(''); setFailed(false); setTried(false);
    if (path) cache.get(path).then(u => { if (live) setUrl(u); }).catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [cache, path]);
  const onError = () => {
    if (tried) { setFailed(true); return; }
    setTried(true);
    cache.get(path, { force: true }).then(setUrl).catch(() => setFailed(true));
  };
  if (failed) return <span style={{ fontSize: 11, color: C.danger }}>{t('atlas.attach.imgFail', lang)}</span>;
  return url ? <img src={url} alt={alt} onError={onError} style={style} /> : <span style={{ fontSize: 11, color: C.muted }}>…</span>;
}

export default function AttachDrawing({ lang, plate, annotations, renderBlobs, user, role, fixed = null }) {
  const priv = useMemo(() => {
    if (!privateStorageEnabled() || !canApproveDrawing(role)) return null;
    try { return enablePrivateStorage({ client: getSB() }); } catch { return null; }
  }, [role]);
  const [patients, setPatients] = useState([]);
  const [exams, setExams] = useState([]);
  const [q, setQ] = useState('');
  const [patient, setPatient] = useState(fixed ? fixed.patient : null);
  const [examId, setExamId] = useState(fixed ? fixed.exam.id : '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const reload = async () => { const e = await sbGet('iapp_exams'); if (Array.isArray(e)) setExams(e); };
  useEffect(() => {
    if (!priv) return undefined;
    let live = true;
    (async () => {
      const [p, e] = await Promise.all([sbGet('iapp_patients'), sbGet('iapp_exams')]);
      if (!live) return;
      if (Array.isArray(p)) setPatients(p);
      if (Array.isArray(e)) setExams(e);
    })();
    return () => { live = false; };
  }, [priv]);

  const found = useMemo(() => {
    const k = norm(q).trim();
    if (k.length < 2) return [];
    return patients.filter(p => norm(p.name).includes(k) || norm(p.patientCode).includes(k)).slice(0, 6);
  }, [q, patients]);
  const patientExams = useMemo(
    () => (patient ? exams.filter(e => same(e.patientId, patient.id)).sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))) : []),
    [exams, patient]
  );
  const exam = patientExams.find(e => same(e.id, examId)) || null;
  const drawings = exam && Array.isArray(exam[ATLAS_DRAWINGS_KEY]) ? exam[ATLAS_DRAWINGS_KEY] : [];
  const current = drawings.find(d => d.status === 'approved' && d.plateId === plate.id) || null;

  if (!priv) return null;
  const card = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 12 };
  const muted = { fontSize: 12, color: C.muted };

  const approve = async () => {
    setMsg(null);
    if (!annotations.length) { setMsg({ bad: true, text: t('atlas.attach.empty', lang) }); return; }
    setBusy(true);
    try {
      const { png, thumb } = await renderBlobs();
      const d = await attachApprovedDrawing({
        storage: priv.store, mutate: sbMutate, plate, annotations, png, thumb, patient, exam,
        user, role, replaceId: current ? current.id : null
      });
      logAudit('atlas.drawing.approve', `${d.plateId} v${d.revisions.length} exam ${exam.id}`);
      await reload();
      setMsg({ text: t('atlas.attach.done', lang) });
    } catch (e) {
      setMsg({ bad: true, text: e && e.orphanPath ? t('atlas.attach.orphan', lang) : t('atlas.attach.fail', lang) });
    } finally { setBusy(false); }
  };

  const toggleReport = async d => {
    setMsg(null);
    try {
      await setDrawingReport({ mutate: sbMutate, examId: exam.id, id: d.id, value: !d.includeInReport, user, role });
      logAudit('atlas.drawing.report', `${d.id} ${!d.includeInReport ? 'on' : 'off'}`);
      await reload();
    } catch { setMsg({ bad: true, text: t('atlas.attach.fail', lang) }); }
  };

  return (
    <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 15, fontWeight: 800 }}>{t('atlas.attach.title', lang)}</div>
      <div style={muted}>{t(fixed ? 'atlas.attach.helpFixed' : 'atlas.attach.help', lang)}</div>

      {fixed ? null : patient ? (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 700 }}>{patient.name}</span>
          <button style={btn(false)} onClick={() => { setPatient(null); setExamId(''); setQ(''); setMsg(null); }}>×</button>
        </div>
      ) : (
        <div>
          <input
            value={q} onChange={e => setQ(e.target.value)} placeholder={t('atlas.attach.search', lang)} aria-label={t('atlas.attach.patient', lang)}
            style={{ width: '100%', boxSizing: 'border-box', background: C.surface2, border: `1px solid ${C.border}`, color: C.text, borderRadius: 10, padding: '9px 12px', fontSize: 14 }}
          />
          {found.map(p => (
            <button key={p.id} onClick={() => setPatient(p)} style={{ ...btn(false), display: 'block', width: '100%', textAlign: 'start', border: 'none', background: 'transparent' }}>
              {p.name} <span style={{ color: C.muted, fontWeight: 400 }}>{p.patientCode ? `· ${p.patientCode}` : ''}</span>
            </button>
          ))}
        </div>
      )}

      {!fixed && patient ? (
        patientExams.length ? (
          <select value={examId} onChange={e => { setExamId(e.target.value); setMsg(null); }} aria-label={t('atlas.attach.exam', lang)}
            style={{ background: C.surface2, border: `1px solid ${C.border}`, color: C.text, borderRadius: 10, padding: '9px 12px', fontSize: 14 }}>
            <option value="">{t('atlas.attach.exam', lang)}: {t('atlas.attach.pick', lang)}</option>
            {patientExams.map(e => <option key={e.id} value={e.id}>{String(e.date || '').slice(0, 10)} {e.diagnosis ? `— ${String(e.diagnosis).slice(0, 40)}` : ''}</option>)}
          </select>
        ) : <div style={muted}>{t('atlas.attach.noExams', lang)}</div>
      ) : null}

      {exam ? (
        <>
          <div style={muted}>{t('atlas.attach.private', lang)}</div>
          <button style={btn(true, { alignSelf: 'flex-start' })} disabled={busy} onClick={approve}>
            {busy ? t('atlas.attach.busy', lang) : current ? t('atlas.attach.replace', lang) : t('atlas.attach.btn', lang)}
          </button>
        </>
      ) : null}
      {msg ? <div role={msg.bad ? 'alert' : 'status'} style={{ fontSize: 13, color: msg.bad ? C.danger : C.success || C.accent }}>{msg.text}</div> : null}

      {exam ? (
        <div>
          <div style={{ fontSize: 12, color: C.muted, marginBottom: 6 }}>{t('atlas.attach.list', lang)}</div>
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
          {drawings.length ? <div style={{ ...muted, marginTop: 4 }}>{t('atlas.attach.reportNote', lang)}</div> : null}
        </div>
      ) : null}
    </div>
  );
}

function plateTitle(id, lang) { try { return pick(getPlate(id).title, lang); } catch { return id; } }
