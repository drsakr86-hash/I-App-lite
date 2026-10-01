// Live data layer behind the patient-file screen (src/screens/PatientFile.jsx
// is purely presentational and only reads the `ctx` object this hook
// builds). Exact port of the legacy runtime's PatientFile() orchestrator
// (public/legacy/app-runtime.js) -- every useState/effect/handler it ran on
// every render, not just its dead post-gate fallback JSX.
import { useState, useEffect } from 'react';
import { C } from '../theme/index.js';
import { getSB, iappRpc } from '../data-access/index.js';
import { offlineNow, busOn, isDirty, LS } from '../sync/engine.js';
import { sbGet, sbSet, queueSave } from '../sync/wiring.js';
import { trashPut, logAudit } from '../sync/index.js';
import { localISO, localDateStr, localTimeStr } from '../constants/misc.js';
import { DEFAULT_TESTS } from '../constants/exams.js';
import { createClinicalVisitCore } from '../visits/core.js';
import { imagingRequestParams } from '../investigations/investigation.mapper.js';
import { getPatient360 } from '../patients/index.js';

export function usePatientFile({
  patient, allExams, allRx, allVisits, onClose, onUpdatePatient,
  onSaveExam, onDelExam, onSaveVisit, onDelVisit, onSaveRx, onSaveRadiologyRequest,
  doctorNames = [], primaryDoctor, prices = [], clinic, customTests = []
}) {
  const [tab, setTab] = useState('info');
  const [timelineSearch, setTimelineSearch] = useState('');
  const [timelineFilter, setTimelineFilter] = useState('All');
  const [modal, setModal] = useState(null);
  const [delTarget, setDelTarget] = useState(null);
  // Phase 18: declare Core Patient 360 state before any derived values use it.
  const [coreFile, setCoreFile] = useState(null);
  const [coreLoaded, setCoreLoaded] = useState(false);
  const [coreSource, setCoreSource] = useState('none');
  const [coreRequests, setCoreRequests] = useState([]);
  const [coreImages, setCoreImages] = useState([]);
  // Phase 18 fix: requestSaved must be declared before the Core-sync useEffect
  // below, which lists it in its dependency array.
  const [requestSaved, setRequestSaved] = useState(false);

  const coreExams = (coreFile?.examinations || []).map(e => ({
    id: e.legacy_id && /^\d+$/.test(String(e.legacy_id)) ? Number(e.legacy_id) : e.id,
    patientId: patient.id,
    date: e.examination_date || String(e.created_at || '').slice(0, 10),
    doctor: e.doctor_name || '',
    visualAcuityR: e.visual_acuity_od || '',
    visualAcuityL: e.visual_acuity_os || '',
    iopR: e.iop_od || '',
    iopL: e.iop_os || '',
    anteriorSegment: e.anterior_segment || '',
    posteriorSegment: e.posterior_segment || '',
    colorVision: e.color_vision || '',
    contrast: e.contrast || '',
    coverTest: e.cover_test || '',
    diagnosis: e.diagnosis_summary || '',
    treatmentPlan: e.treatment_plan || '',
    followUp: e.followup_date || '',
    notes: e.notes || '',
    _core: true
  }));
  const coreVisits = (coreFile?.visits || []).map(v => ({
    id: v.id, patientId: patient.id, date: v.visit_date || String(v.created_at || '').slice(0, 10),
    type: v.visit_type || 'visit', doctor: v.doctor_name || '', complaint: v.chief_complaint || '',
    result: v.clinical_summary || '', notes: v.notes || '', cost: v.cost || 0, paid: !!v.paid, nextVisit: v.next_visit || '',
    _core: true, _coreId: v.id
  }));
  const coreRx = (coreFile?.prescriptions || []).map(r => ({
    id: r.legacy_id && /^\d+$/.test(String(r.legacy_id)) ? Number(r.legacy_id) : r.id,
    patientId: patient.id, date: r.prescription_date || r.date || '', eye: r.eye || 'OU', sphR: r.sph_od || r.sphR || '', sphL: r.sph_os || r.sphL || '',
    cylR: r.cyl_od || r.cylR || '', cylL: r.cyl_os || r.cylL || '', axisR: r.axis_od || r.axisR || '', axisL: r.axis_os || r.axisL || '',
    add: r.add_power || r.add || '', medicines: r.medicines || [], notes: r.notes || '', patient: patient.name, _core: true
  }));
  const mergeCore = (legacy, core, keyFn) => {
    const out = Array.isArray(legacy) ? [...legacy] : [];
    const seen = new Set(out.map(keyFn));
    core.forEach(item => { const k = keyFn(item); if (!seen.has(k)) { out.push(item); seen.add(k); } });
    return out;
  };
  const patientRecords = mergeCore(allExams.filter(e => e.patientId === patient.id), coreExams, e => String(e.id));
  const requests = [
    ...patientRecords.filter(e => e.status === 'requested' || (e.requestedTests && e.requestedTests.length)),
    ...coreRequests.filter(r => !patientRecords.some(e => e.imagingOrderId && e.imagingOrderId === r.imagingOrderId))
  ];
  const exams = patientRecords.filter(e => !(e.status === 'requested' || (e.requestedTests && e.requestedTests.length)));
  const rxList = mergeCore(allRx.filter(r => r.patientId === patient.id), coreRx, r => String(r.id));
  const visits = mergeCore(allVisits.filter(v => v.patientId === patient.id), coreVisits, v => String(v._coreId || v.id))
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  // Phase 29: the backend contract exposes normalized arrays rather than a
  // separate journey field. Keep the merged arrays as the compatibility layer.
  const coreJourneyCount = (coreFile?.visits?.length || 0) + (coreFile?.examinations?.length || 0) +
    (coreFile?.diagnoses?.length || 0) + (coreFile?.treatments?.length || 0) +
    (coreFile?.prescriptions?.length || 0) + (coreFile?.investigation_orders?.length || 0) +
    (coreFile?.imaging_studies?.length || 0) + (coreFile?.followups?.length || 0);
  const coreJourneyEvents = Array.isArray(coreFile?.journey) ? coreFile.journey.map(e => {
    const typeMap = { visit: 'زيارة', examination: 'فحص', diagnosis: 'تشخيص', treatment: 'علاج', prescription: 'وصفة', investigation: 'طلب أشعة', imaging: 'صورة', followup: 'متابعة' };
    const iconMap = { visit: '🩺', examination: '🔍', diagnosis: '🧬', treatment: '💊', prescription: '📋', investigation: '🩻', imaging: '🖼️', followup: '📅' };
    const colorMap = { visit: C.teal, examination: C.accent, diagnosis: C.gold, treatment: C.gold, prescription: C.gold, investigation: C.gold, imaging: C.purple, followup: C.teal };
    const t = e?.event_type || 'visit';
    return { date: e?.event_date || '', time: e?.event_time || '', type: typeMap[t] || t, title: e?.title || typeMap[t] || 'Clinical Event', detail: e?.detail || '', doctor: e?.doctor || '', icon: iconMap[t] || '🩺', color: colorMap[t] || C.teal };
  }) : [];
  const totalSpent = visits.reduce((s, v) => s + (v.paid ? Number(v.cost || 0) : 0), 0);
  const TABS = [
    { id: 'info', label: 'Overview', icon: '👤' },
    { id: 'timeline', label: 'Timeline', icon: '🕘' },
    { id: 'visits', label: 'Visits', icon: '🗓' },
    { id: 'exams', label: 'Examination', icon: '🔍' },
    { id: 'requests', label: 'Investigation Orders', icon: '🩻' },
    { id: 'treatment', label: 'Treatment', icon: '💊' },
    { id: 'rx', label: 'Prescriptions', icon: '🔬' },
    { id: 'images', label: 'Medical Images', icon: 'oct' },
    { id: 'compare', label: 'Comparison', icon: '📊' }
  ];

  const [curPatient, setCurPatient] = useState(patient);
  // Keep the open file in sync when the patient record changes elsewhere (sync, other screens).
  useEffect(() => {
    setCurPatient(prev => (prev === patient || JSON.stringify(prev) === JSON.stringify(patient) ? prev : patient));
  }, [patient]);

  // Phase 18: Core Patient 360 state is declared above before derived values.
  useEffect(() => {
    let active = true;
    (async () => {
      const code = patient && patient.patientCode;
      const sb = getSB();
      if (!sb || !code) {
        if (active) {
          setCoreLoaded(false);
          setCoreSource('none');
        }
        return;
      }
      try {
        let data = null;
        let source = 'none';
        // Phase 53-56: Patient 360 comes from the extracted service (throws when unavailable).
        data = await getPatient360(sb, code);
        source = data._source || '360';
        if (!active) return;
        const rawFile = data && typeof data === 'object' ? data : null;
        const file = rawFile ? { ...rawFile, ...(rawFile.patient || {}) } : null;
        setCoreFile(file);
        setCoreLoaded(!!file);
        setCoreSource(source);
        const orders = Array.isArray(file?.investigation_orders) ? file.investigation_orders : [];
        const imagingOrders = Array.isArray(file?.imaging_orders) ? file.imaging_orders : [];
        const imagingByInvestigation = new Map(imagingOrders.filter(x => x?.investigation_order_id != null).map(x => [String(x.investigation_order_id), x]));
        setCoreRequests(orders.map(o => {
          const io = imagingByInvestigation.get(String(o.id));
          return {
            id: 'core-order-' + o.id,
            patientId: patient.id,
            patient: file.full_name || patient.name,
            patientCode: file.patient_code || patient.patientCode || '',
            date: String(o.ordered_at || io?.order_date || '').slice(0, 10) || localDateStr(),
            time: o.ordered_at ? new Date(o.ordered_at).toTimeString().slice(0, 5) : (io?.order_time || ''),
            doctor: o.doctor_name || o.requested_by || io?.doctor_name || '',
            testType: o.investigation_type || 'Investigation',
            requestedTests: [{ id: o.id, name: o.test_name || o.investigation_type || 'Investigation', name_ar: o.test_name || o.investigation_type || 'Investigation', category: 'Core', eye: o.eye || 'OU' }],
            notes: o.clinical_note || io?.notes || '',
            status: o.status || io?.status || 'requested',
            imagingOrderId: io?.id || null,
            visitId: o.visit_id || io?.visit_id || null,
            _core: true
          };
        }));
        const studies = Array.isArray(file?.imaging_studies) ? file.imaging_studies : [];
        const imgs = [];
        studies.forEach(st => {
          const files = Array.isArray(st.files) && st.files.length ? st.files : [{
            id: st.cloudinary_public_id || st.legacy_id || ('core-study-' + st.id),
            public_id: st.cloudinary_public_id || '',
            src: st.cloudinary_url || '',
            name: st.metadata?.name || st.type_name || st.study_type || 'Medical image',
            date: st.performed_date || String(st.performed_at || '').slice(0, 10),
            time: st.performed_time || '',
            type: st.type_name || st.modality || st.study_type || 'Medical image',
            eye: st.eye || 'OU',
            notes: st.notes || st.report || '',
            examId: null
          }];
          files.forEach(f => imgs.push({ ...f, id: f.id || f.public_id || ('core-study-' + st.id), public_id: f.public_id || st.cloudinary_public_id || '', src: f.src || st.cloudinary_url || '', _core: true }));
        });
        setCoreImages(imgs.filter(x => x.src));
      } catch (e) {
        if (active) {
          setCoreLoaded(false);
          setCoreFile(null);
          setCoreRequests([]);
          setCoreImages([]);
        }
        console.warn('Core Patient 360 unavailable; using legacy Patient File:', e?.message || e);
      }
    })();
    return () => { active = false; };
  }, [patient.id, patient.patientCode, requestSaved]);

  const [viewImg, setViewImg] = useState(null);
  const CLD_CLOUD = 'daihhusnc';
  const CLD_PRESET = 'iapp_clinic';
  const metaKey = 'iapp_imgmeta_' + patient.id;
  const [images, setImages] = useState([]);
  const [imgLoading, setImgLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null);
  const [imgError, setImgError] = useState(null);
  const [aiAnalysis, setAiAnalysis] = useState({});
  const [imageType, setImageType] = useState('OCT');
  const [imageEye, setImageEye] = useState('OU');
  const [imageFilter, setImageFilter] = useState('الكل');
  const [requestTests, setRequestTests] = useState({});
  const [requestNotes, setRequestNotes] = useState('');
  const [requestEye, setRequestEye] = useState('OU');
  const [imagingOrders, setImagingOrders] = useState([]);
  const [imagingStudies, setImagingStudies] = useState([]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const o = await sbGet('iapp_imaging_orders');
        if (active) setImagingOrders(Array.isArray(o) ? o.filter(x => x.patientId === patient.id) : []);
      } catch {}
      try {
        const st = await sbGet('iapp_imaging_studies');
        if (active) setImagingStudies(Array.isArray(st) ? st.filter(x => x.patientId === patient.id) : []);
      } catch {}
    })();
    return () => { active = false; };
  }, [patient.id, requestSaved]);

  const analyzeImage = async img => {
    if (!img?.src) return;
    setAiAnalysis(prev => ({
      ...prev,
      [img.id]: {
        loading: false,
        result: null,
        error: 'تحليل AI غير مفعّل في نسخة المتصفح الحالية. يجب ربطه عبر Backend / Supabase Edge Function بشكل آمن.'
      }
    }));
  };

  const persistMeta = async imgs => {
    const meta = imgs.map(i => ({
      id: i.id, public_id: i.public_id, name: i.name, date: i.date, time: i.time || '',
      src: i.src, notes: i.notes || '', type: i.type || 'صورة طبية', eye: i.eye || 'OU', examId: i.examId || null
    }));
    await queueSave(metaKey, meta);
    return meta;
  };
  const mergeImageMeta = async operation => {
    const remote = await sbGet(metaKey);
    const base = Array.isArray(remote) ? remote : images;
    const next = operation(base);
    await persistMeta(next);
    setImages(next);
    return next;
  };

  useEffect(() => {
    let channel;
    const offBus = busOn(metaKey, setImages);
    (async () => {
      setImgLoading(true);
      try {
        const cached = localStorage.getItem(metaKey);
        if (cached) setImages(JSON.parse(cached));
      } catch {}
      try {
        const remote = await sbGet(metaKey);
        if (Array.isArray(remote)) {
          setImages(prev => {
            const base = remote;
            const keys = new Set(base.map(x => String(x.id || x.public_id || x.src || '')));
            return [...base, ...coreImages.filter(x => !keys.has(String(x.id || x.public_id || x.src || '')))];
          });
          if (!isDirty(metaKey)) LS.set(metaKey, JSON.stringify(remote));
        } else if (coreImages.length) {
          setImages(coreImages);
        }
      } catch (e) {
        console.warn('img meta load:', e);
      }
      setImgLoading(false);
    })();
    try {
      const sb = getSB();
      if (sb) channel = sb.channel('iapp_imgmeta_' + patient.id).on('postgres_changes', {
        event: '*', schema: 'public', table: 'iapp_store', filter: `key=eq.${metaKey}`
      }, payload => {
        const next = payload?.new?.value;
        if (Array.isArray(next) && !isDirty(metaKey)) {
          setImages(next);
          LS.set(metaKey, JSON.stringify(next));
        }
      }).subscribe();
    } catch (e) {
      console.warn('image realtime unavailable', e);
    }
    return () => {
      offBus();
      if (channel) {
        try { getSB().removeChannel(channel); } catch {}
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patient.id, coreImages]);

  useEffect(() => {
    if (!coreImages.length) return;
    setImages(prev => {
      const keys = new Set((prev || []).map(x => String(x.id || x.public_id || x.src || '')));
      const extra = coreImages.filter(x => !keys.has(String(x.id || x.public_id || x.src || '')));
      return extra.length ? [...(prev || []), ...extra] : prev;
    });
  }, [coreImages]);

  const uploadOneFile = function (file) {
    setUploadProgress({ name: file.name, pct: 10 });
    const folder = 'iapp/patient_' + patient.id;
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', CLD_PRESET);
    formData.append('folder', folder);
    return fetch('https://api.cloudinary.com/v1_1/' + CLD_CLOUD + '/image/upload', {
      method: 'POST', body: formData
    }).then(res => {
      setUploadProgress({ name: file.name, pct: 80 });
      return res.json().then(data => {
        if (!res.ok) {
          setImgError('فشل الرفع: ' + ((data && data.error && data.error.message) || res.status));
          return;
        }
        const newImg = {
          id: data.public_id, public_id: data.public_id, name: file.name, date: localISO(),
          time: new Date().toTimeString().slice(0, 5), src: data.secure_url, notes: '',
          type: imageType, eye: imageEye, examId: null
        };
        setUploadProgress({ name: file.name, pct: 100 });
        return mergeImageMeta(base => [newImg, ...base.filter(x => x.id !== newImg.id)]);
      });
    }).catch(err => setImgError('خطأ في الرفع: ' + err.message));
  };

  const handleImgUpload = function (e) {
    const files = Array.from(e.target.files).filter(f => f.type.startsWith('image/'));
    e.target.value = '';
    if (!files.length) return;
    setImgError(null);
    let chain = Promise.resolve();
    files.forEach(file => {
      chain = chain.then(() => uploadOneFile(file));
    });
    chain.then(() => setUploadProgress(null));
  };

  const delImage = async id => {
    await mergeImageMeta(base => base.filter(i => i.id !== id));
  };
  const updateImgNotes = async (id, notes) => {
    await mergeImageMeta(base => base.map(i => (i.id === id ? { ...i, notes } : i)));
  };

  const allRequestTests = [...DEFAULT_TESTS, ...(customTests || []).map(t => ({ ...t, cat: 'مخصص' }))];
  const toggleRequestTest = id => setRequestTests(v => (v[id]
    ? Object.fromEntries(Object.entries(v).filter(([k]) => k !== id))
    : { ...v, [id]: requestEye }));
  // NOTE: legacy's EYE_CYCLE here is a pre-existing bug, preserved exactly --
  // EYE_CYCLE is only defined inside the (unrelated, dead) Radiology()
  // function in the legacy file, never at module scope, so this reference
  // throws a ReferenceError if a user ever actually clicks the eye-cycle
  // control in this tab. Not fixed here: this batch ports behavior exactly,
  // bugs included, and this one is flagged in the migration roadmap.
  // eslint-disable-next-line no-undef
  const cycleRequestEye = id => setRequestTests(v => ({ ...v, [id]: EYE_CYCLE[v[id] || requestEye] || 'OU' }));

  const savePatientRadiologyRequest = async () => {
    const ids = Object.keys(requestTests);
    if (!ids.length) {
      alert('اختر فحصاً واحداً على الأقل');
      return;
    }
    const tests = ids.map(id => {
      const t = allRequestTests.find(x => x.id === id);
      return t ? { id: t.id, name: t.name, name_ar: t.name_ar, category: t.cat, eye: requestTests[id] || 'OU' } : null;
    }).filter(Boolean);
    const nowId = Date.now();
    const rec = {
      id: nowId, patientId: curPatient.id, patient: curPatient.name, date: localDateStr(), time: localTimeStr(),
      doctor: (primaryDoctor && primaryDoctor.name) || '', testType: 'طلب فحوصات', requestedTests: tests,
      notes: requestNotes || '', status: 'requested', imagingOrderId: 'ORD-' + nowId
    };
    let coreWorkflow = null;
    let coreError = null;
    let coreVisitId = null;
    try {
      const sb = getSB();
      if (sb && !offlineNow()) {
        const { data: visitId, error: visitError } = await createClinicalVisitCore(sb, {
          p_patient_id: Number(curPatient.id),
          p_appointment_id: null,
          p_doctor_name: primaryDoctor?.name || '',
          p_visit_date: localDateStr(),
          p_visit_type: 'investigation',
          p_chief_complaint: '',
          p_clinical_summary: 'طلب فحوصات',
          p_notes: requestNotes || '',
          p_status: 'completed'
        }, `investigation:${nowId}`);
        if (visitError) throw visitError;
        coreVisitId = visitId || null;
        const { data, error } = await iappRpc(sb, 'iapp_create_investigation_workflow_order', imagingRequestParams({
          patientId: curPatient.id, visitId: coreVisitId, tests, requestNotes, doctorName: primaryDoctor?.name, sourceLegacyId: nowId
        }));
        if (error) throw error;
        coreWorkflow = data;
        rec.coreInvestigationOrderId = data?.investigation_order_id || null;
        rec.coreImagingOrderId = data?.imaging_order_id || null;
        rec.coreVisitId = coreVisitId;
      } else {
        coreError = 'offline';
      }
    } catch (e) {
      coreError = e?.message || String(e);
      console.warn('[core investigation sync]', e);
    }
    if (onSaveRadiologyRequest) await onSaveRadiologyRequest(rec);
    const order = {
      id: 'ORD-' + nowId, patientId: curPatient.id, patient: curPatient.name, patientCode: curPatient.patientCode || '',
      doctor: (primaryDoctor && primaryDoctor.name) || '', date: localDateStr(), time: localTimeStr(), tests,
      notes: requestNotes || '', status: 'requested', sourceExamId: nowId, createdAt: new Date().toISOString(),
      coreInvestigationOrderId: coreWorkflow?.investigation_order_id || null,
      coreImagingOrderId: coreWorkflow?.imaging_order_id || null,
      coreSyncError: coreError || null
    };
    const remoteOrders = await sbGet('iapp_imaging_orders');
    await sbSet('iapp_imaging_orders', [order, ...(Array.isArray(remoteOrders) ? remoteOrders : [])]);
    setRequestSaved(true);
    setRequestTests({});
    setRequestNotes('');
    setTimeout(() => setRequestSaved(false), 3000);
  };

  const handlePatientSave = updated => {
    onUpdatePatient(updated);
    setCurPatient(updated);
    setModal(null);
  };

  return {
    TABS, aiAnalysis, allRequestTests, analyzeImage, clinic, coreJourneyCount, coreJourneyEvents,
    coreSource, curPatient, cycleRequestEye, delImage, delTarget, doctorNames, exams,
    handleImgUpload, handlePatientSave, imageEye, imageFilter, imageType, images, imagingOrders,
    imgError, imgLoading, modal, onClose, onSaveExam, onSaveVisit, patient, patientRecords,
    prices, primaryDoctor, requestEye, requestNotes, requestSaved, requestTests, requests,
    rxList, savePatientRadiologyRequest, setAiAnalysis, setDelTarget, setImageEye,
    setImageFilter, setImageType, setImgError, setModal, setRequestEye, setRequestNotes, setTab,
    setTimelineFilter, setTimelineSearch, setViewImg, tab, timelineFilter, timelineSearch,
    toggleRequestTest, totalSpent, updateImgNotes, uploadProgress, viewImg, visits,
    onDeleteRx: rx => {
      if (window.confirm('نقل هذه الوصفة إلى سلة المحذوفات؟')) {
        trashPut('iapp_prescriptions', rx, 'روشتة');
        logAudit('حذف روشتة', (rx.date || '') + ' · ' + ((curPatient && curPatient.name) || ''));
        const updated = (allRx || []).filter(r => r.id !== rx.id);
        if (onSaveRx) onSaveRx(updated);
      }
    },
    onAddRxSave: rx => {
      const updated = [...(allRx || []), { ...rx, id: Date.now(), patientId: curPatient.id, patient: curPatient.name }];
      if (onSaveRx) onSaveRx(updated);
      setModal(null);
    },
    onEditRxSave: rx => {
      const updated = (allRx || []).map(r => (r.id === rx.id ? { ...rx, patientId: curPatient.id, patient: curPatient.name } : r));
      if (onSaveRx) onSaveRx(updated);
      setModal(null);
    },
    onConfirmDelete: () => {
      delTarget.type === 'visit' ? onDelVisit(delTarget.id) : onDelExam(delTarget.id);
      setDelTarget(null);
    }
  };
}
