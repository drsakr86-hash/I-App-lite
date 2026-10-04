import React, { useState, useMemo } from 'react';
import { C } from '../../modules/theme/index.js';
import { Modal } from '../../components/common.jsx';
import { t, useLang } from '../../modules/i18n/index.js';
import { buildEyeReport, renderEyeReport, latestExamOf } from '../../modules/patient-file/eye-report.js';
import { printDoc } from '../../modules/print/index.js';

// Comprehensive eye report (exam + vision + treatment) in Arabic, English or both.
export function eyeReportExams(exams) {
  return (Array.isArray(exams) ? exams : [])
    .filter(e => e && typeof e === 'object' && !Array.isArray(e.requestedTests) && e.date)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

export default function EyeReportModal({ ctx, onClose }) {
  const lang = useLang();
  const list = useMemo(() => eyeReportExams(ctx.exams), [ctx.exams]);
  const latest = latestExamOf(list);
  const [examId, setExamId] = useState(latest ? String(latest.id) : '');
  const [langs, setLangs] = useState(lang === 'en' ? 'en' : 'ar');
  const [error, setError] = useState('');
  const generate = () => {
    try {
      const exam = list.find(e => String(e.id) === examId) || null;
      const model = buildEyeReport({
        patient: ctx.curPatient, exam, exams: list, visits: ctx.visits, rxList: ctx.rxList,
        requests: ctx.requests, images: ctx.images, imagingOrders: ctx.imagingOrders,
        coreFile: ctx.coreFile, injections: ctx.injections, appointments: ctx.appointments,
        clinic: ctx.clinic, doctor: ctx.primaryDoctor, today: new Date().toISOString().slice(0, 10)
      });
      printDoc(renderEyeReport(model, langs === 'both' ? ['ar', 'en'] : [langs]));
      setError('');
    } catch (e) {
      setError(lang === 'en' ? 'Could not build the report.' : 'تعذّر إنشاء التقرير.');
    }
  };
  const sel = { width: '100%', minHeight: 44, padding: '0 10px', borderRadius: 8, border: '1px solid ' + C.border, background: C.card, color: C.text, fontSize: 14 };
  return (
    <Modal title={'📄 ' + t('report.title', lang)} onClose={onClose}>
      <div style={{ display: 'grid', gap: 14 }}>
        <label style={{ display: 'grid', gap: 6, color: C.text, fontSize: 13 }}>
          {t('report.language', lang)}
          <select value={langs} onChange={e => setLangs(e.target.value)} style={sel} aria-label={t('report.language', lang)}>
            <option value="ar">{t('report.lang.ar', lang)}</option>
            <option value="en">{t('report.lang.en', lang)}</option>
            <option value="both">{t('report.lang.both', lang)}</option>
          </select>
        </label>
        {list.length === 0 ? (
          <div role="note" style={{ color: C.muted, fontSize: 13 }}>{t('report.noExam', lang)}</div>
        ) : (
          <label style={{ display: 'grid', gap: 6, color: C.text, fontSize: 13 }}>
            {t('report.exam', lang)}
            <select value={examId} onChange={e => setExamId(e.target.value)} style={sel} aria-label={t('report.exam', lang)}>
              {list.map(e => <option key={e.id} value={String(e.id)}>{String(e.date).slice(0, 10)}{e.doctor ? ' — ' + e.doctor : ''}</option>)}
            </select>
          </label>
        )}
        <div style={{ color: C.muted, fontSize: 12 }}>{t('report.free', lang)} · {t('report.hint', lang)}</div>
        {error && <div role="alert" style={{ color: C.danger || '#c0392b', fontSize: 13 }}>{error}</div>}
        <button type="button" className="ds-btn ds-btn--primary" onClick={generate} style={{ minHeight: 44 }}>{t('report.generate', lang)}</button>
      </div>
    </Modal>
  );
}
