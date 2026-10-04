// Live data layer behind the patient-file screen (src/screens/PatientFile.jsx is
// presentational and only reads the `ctx` object this hook builds).
//
// Data flow (see docs/PATIENT360.md):
//   legacy stores (props)  ┐
//   Core 360 payload       ├─> normalizePatientFile() ─> exams/requests/visits/rx/images
//   image metadata store   ┘                         └─> buildPatientTimeline()
//
// Rules this hook enforces:
//   * every async load is guarded by an `active` flag, so a response that arrives
//     after the patient changed (or the file closed) is discarded;
//   * the component is mounted with key={patient.id} (PatientsContainer), so no
//     state can leak from one patient to the next;
//   * every save runs through a per-operation lock (double click = one write);
//   * a success message is shown only when every required step succeeded; partial
//     and local-only outcomes are reported as such.
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { C } from '../theme/index.js';
import { getSB, iappRpc } from '../data-access/index.js';
import { offlineNow, busOn, isDirty, LS, useSyncStatus } from '../sync/engine.js';
import { sbGet, queueSave, sbMutate } from '../sync/wiring.js';
import { trashPut, logAudit } from '../sync/index.js';
import { localDateStr, localTimeStr, localISO } from '../constants/misc.js';
import { DEFAULT_TESTS } from '../constants/exams.js';
import { createClinicalVisitCore } from '../visits/core.js';
import { imagingRequestParams } from '../investigations/investigation.mapper.js';
import { getPatient360 } from '../patients/index.js';
import { EYE_CYCLE } from '../radiology/model.js';
import { normalizePatientFile, buildPatientTimeline, filterPatientTimeline, coreFileMatchesPatient } from './normalize.js';
import { submitInvestigationRequest, resyncInvestigationRequest } from './request-workflow.js';
import { interpretSaveResult, interpretWriteOk, connectionState } from './save-state.js';
import { buildClinicalSummary } from './clinical-summary.js';
import { buildLongitudinal } from './longitudinal.js';
import { buildInvestigationLinks } from './investigation-links.js';
import { logError } from '../../services/logger.js';

const CLD_CLOUD = 'daihhusnc';
const CLD_PRESET = 'iapp_clinic';
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const DIRTY_MODAL_MSG = 'لديك تغييرات غير محفوظة. هل تريد تجاهلها وإغلاق النافذة؟';

const isCoreOnly = rec => !!rec && Array.isArray(rec._sources) && rec._sources.length > 0 && !rec._sources.includes('legacy');
const errMsg = e => (e && (e.message || e.hint)) || String(e || 'خطأ غير معروف');

