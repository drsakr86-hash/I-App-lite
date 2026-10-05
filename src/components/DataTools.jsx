// DataTools -- moved here from public/legacy/app-runtime.js (Phase 8,
// combined batch 19). Exact copy of the original JSX/logic, now a React
// component instead of a legacy function. Every dependency it needs was
// already moved in earlier batches; the merge/restore/trash orchestration
// itself lives in src/modules/datatools/datatools-core.js.
import React, { useState } from 'react';
import { C } from '../modules/theme/index.js';
import { sbGet } from '../modules/sync/index.js';
import { BACKUP_KEY, TRASH_KEY, AUDIT_KEY, TRASH_DAYS } from '../modules/sync/engine.js';
import { logAudit, saveAutoBackup } from '../modules/sync/audit-trash-backup.js';
import { localISO, ROLE_LABEL } from '../modules/constants/misc.js';
import { t, useLang } from '../modules/i18n/index.js';
import { tv } from '../modules/i18n/tv.js';
import { findDuplicatePatients, mergePatients, restoreSnapshot, trashRestore, trashDrop } from '../modules/datatools/index.js';

export default function DataTools({ isAdmin }) {
  const lang = useLang();
  const [open, setOpen] = useState('');
  const [backups, setBackups] = useState(null);
  const [trash, setTrash] = useState(null);
  const [audit, setAudit] = useState(null);
  const [dups, setDups] = useState(null);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState(null);
  if (!isAdmin) return null;
  const note = (text, err) => {
    setMsg({ text, err });
    setTimeout(() => setMsg(null), 4000);
  };
  const fmt = ts => {
    try {
      return new Date(ts).toLocaleString(lang === 'en' ? 'en-GB' : 'ar-EG', { dateStyle: 'short', timeStyle: 'short' });
    } catch {
      return '';
    }
  };
  const tr = (key, vars) => t(key, lang, vars);
  // Trash labels / audit details are stored in Arabic ("مريض مدمج: name", "... · N مجموعة بيانات"); show them in the current language.
  const trashLabel = label => {
    const s = String(label || '');
    const i = s.indexOf(': ');
    return i > 0 ? tv(s.slice(0, i)) + s.slice(i) : tv(s);
  };
  const auditDetail = d => trashLabel(String(d)
    .replace(/ مجموعة بيانات$/, ' ' + tr('g4.audit.datasetsSuffix'))
    .replace(/^نسخة /, tr('g4.audit.backupWord') + ' ')
    .replace(/ ج\.م/g, ' ' + t('g4.common.currency', lang)));
  const mb = n => (n >= 1048576 ? (n / 1048576).toFixed(1) + ' ' + t('g4.dt.mb', lang) : Math.round(n / 1024) + ' ' + t('g4.dt.kb', lang));
  const load = async which => {
    setOpen(o => (o === which ? '' : which));
    if (open === which) return;
    setBusy(which);
    try {
      if (which === 'backups') {
        const v = await sbGet(BACKUP_KEY);
        setBackups(Array.isArray(v) ? v : []);
      }
      if (which === 'trash') {
        const v = await sbGet(TRASH_KEY);
        setTrash(Array.isArray(v) ? v : []);
      }
      if (which === 'audit') {
        const v = await sbGet(AUDIT_KEY);
        setAudit(Array.isArray(v) ? v : []);
      }
      if (which === 'dups') {
        const v = await sbGet('iapp_patients');
        setDups(findDuplicatePatients(Array.isArray(v) ? v : []));
      }
    } catch (e) {
      note(t('g4.dt.loadFail', lang), true);
    }
    setBusy('');
  };
  const importFile = async e => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (!window.confirm(t('g4.dt.importConfirm', lang))) return;
    setBusy('import');
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const res = await restoreSnapshot(data, file.name);
      setBusy('');
      if (!res.ok) {
        note(res.error || t('g4.dt.restoreFail', lang), true);
        return;
      }
      alert(t('g4.dt.importOk', lang, { n: res.count }));
      location.reload();
    } catch (err) {
      setBusy('');
      note(t('g4.dt.invalidFile', lang, { msg: err.message || err }), true);
    }
  };
  const restoreBackup = async b => {
    if (!window.confirm(t('g4.dt.restoreBackupConfirm', lang, { date: fmt(b.at) }))) return;
    setBusy('restore');
    const res = await restoreSnapshot(b.data, t('g4.dt.restoreLabel', 'ar', { date: fmt(b.at) }));
    setBusy('');
    if (!res.ok) {
      note(res.error || t('g4.dt.restoreFail', lang), true);
      return;
    }
    alert(t('g4.dt.restoreOk', lang));
    location.reload();
  };
  const downloadBackup = b => {
    try {
      const blob = new Blob([JSON.stringify(b.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = url;
      a.download = 'iapp-backup-' + localISO(new Date(b.at)) + '.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 3000);
    } catch (e) {
      note(t('g4.dt.downloadFail', lang), true);
    }
  };
  const makeBackup = async () => {
    setBusy('make');
    const ok = await saveAutoBackup(t('g4.backup.manual', 'ar'));
    setBusy('');
    note(ok ? t('g4.dt.backupSaved', lang) : t('g4.dt.backupFail', lang), !ok);
    if (ok) {
      const v = await sbGet(BACKUP_KEY);
      setBackups(Array.isArray(v) ? v : []);
    }
  };
  const doRestoreTrash = async en => {
    setBusy('t' + en.id);
    const ok = await trashRestore(en);
    setBusy('');
    if (ok) {
      setTrash(list => (list || []).filter(x => x.id !== en.id));
      note(t('g4.dt.trashRestored', lang));
    } else note(t('g4.dt.restoreFail', lang), true);
  };
  const doDropTrash = async en => {
    if (!window.confirm(t('g4.dt.dropConfirm', lang))) return;
    await trashDrop(en.id);
    setTrash(list => (list || []).filter(x => x.id !== en.id));
    logAudit(t('g4.audit.trashDrop', 'ar'), en.label || en.storeKey);
  };
  const Row = ({ icon, title, sub, badge, which }) => (
    <div
      onClick={() => load(which)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '13px 14px',
        background: C.card,
        border: `1px solid ${open === which ? C.accent + '66' : C.border}`,
        borderRadius: 12,
        marginBottom: 8,
        cursor: 'pointer'
      }}
    >
      <div style={{ width: 34, height: 34, borderRadius: 10, background: C.accent + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>{icon}</div>
      <div style={{ flex: 1 }}>
        <div style={{ color: C.text, fontSize: 13 }}>{title}</div>
        <div style={{ color: C.muted, fontSize: 11 }}>{sub}</div>
      </div>
      {busy === which ? (
        <span style={{ color: C.muted, fontSize: 12 }}>⏳</span>
      ) : (
        <span style={{ color: C.accent, fontSize: 12 }}>{open === which ? '▲' : '▼'}</span>
      )}
    </div>
  );
  const box = {
    background: C.bg,
    border: `1px solid ${C.border}`,
    borderRadius: 12,
    padding: '10px 12px',
    marginBottom: 10,
    maxHeight: 320,
    overflowY: 'auto'
  };
  const line = {
    borderBottom: `1px solid ${C.border}55`,
    padding: '9px 0'
  };
  const btn = (color, onClick, children) => (
    <span
      onClick={onClick}
      style={{
        background: color + '22',
        border: `1px solid ${color}55`,
        color,
        borderRadius: 8,
        padding: '4px 10px',
        fontSize: 11,
        cursor: 'pointer',
        marginInlineStart: 6
      }}
    >
      {children}
    </span>
  );
  return (
    <div style={{ marginBottom: 16 }}>
      {msg && (
        <div
          style={{
            background: (msg.err ? C.danger : C.success) + '22',
            border: `1px solid ${msg.err ? C.danger : C.success}44`,
            color: msg.err ? C.danger : C.success,
            borderRadius: 10,
            padding: '9px 12px',
            fontSize: 12,
            textAlign: 'center',
            marginBottom: 8
          }}
        >
          {msg.text}
        </div>
      )}
      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '13px 14px',
          background: C.card,
          border: `1px solid ${C.border}`,
          borderRadius: 12,
          marginBottom: 8,
          cursor: 'pointer'
        }}
      >
        <div style={{ width: 34, height: 34, borderRadius: 10, background: C.gold + '33', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>♻️</div>
        <div style={{ flex: 1 }}>
          <div style={{ color: C.text, fontSize: 13 }}>{t('g4.dt.importTitle', lang)}</div>
          <div style={{ color: C.muted, fontSize: 11 }}>{busy === 'import' ? t('g4.dt.importing', lang) : t('g4.dt.importSub', lang)}</div>
        </div>
        <div style={{ color: C.gold, fontSize: 12 }}>⬆</div>
        <input type="file" accept="application/json,.json" style={{ display: 'none' }} onChange={importFile} />
      </label>
      <Row icon="🗂" title={t('g4.dt.backupsTitle', lang)} sub={t('g4.dt.backupsSub', lang)} which="backups" />
      {open === 'backups' && (
        <div style={box}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ color: C.muted, fontSize: 11 }}>{t('g4.dt.backupCount', lang, { n: (backups || []).length })}</span>
            <span
              onClick={makeBackup}
              style={{ color: C.teal, fontSize: 11, cursor: 'pointer', background: C.teal + '22', borderRadius: 8, padding: '4px 10px' }}
            >
              {busy === 'make' ? '⏳' : t('g4.dt.makeNow', lang)}
            </span>
          </div>
          {(backups || []).length === 0 && (
            <div style={{ color: C.muted, fontSize: 12, textAlign: 'center', padding: '10px 0' }}>{t('g4.dt.noBackups', lang)}</div>
          )}
          {(backups || []).map(b => (
            <div key={b.id} style={{ ...line, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 150 }}>
                <div style={{ color: C.text, fontSize: 12 }}>{fmt(b.at)}</div>
                <div style={{ color: C.muted, fontSize: 10 }}>{tv(b.reason || t('g4.backup.auto', 'ar'))} · {mb(b.size || 0)} · {b.by || '—'}</div>
              </div>
              {btn(C.teal, () => downloadBackup(b), t('g4.dt.download', lang))}
              {btn(C.gold, () => restoreBackup(b), busy === 'restore' ? '⏳' : t('g4.dt.restore', lang))}
            </div>
          ))}
        </div>
      )}
      <Row icon="🗑" title={t('g4.dt.trashTitle', lang)} sub={t('g4.dt.trashSub', lang, { n: TRASH_DAYS })} which="trash" />
      {open === 'trash' && (
        <div style={box}>
          {(trash || []).length === 0 && (
            <div style={{ color: C.muted, fontSize: 12, textAlign: 'center', padding: '10px 0' }}>{t('g4.dt.trashEmpty', lang)}</div>
          )}
          {(trash || []).map(en => (
            <div key={en.id} style={{ ...line, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 150 }}>
                <div style={{ color: C.text, fontSize: 12 }}>{trashLabel(en.label) || en.storeKey}</div>
                <div style={{ color: C.muted, fontSize: 10 }}>
                  {fmt(en.deletedAt)} · {tr('g4.dt.deletedBy', { name: en.by || '—' })}{en.record && en.record._imageDropped ? tr('g4.dt.noImage') : ''}
                </div>
              </div>
              {btn(C.success, () => doRestoreTrash(en), busy === 't' + en.id ? '⏳' : tr('g4.dt.undo'))}
              {btn(C.danger, () => doDropTrash(en), tr('g4.dt.permanent'))}
            </div>
          ))}
        </div>
      )}
      <Row icon="👯" title={t('g4.dt.dupsTitle', lang)} sub={t('g4.dt.dupsSub', lang)} which="dups" />
      {open === 'dups' && (
        <div style={box}>
          {(dups || []).length === 0 && (
            <div style={{ color: C.muted, fontSize: 12, textAlign: 'center', padding: '10px 0' }}>{t('g4.dt.noDups', lang)}</div>
          )}
          {(dups || []).map((g, i) => (
            <div key={i} style={{ ...line }}>
              <div style={{ color: C.text, fontSize: 12, fontWeight: 700, marginBottom: 4 }}>{g[0].name}</div>
              {g.map((p, idx) => (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                  <span style={{ color: C.muted, fontSize: 11, flex: 1, minWidth: 140 }}>
                    {p.patientCode || '—'} · {p.phone || t('g4.dt.noPhone', lang)} · {p.name}{idx === 0 ? t('g4.dt.primaryTag', lang) : ''}
                  </span>
                  {idx > 0 && btn(C.gold, async () => {
                    if (!window.confirm(t('g4.dt.mergeConfirm', lang, { from: p.patientCode || '', to: g[0].patientCode || '' }))) return;
                    setBusy('m' + p.id);
                    const ok = await mergePatients(g[0], p);
                    setBusy('');
                    if (ok) {
                      setDups(list => list.map(x => x.filter(y => y.id !== p.id)).filter(x => x.length > 1));
                      note(t('g4.dt.merged', lang));
                    } else note(t('g4.dt.mergeFail', lang), true);
                  }, busy === 'm' + p.id ? '⏳' : t('g4.dt.mergeBtn', lang))}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
      <Row icon="📜" title={t('g4.dt.auditTitle', lang)} sub={t('g4.dt.auditSub', lang)} which="audit" />
      {open === 'audit' && (
        <div style={box}>
          {(audit || []).length === 0 && (
            <div style={{ color: C.muted, fontSize: 12, textAlign: 'center', padding: '10px 0' }}>{t('g4.dt.noAudit', lang)}</div>
          )}
          {(audit || []).slice(0, 200).map(a => (
            <div key={a.id} style={line}>
              <div style={{ color: C.text, fontSize: 12 }}>{tv(a.action)}{a.details ? ' — ' + auditDetail(a.details) : ''}</div>
              <div style={{ color: C.muted, fontSize: 10 }}>
                {fmt(a.ts)} · {a.by || '—'}{a.role ? ' (' + tv(ROLE_LABEL[a.role] || a.role) + ')' : ''}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
