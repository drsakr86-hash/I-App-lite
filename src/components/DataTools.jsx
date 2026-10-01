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
import { findDuplicatePatients, mergePatients, restoreSnapshot, trashRestore, trashDrop } from '../modules/datatools/index.js';

export default function DataTools({ isAdmin }) {
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
      return new Date(ts).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' });
    } catch {
      return '';
    }
  };
  const mb = n => (n >= 1048576 ? (n / 1048576).toFixed(1) + ' م.ب' : Math.round(n / 1024) + ' ك.ب');
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
      note('تعذر تحميل البيانات — تحقق من الاتصال', true);
    }
    setBusy('');
  };
  const importFile = async e => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (!window.confirm('سيتم استبدال البيانات الحالية بمحتوى الملف على كل الأجهزة. سيتم حفظ نسخة من البيانات الحالية أولاً. هل تريد المتابعة؟')) return;
    setBusy('import');
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const res = await restoreSnapshot(data, file.name);
      setBusy('');
      if (!res.ok) {
        note(res.error || 'تعذرت الاستعادة', true);
        return;
      }
      alert('✅ تمت الاستعادة (' + res.count + ' مجموعة بيانات). سيتم إعادة تشغيل البرنامج.');
      location.reload();
    } catch (err) {
      setBusy('');
      note('الملف غير صالح: ' + (err.message || err), true);
    }
  };
  const restoreBackup = async b => {
    if (!window.confirm('استعادة نسخة ' + fmt(b.at) + '؟ سيتم استبدال البيانات الحالية على كل الأجهزة.')) return;
    setBusy('restore');
    const res = await restoreSnapshot(b.data, 'نسخة ' + fmt(b.at));
    setBusy('');
    if (!res.ok) {
      note(res.error || 'تعذرت الاستعادة', true);
      return;
    }
    alert('✅ تمت الاستعادة. سيتم إعادة تشغيل البرنامج.');
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
      note('تعذر التحميل', true);
    }
  };
  const makeBackup = async () => {
    setBusy('make');
    const ok = await saveAutoBackup('يدوي');
    setBusy('');
    note(ok ? '✅ تم حفظ نسخة جديدة' : 'تعذر حفظ النسخة', !ok);
    if (ok) {
      const v = await sbGet(BACKUP_KEY);
      setBackups(Array.isArray(v) ? v : []);
    }
  };
  const doRestoreTrash = async t => {
    setBusy('t' + t.id);
    const ok = await trashRestore(t);
    setBusy('');
    if (ok) {
      setTrash(list => (list || []).filter(x => x.id !== t.id));
      note('✅ تمت الاستعادة');
    } else note('تعذرت الاستعادة', true);
  };
  const doDropTrash = async t => {
    if (!window.confirm('حذف نهائي؟ لا يمكن التراجع بعد ذلك.')) return;
    await trashDrop(t.id);
    setTrash(list => (list || []).filter(x => x.id !== t.id));
    logAudit('حذف نهائي من سلة المحذوفات', t.label || t.storeKey);
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
        marginLeft: 6
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
          <div style={{ color: C.text, fontSize: 13 }}>استعادة نسخة احتياطية من ملف</div>
          <div style={{ color: C.muted, fontSize: 11 }}>{busy === 'import' ? 'جاري الاستعادة...' : 'اختر ملف JSON سبق تصديره'}</div>
        </div>
        <div style={{ color: C.gold, fontSize: 12 }}>⬆</div>
        <input type="file" accept="application/json,.json" style={{ display: 'none' }} onChange={importFile} />
      </label>
      <Row icon="🗂" title="النسخ الاحتياطية التلقائية" sub="نسخة يومية تُحفظ تلقائياً — تُحفظ آخر 5 نسخ" which="backups" />
      {open === 'backups' && (
        <div style={box}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ color: C.muted, fontSize: 11 }}>{(backups || []).length} نسخة</span>
            <span
              onClick={makeBackup}
              style={{ color: C.teal, fontSize: 11, cursor: 'pointer', background: C.teal + '22', borderRadius: 8, padding: '4px 10px' }}
            >
              {busy === 'make' ? '⏳' : '+ نسخة الآن'}
            </span>
          </div>
          {(backups || []).length === 0 && (
            <div style={{ color: C.muted, fontSize: 12, textAlign: 'center', padding: '10px 0' }}>لا توجد نسخ بعد</div>
          )}
          {(backups || []).map(b => (
            <div key={b.id} style={{ ...line, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 150 }}>
                <div style={{ color: C.text, fontSize: 12 }}>{fmt(b.at)}</div>
                <div style={{ color: C.muted, fontSize: 10 }}>{b.reason || 'تلقائي'} · {mb(b.size || 0)} · {b.by || '—'}</div>
              </div>
              {btn(C.teal, () => downloadBackup(b), '⬇ تحميل')}
              {btn(C.gold, () => restoreBackup(b), busy === 'restore' ? '⏳' : '♻️ استعادة')}
            </div>
          ))}
        </div>
      )}
      <Row icon="🗑" title="سلة المحذوفات" sub={'يمكن استرجاع المحذوف خلال ' + TRASH_DAYS + ' يوماً'} which="trash" />
      {open === 'trash' && (
        <div style={box}>
          {(trash || []).length === 0 && (
            <div style={{ color: C.muted, fontSize: 12, textAlign: 'center', padding: '10px 0' }}>السلة فارغة</div>
          )}
          {(trash || []).map(t => (
            <div key={t.id} style={{ ...line, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 150 }}>
                <div style={{ color: C.text, fontSize: 12 }}>{t.label || t.storeKey}</div>
                <div style={{ color: C.muted, fontSize: 10 }}>
                  {fmt(t.deletedAt)} · حذفه {t.by || '—'}{t.record && t.record._imageDropped ? ' · بدون الصورة' : ''}
                </div>
              </div>
              {btn(C.success, () => doRestoreTrash(t), busy === 't' + t.id ? '⏳' : '↩ استرجاع')}
              {btn(C.danger, () => doDropTrash(t), '✕ نهائي')}
            </div>
          ))}
        </div>
      )}
      <Row icon="👯" title="ملفات مكررة" sub="مرضى بنفس الرقم أو نفس الاسم — يمكن دمجهم في ملف واحد" which="dups" />
      {open === 'dups' && (
        <div style={box}>
          {(dups || []).length === 0 && (
            <div style={{ color: C.muted, fontSize: 12, textAlign: 'center', padding: '10px 0' }}>لا توجد ملفات مكررة 👌</div>
          )}
          {(dups || []).map((g, i) => (
            <div key={i} style={{ ...line }}>
              <div style={{ color: C.text, fontSize: 12, fontWeight: 700, marginBottom: 4 }}>{g[0].name}</div>
              {g.map((p, idx) => (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                  <span style={{ color: C.muted, fontSize: 11, flex: 1, minWidth: 140 }}>
                    {p.patientCode || '—'} · {p.phone || 'بدون رقم'} · {p.name}{idx === 0 ? ' (الأساسي)' : ''}
                  </span>
                  {idx > 0 && btn(C.gold, async () => {
                    if (!window.confirm('دمج ملف ' + (p.patientCode || '') + ' داخل ' + (g[0].patientCode || '') + '؟ كل الزيارات والروشتات هتنتقل للملف الأساسي.')) return;
                    setBusy('m' + p.id);
                    const ok = await mergePatients(g[0], p);
                    setBusy('');
                    if (ok) {
                      setDups(list => list.map(x => x.filter(y => y.id !== p.id)).filter(x => x.length > 1));
                      note('✅ تم الدمج');
                    } else note('تعذر الدمج', true);
                  }, busy === 'm' + p.id ? '⏳' : '⇦ دمج في الأساسي')}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
      <Row icon="📜" title="سجل العمليات" sub="من قام بأي تعديل ومتى" which="audit" />
      {open === 'audit' && (
        <div style={box}>
          {(audit || []).length === 0 && (
            <div style={{ color: C.muted, fontSize: 12, textAlign: 'center', padding: '10px 0' }}>لا توجد عمليات مسجلة بعد</div>
          )}
          {(audit || []).slice(0, 200).map(a => (
            <div key={a.id} style={line}>
              <div style={{ color: C.text, fontSize: 12 }}>{a.action}{a.details ? ' — ' + a.details : ''}</div>
              <div style={{ color: C.muted, fontSize: 10 }}>
                {fmt(a.ts)} · {a.by || '—'}{a.role ? ' (' + (ROLE_LABEL[a.role] || a.role) + ')' : ''}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