export function usePatientFile({
  patient, allExams, allRx, allVisits, onClose, onUpdatePatient,
  onSaveExam, onDelExam, onSaveVisit, onDelVisit, onSaveRx, onSaveRadiologyRequest,
  doctorNames = [], primaryDoctor, prices = [], clinic, customTests = []
}) {
  const [tab, setTab] = useState('info');
  const [timelineSearch, setTimelineSearch] = useState('');
  const [timelineFilter, setTimelineFilter] = useState('All');
  const [modal, setModalRaw] = useState(null);
  const [delTarget, setDelTargetRaw] = useState(null);
  const [saveStatus, setSaveStatus] = useState(null); // { kind, message, at }
  const [focusRec, setFocusRec] = useState(null);

  const activeRef = useRef(true);
  useEffect(() => { activeRef.current = true; return () => { activeRef.current = false; }; }, []);
  const locks = useRef(new Set());
  const modalDirty = useRef(false);

  const report = useCallback((kind, message) => {
    if (activeRef.current) setSaveStatus({ kind, message, at: Date.now() });
  }, []);
  const dismissStatus = useCallback(() => setSaveStatus(null), []);

  // Per-operation lock: a second call with the same key while the first is
  // running is ignored (double click / double Enter).
  const exclusive = useCallback(async (key, fn) => {
    if (locks.current.has(key)) return undefined;
    locks.current.add(key);
    try { return await fn(); } finally { locks.current.delete(key); }
  }, []);

  // ---- modal handling with unsaved-changes protection ------------------------
  const setModal = useCallback(next => {
    if (next === null) {
      if (modalDirty.current && !window.confirm(DIRTY_MODAL_MSG)) return;
      modalDirty.current = false;
    } else {
      modalDirty.current = false;
    }
    setModalRaw(next);
  }, []);
  const closeModalClean = useCallback(() => { modalDirty.current = false; setModalRaw(null); }, []);
  const markModalDirty = useCallback(() => { modalDirty.current = true; }, []);

  // ---- Core Patient 360 load ---------------------------------------------------
  const [coreFile, setCoreFile] = useState(null);
  const [coreSource, setCoreSource] = useState('none');
  const [coreStatus, setCoreStatus] = useState({ state: 'idle', error: null, loadedAt: null });
  const [refreshTick, setRefreshTick] = useState(0);
  const refreshAll = useCallback(() => setRefreshTick(n => n + 1), []);

  useEffect(() => {
    let active = true;
    const code = patient && patient.patientCode;
    const sb = getSB();
    if (!sb || !code) { setCoreStatus({ state: 'unavailable', error: null, loadedAt: null }); return undefined; }
    if (offlineNow()) { setCoreStatus(s => ({ ...s, state: 'offline' })); return undefined; }
    setCoreStatus(s => ({ ...s, state: 'loading', error: null }));
    getPatient360(sb, code).then(data => {
      if (!active) return;
      const raw = data && typeof data === 'object' ? data : null;
      const file = raw ? { ...raw, ...(raw.patient || {}) } : null;
      if (!file || !coreFileMatchesPatient(file, patient)) {
        setCoreStatus({ state: 'error', error: 'بيانات السجل المركزي لا تخص هذا المريض وتم تجاهلها', loadedAt: null });
        return;
      }
      setCoreFile(file);
      setCoreSource(file._source || '360');
      setCoreStatus({ state: 'ready', error: null, loadedAt: file._loadedAt || new Date().toISOString() });
    }).catch(e => {
      if (!active) return;
      console.warn('Core Patient 360 unavailable; using legacy Patient File:', errMsg(e));
      setCoreStatus(s => ({ state: 'error', error: errMsg(e), loadedAt: s.loadedAt }));
    });
    return () => { active = false; };
  }, [patient.id, patient.patientCode, refreshTick]);

  // ---- image metadata (iapp_imgmeta_<patientId>) ----------------------------------
  const metaKey = 'iapp_imgmeta_' + patient.id;
  const [metaImages, setMetaImages] = useState(() => {
    try { const c = LS.get('iapp_imgmeta_' + patient.id); const p = c ? JSON.parse(c) : []; return Array.isArray(p) ? p : []; } catch { return []; }
  });
  const [viewImg, setViewImg] = useState(null);
  const [imgLoading, setImgLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null);
  const [imgError, setImgError] = useState(null);
  const [aiAnalysis, setAiAnalysis] = useState({});
  const [imageType, setImageType] = useState('OCT');
  const [imageEye, setImageEye] = useState('OU');
  const [imageOrderId, setImageOrderId] = useState('');
  const [imageFilter, setImageFilter] = useState('الكل');

  useEffect(() => {
    let active = true;
    let channel;
    const offBus = busOn(metaKey, v => { if (active && Array.isArray(v)) setMetaImages(v); });
    (async () => {
      setImgLoading(true);
      try {
        const remote = await sbGet(metaKey);
        if (!active) return;
        if (Array.isArray(remote)) {
          setMetaImages(remote);
          if (!isDirty(metaKey)) LS.set(metaKey, JSON.stringify(remote));
        }
      } catch (e) {
        if (active) setImgError('تعذر تحميل بيانات الصور من السيرفر. يتم عرض آخر نسخة محفوظة على هذا الجهاز.');
        console.warn('img meta load:', e);
      }
      if (active) setImgLoading(false);
    })();
    try {
      const sb = getSB();
      if (sb) channel = sb.channel('iapp_imgmeta_' + patient.id).on('postgres_changes', {
        event: '*', schema: 'public', table: 'iapp_store', filter: `key=eq.${metaKey}`
      }, payload => {
        const next = payload && payload.new && payload.new.value;
        if (active && Array.isArray(next) && !isDirty(metaKey)) {
          setMetaImages(next);
          LS.set(metaKey, JSON.stringify(next));
        }
      }).subscribe();
    } catch (e) {
      console.warn('image realtime unavailable', e);
    }
    return () => {
      active = false;
      offBus();
      if (channel) { try { getSB().removeChannel(channel); } catch (e) { console.warn('removeChannel', e); } }
    };
  }, [metaKey, patient.id]);

  // ---- imaging orders (iapp_imaging_orders) -------------------------------------------
  const [imagingOrders, setImagingOrders] = useState([]);
  const [ordersError, setOrdersError] = useState(null);
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const o = await sbGet('iapp_imaging_orders');
        if (!active) return;
        setImagingOrders(Array.isArray(o) ? o.filter(x => x && x.patientId === patient.id) : []);
        setOrdersError(Array.isArray(o) || o === null ? null : 'تعذر قراءة حالة الطلبات');
      } catch (e) {
        if (active) setOrdersError('تعذر قراءة حالة الطلبات: ' + errMsg(e));
      }
    })();
    return () => { active = false; };
  }, [patient.id, refreshTick]);

  // ---- injections + appointments (read-only inputs for summary / comparison) ---------------
  const [injections, setInjections] = useState([]);
  const [appointments, setAppointments] = useState([]);
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [inj, apt] = await Promise.all([sbGet('iapp_injections'), sbGet('iapp_appointments')]);
        if (!active) return;
        setInjections(Array.isArray(inj) ? inj.filter(x => x && x.patientId === patient.id) : []);
        setAppointments(Array.isArray(apt) ? apt.filter(x => x && x.patientId === patient.id) : []);
      } catch (e) {
        logError('patientFile.loadInjections', e, { patientId: patient.id });
      }
    })();
    return () => { active = false; };
  }, [patient.id, refreshTick]);

  // ---- normalised, de-duplicated view of the whole chart ---------------------------------
  const norm = useMemo(() => normalizePatientFile({
    patient, coreFile,
    legacy: { exams: allExams, rx: allRx, visits: allVisits },
    metaImages, today: localDateStr()
  }), [patient, coreFile, allExams, allRx, allVisits, metaImages]);
  const { exams, requests, patientRecords, rxList, visits, images } = norm;

  const today = localDateStr();
  const summary = useMemo(() => buildClinicalSummary({
    patient, exams, visits, requests, rxList, images, imagingOrders, coreFile, injections, appointments, today
  }), [patient, exams, visits, requests, rxList, images, imagingOrders, coreFile, injections, appointments, today]);
  const longitudinal = useMemo(() => buildLongitudinal({ exams, injections, patientId: patient.id }), [exams, injections, patient.id]);
  const investigationLinks = useMemo(() => buildInvestigationLinks({ requests, images, imagingOrders, visits, today }), [requests, images, imagingOrders, visits, today]);

  const timelineEvents = useMemo(() => buildPatientTimeline({ ...norm, coreFile, patient }, C), [norm, coreFile, patient]);
  const filteredTimeline = useMemo(() => filterPatientTimeline(timelineEvents, timelineFilter, timelineSearch), [timelineEvents, timelineFilter, timelineSearch]);
  const coreJourneyCount = ['visits', 'examinations', 'diagnoses', 'treatments', 'prescriptions', 'investigation_orders', 'imaging_studies', 'followups']
    .reduce((s, k) => s + (Array.isArray(coreFile && coreFile[k]) ? coreFile[k].length : 0), 0);
  const totalSpent = useMemo(() => visits.reduce((s, v) => s + (v.paid ? Number(v.cost || 0) : 0), 0), [visits]);

  const TABS = [
    { id: 'info', label: 'نظرة عامة', icon: '👤' },
    { id: 'timeline', label: 'السجل الزمني', icon: '🕘' },
    { id: 'visits', label: 'الزيارات', icon: '🗓' },
    { id: 'exams', label: 'الفحوصات', icon: '🔍' },
    { id: 'requests', label: 'طلبات الفحوصات', icon: '🩻' },
    { id: 'treatment', label: 'العلاج', icon: '💊' },
    { id: 'rx', label: 'الوصفات', icon: '🔬' },
    { id: 'images', label: 'الصور الطبية', icon: 'oct' },
    { id: 'compare', label: 'المقارنة', icon: '📊' }
  ];

  // Timeline -> source record navigation.
  const openSource = useCallback(ev => {
    if (!ev || !ev.source) return;
    setTab(ev.source.tab);
    setFocusRec({ tab: ev.source.tab, id: ev.source.id, at: Date.now() });
  }, []);
  useEffect(() => {
    if (!focusRec) return undefined;
    const t = setTimeout(() => {
      try {
        const el = document.querySelector(`[data-rec="${CSS.escape(String(focusRec.id))}"]`);
        if (el) {
          el.scrollIntoView({ block: 'center', behavior: 'smooth' });
          const prev = el.style.outline;
          el.style.outline = `2px solid ${C.accent}`;
          setTimeout(() => { el.style.outline = prev; }, 2200);
        }
      } catch (e) { /* DOM not available (tests) */ }
    }, 60);
    return () => clearTimeout(t);
  }, [focusRec, tab]);

  // ---- patient header record ----------------------------------------------------------------
  const [curPatient, setCurPatient] = useState(patient);
  useEffect(() => { setCurPatient(patient); }, [patient]);

  // ---- image upload / edit -------------------------------------------------------------------
  const persistMeta = async imgs => {
    const meta = imgs.map(i => ({
      id: i.id, public_id: i.public_id, name: i.name, date: i.date, time: i.time || '',
      src: i.src, notes: i.notes || '', type: i.type || 'صورة طبية', eye: i.eye || 'OU',
      examId: i.examId || null, orderId: i.orderId || null
    }));
    const synced = await queueSave(metaKey, meta);
    return { meta, synced: synced !== false };
  };
  const mergeImageMeta = async operation => {
    const remote = await sbGet(metaKey);
    const base = Array.isArray(remote) ? remote : metaImages;
    const next = operation(base);
    const { meta, synced } = await persistMeta(next);
    if (activeRef.current) setMetaImages(meta);
    return { next: meta, synced };
  };

  const analyzeImage = async img => {
    if (!img || !img.src) return;
    setAiAnalysis(prev => ({
      ...prev,
      [img.id]: { loading: false, result: null, error: 'تحليل AI غير مفعّل في نسخة المتصفح الحالية. يجب ربطه عبر Backend / Supabase Edge Function بشكل آمن.' }
    }));
  };

  const uploadOneFile = async function (file) {
    const setProg = v => { if (activeRef.current) setUploadProgress(v); };
    if (file.size > MAX_IMAGE_BYTES) {
      if (activeRef.current) setImgError(`الملف ${file.name} أكبر من 10 ميجابايت ولم يُرفع`);
      return false;
    }
    setProg({ name: file.name, pct: 10 });
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', CLD_PRESET);
    formData.append('folder', 'iapp/patient_' + patient.id);
    let data;
    try {
      const res = await fetch('https://api.cloudinary.com/v1_1/' + CLD_CLOUD + '/image/upload', { method: 'POST', body: formData });
      setProg({ name: file.name, pct: 80 });
      data = await res.json().catch(() => null);
      if (!res.ok) throw new Error((data && data.error && data.error.message) || res.status);
    } catch (err) {
      if (activeRef.current) setImgError(`فشل رفع ${file.name}: ${errMsg(err)}. لم تتم إضافة الصورة للملف.`);
      return false;
    }
    const newImg = {
      id: data.public_id, public_id: data.public_id, name: file.name, date: localISO(),
      time: new Date().toTimeString().slice(0, 5), src: data.secure_url, notes: '',
      type: imageType, eye: imageEye, examId: null, orderId: imageOrderId || null
    };
    setProg({ name: file.name, pct: 100 });
    try {
      const r = await mergeImageMeta(base => [newImg, ...base.filter(x => x.id !== newImg.id)]);
      if (!r.synced && activeRef.current) setImgError(`تم رفع ${file.name} وحُفظت بياناته على هذا الجهاز وستُزامن عند توفر الاتصال.`);
      return true;
    } catch (err) {
      // The file exists in Cloudinary but its record was not saved: say so, with the URL for recovery.
      if (activeRef.current) setImgError(`رُفع ${file.name} لكن تعذر حفظ بياناته في الملف (${errMsg(err)}). الرابط: ${data.secure_url}`);
      return false;
    }
  };

  const handleImgUpload = function (e) {
    const files = Array.from(e.target.files || []).filter(f => f.type.startsWith('image/'));
    e.target.value = '';
    if (!files.length) return;
    setImgError(null);
    exclusive('upload', async () => {
      let ok = 0;
      for (const f of files) { if (await uploadOneFile(f)) ok++; }
      if (activeRef.current) {
        setUploadProgress(null);
        report(ok === files.length ? 'saved' : (ok ? 'partial' : 'failed'),
          ok === files.length ? `تم رفع ${ok} صورة` : `تم رفع ${ok} من ${files.length} صورة`);
      }
    });
  };

  const delImage = async id => {
    const img = images.find(i => i.id === id);
    if (img && img._sources && img._sources.includes('core')) {
      setImgError('هذه الصورة مسجلة في السجل المركزي (دراسة تصويرية) ولا يمكن حذفها من هنا.');
      return;
    }
    await exclusive('delimg:' + id, async () => {
      try { await mergeImageMeta(base => base.filter(i => i.id !== id)); } catch (e) { setImgError('تعذر حذف الصورة: ' + errMsg(e)); }
    });
  };
  const editImgNotesLocal = (id, notes) => setMetaImages(prev => {
    const has = prev.some(i => i.id === id);
    if (has) return prev.map(i => (i.id === id ? { ...i, notes } : i));
    const core = images.find(i => i.id === id);
    return core ? [{ ...core, notes }, ...prev] : prev;
  });
  const updateImgNotes = async (id, notes) => {
    try {
      await mergeImageMeta(base => {
        if (base.some(i => i.id === id)) return base.map(i => (i.id === id ? { ...i, notes } : i));
        const core = images.find(i => i.id === id);
        return core ? [{ ...core, notes }, ...base] : base;
      });
    } catch (e) { setImgError('تعذر حفظ ملاحظات الصورة: ' + errMsg(e)); }
  };

  // ---- investigation requests ------------------------------------------------------------------------
  const [requestTests, setRequestTests] = useState({});
  const [requestNotes, setRequestNotes] = useState('');
  const [requestEye, setRequestEye] = useState('OU');
  const [requestSaving, setRequestSaving] = useState(false);
  const [requestResult, setRequestResult] = useState(null);
  const draft = useRef(null); // { id, resume } — one id per draft; reused on retry

  const allRequestTests = [...DEFAULT_TESTS, ...(customTests || []).map(t => ({ ...t, cat: 'مخصص' }))];
  const toggleRequestTest = id => setRequestTests(v => (v[id]
    ? Object.fromEntries(Object.entries(v).filter(([k]) => k !== id))
    : { ...v, [id]: requestEye }));
  const cycleRequestEye = id => setRequestTests(v => ({ ...v, [id]: EYE_CYCLE[v[id] || requestEye] || 'OU' }));

  const requestDeps = () => ({
    client: getSB,
    offline: offlineNow,
    createVisit: createClinicalVisitCore,
    call: (name, args) => iappRpc(getSB(), name, args),
    visitParams: ({ patient: p, notes, doctorName }) => ({
      p_patient_id: Number(p.id), p_appointment_id: null, p_doctor_name: doctorName || '', p_visit_date: localDateStr(),
      p_visit_type: 'investigation', p_chief_complaint: '', p_clinical_summary: 'طلب فحوصات', p_notes: notes || '', p_status: 'completed'
    }),
    orderParams: ({ patient: p, visitId, tests, notes, doctorName, draftId }) => imagingRequestParams({
      patientId: p.id, visitId, tests, requestNotes: notes, doctorName, sourceLegacyId: draftId
    }),
    saveLegacyRequest: async rec => { if (onSaveRadiologyRequest) await onSaveRadiologyRequest(rec); },
    upsertOrder: order => sbMutate('iapp_imaging_orders', list => [order, ...list.filter(o => o.id !== order.id)]),
    patchRequest: async (id, patch) => {
      await sbMutate('iapp_exams', list => list.map(e => (String(e.id) === String(id) ? { ...e, ...patch } : e)));
      await sbMutate('iapp_imaging_orders', list => list.map(o => (String(o.sourceExamId) === String(id) ? { ...o, ...patch } : o)));
    },
    today: localDateStr, clock: localTimeStr, nowIso: () => new Date().toISOString()
  });

  const savePatientRadiologyRequest = () => exclusive('request', async () => {
    const ids = Object.keys(requestTests);
    if (!ids.length) { setRequestResult({ status: 'invalid', message: 'اختر فحصاً واحداً على الأقل' }); return; }
    const tests = ids.map(id => {
      const t = allRequestTests.find(x => x.id === id);
      return t ? { id: t.id, name: t.name, name_ar: t.name_ar, category: t.cat, eye: requestTests[id] || 'OU' } : null;
    }).filter(Boolean);
    if (!draft.current) draft.current = { id: Date.now(), resume: null };
    setRequestSaving(true);
    setRequestResult(null);
    try {
      const result = await submitInvestigationRequest(requestDeps(), {
        patient: curPatient, tests, notes: requestNotes, doctorName: (primaryDoctor && primaryDoctor.name) || '',
        draftId: draft.current.id, resume: draft.current.resume
      });
      draft.current.resume = result.resume || draft.current.resume;
      if (result.complete) {
        draft.current = null;
        if (activeRef.current) { setRequestTests({}); setRequestNotes(''); }
      }
      if (activeRef.current) setRequestResult(result);
      report(result.status === 'saved' ? 'saved' : (result.status === 'local-only' ? 'local-only' : result.status), result.message);
      refreshAll();
    } catch (e) {
      const message = 'تعذر حفظ الطلب: ' + errMsg(e);
      if (activeRef.current) setRequestResult({ status: 'failed', message });
      report('failed', message);
    } finally {
      if (activeRef.current) setRequestSaving(false);
    }
  });

  const resyncRequest = rec => exclusive('resync:' + rec.id, async () => {
    const result = await resyncInvestigationRequest(requestDeps(), rec, curPatient);
    report(result.status === 'synced' ? 'saved' : 'failed', result.status === 'synced' ? 'تمت مزامنة الطلب مع السجل المركزي' : (result.message || 'تعذرت المزامنة'));
    if (result.status === 'synced') refreshAll();
  });

  // ---- saves with honest status ---------------------------------------------------------------------------
  const coreMessage = (what, r) => { const o = interpretSaveResult(what, r); return [o.kind, o.message]; };
  // `fn` receives { onLocalSaved }: the data layer calls it as soon as the record
  // is stored locally, so the form closes then (the clinician is not held for the
  // Core round trip) while the status bar keeps reporting until Core answers.
  // If the local save itself fails the form stays open with everything typed.
  const runSave = (key, what, fn) => exclusive(key, async () => {
    try {
      const r = await fn({
        onLocalSaved: () => { closeModalClean(); report('saving', `تم حفظ ${what} على هذا الجهاز — جاري المزامنة مع السجل المركزي…`); }
      });
      const [kind, message] = coreMessage(what, r);
      closeModalClean();
      report(kind, message);
      return r;
    } catch (e) {
      logError('patientFile.save.' + key.split(':')[0], e, { op: key.split(':')[0] });
      report('failed', `لم يُحفظ ${what}: ${errMsg(e)}. النافذة ما زالت مفتوحة لتحاول مجدداً.`);
      return undefined;
    }
  });

  const handleSaveExam = e => runSave('exam:' + (e && e.id), 'الفحص', opts => onSaveExam(e, opts));
  const handleSaveVisit = v => runSave('visit:' + (v && v.id), 'الزيارة', opts => onSaveVisit(v, opts));
  const handlePatientSave = updated => exclusive('patient:' + (updated && updated.id), async () => {
    setCurPatient(updated);
    closeModalClean();
    report('saving', 'جاري حفظ بيانات المريض…');
    try {
      const ok = await onUpdatePatient(updated);
      const o = interpretWriteOk('بيانات المريض', ok);
      report(o.kind, o.message);
    } catch (e) {
      logError('patientFile.save.patient', e, { patientId: updated && updated.id });
      report('failed', 'لم تُحفظ بيانات المريض: ' + errMsg(e));
    }
  });

  // Deleting a record that exists only in Core would be a silent no-op on the
  // legacy store, so it is refused with an explanation instead.
  const requestDelete = target => {
    if (!target) { setDelTargetRaw(null); return; }
    const list = target.type === 'visit' ? visits : patientRecords;
    const rec = list.find(r => String(r.id) === String(target.id));
    if (isCoreOnly(rec)) {
      report('failed', 'هذا السجل مسجل في السجل المركزي فقط ولا يمكن حذفه من هذه الشاشة.');
      return;
    }
    setDelTargetRaw(target);
  };
  const onConfirmDelete = () => {
    const t = delTarget;
    setDelTargetRaw(null);
    if (!t) return undefined;
    return exclusive('del:' + t.type + ':' + t.id, async () => {
      try {
        await (t.type === 'visit' ? onDelVisit(t.id) : onDelExam(t.id));
        report('saved', 'تم نقل السجل إلى سلة المحذوفات');
      } catch (e) {
        report('failed', 'تعذر الحذف: ' + errMsg(e));
      }
    });
  };

  const onDeleteRx = rx => {
    if (isCoreOnly(rx)) { report('failed', 'هذه الوصفة مسجلة في السجل المركزي فقط ولا يمكن حذفها من هنا.'); return; }
    if (!window.confirm('نقل هذه الوصفة إلى سلة المحذوفات؟')) return;
    exclusive('delrx:' + rx.id, async () => {
      try {
        await trashPut('iapp_prescriptions', rx, 'روشتة');
        logAudit('حذف روشتة', (rx.date || '') + ' · ' + ((curPatient && curPatient.name) || ''));
        if (onSaveRx) await onSaveRx((allRx || []).filter(r => r.id !== rx.id));
        report('saved', 'تم نقل الوصفة إلى سلة المحذوفات');
      } catch (e) { report('failed', 'تعذر حذف الوصفة: ' + errMsg(e)); }
    });
  };
  const onAddRxSave = rx => runSave('rx:new', 'الوصفة', opts => onSaveRx(
    [...(allRx || []), { ...rx, id: Date.now(), patientId: curPatient.id, patient: curPatient.name }], opts
  ));
  const onEditRxSave = rx => runSave('rx:' + rx.id, 'الوصفة', opts => onSaveRx(
    (allRx || []).map(r => (r.id === rx.id ? { ...rx, patientId: curPatient.id, patient: curPatient.name } : r)), opts
  ));

  const sync = useSyncStatus();
  const connection = connectionState({ saveStatus, sync });

  return {
    summary, longitudinal, investigationLinks, injections, connection,
    TABS, aiAnalysis, allRequestTests, analyzeImage, clinic, coreJourneyCount, coreSource, coreStatus,
    curPatient, cycleRequestEye, delImage, delTarget, doctorNames, exams,
    handleImgUpload, handlePatientSave, imageEye, imageFilter, imageOrderId, imageType, images, imagingOrders,
    imgError, imgLoading, modal, onClose, onSaveExam: handleSaveExam, onSaveVisit: handleSaveVisit, patient, patientRecords,
    prices, primaryDoctor, requestEye, requestNotes, requestResult, requestSaving, requestTests,
    requestSaved: !!requestResult && requestResult.status === 'saved',
    requests, rxList, savePatientRadiologyRequest, resyncRequest, setAiAnalysis, setDelTarget: requestDelete,
    setImageEye, setImageFilter, setImageOrderId, setImageType, setImgError, setModal, setRequestEye, setRequestNotes, setTab,
    setTimelineFilter, setTimelineSearch, setViewImg, tab, timelineFilter, timelineSearch,
    toggleRequestTest, totalSpent, updateImgNotes, editImgNotesLocal, uploadProgress, viewImg, visits,
    // new in the Patient 360 hardening pass
    timelineEvents, filteredTimeline, openSource, focusRec, saveStatus, dismissStatus, markModalDirty,
    refreshAll, ordersError, sync,
    onDeleteRx, onAddRxSave, onEditRxSave, onConfirmDelete
  };
}
