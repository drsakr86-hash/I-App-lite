// Patient 360 normalisation layer (pure: no React, no Supabase, no DOM).
//
// One place that turns the two sources of a patient's chart -- the legacy
// local/iapp_store records and the Core Patient 360 payload -- into a single
// coherent set of records, with:
//   * stable identity keys (never names / approximate dates) used to de-duplicate,
//   * provenance (`_sources`, `_coreId`, `_legacyId`) preserved on every record,
//   * defensive mapping: missing / malformed fields never throw and are never
//     fabricated (an absent value stays '' / null),
//   * encounter linkage (`_coreVisitId`) carried through when the backend gives it.
//
// Precedence rule (documented in docs/PATIENT360.md): when the same clinical
// record exists in both sources, the LEGACY (local) record wins, because it is
// the one the clinician edited last and may hold edits not yet written through
// to Core. Core only contributes identity (`_coreId`) and provenance to it.
// Core-only records are appended as-is.
//
// Field names read from the Core payload are exactly those the existing code
// already read (see docs/PATIENT360.md section "Verification still required").

import { t, getLang } from '../i18n/index.js';
import { tv } from '../i18n/tv.js';

const str = v => (v == null ? '' : String(v));
const arr = v => (Array.isArray(v) ? v.filter(x => x && typeof x === 'object') : []);
const isNumericId = v => /^\d+$/.test(str(v));
const day = v => str(v).slice(0, 10);
const present = v => v !== undefined && v !== null && String(v) !== '';

// ---- safety: a Core payload must belong to the patient being displayed -------

export function coreFileMatchesPatient(file, patient) {
  if (!file || typeof file !== 'object') return false;
  const fileCode = str(file.patient_code).trim();
  const code = str(patient && patient.patientCode).trim();
  if (fileCode && code && fileCode !== code) return false;
  return true;
}

// A row carrying an explicit, different patient_id is dropped, never re-labelled.
export function belongsToPatient(row, patient) {
  if (!row || row.patient_id == null || patient == null || patient.id == null) return true;
  return Number(row.patient_id) === Number(patient.id);
}

const scoped = (list, patient) => arr(list).filter(r => belongsToPatient(r, patient));

// ---- medicines: legacy = string, Core = array of {name, ...} -----------------
// Rendering an array of objects as a React child throws and blanks the whole
// patient file, so every consumer gets text.

export function medicinesToText(m) {
  if (m == null) return '';
  if (typeof m === 'string') return m;
  if (Array.isArray(m)) {
    return m.map(x => {
      if (x == null) return '';
      if (typeof x === 'string') return x;
      if (typeof x !== 'object') return String(x);
      const name = x.name || x.name_ar || x.drug || '';
      const rest = [x.dose, x.dosage, x.frequency, x.duration, x.instructions, x.notes].filter(present).map(String).join(' · ');
      return [name, rest].filter(Boolean).join(' — ');
    }).filter(Boolean).join('\n');
  }
  if (typeof m === 'object') return medicinesToText([m]);
  return String(m);
}

// ---- Core -> legacy-shaped record mappers ------------------------------------

export function mapCoreExams(file, patient) {
  return scoped(file && file.examinations, patient).map(e => ({
    id: present(e.legacy_id) && isNumericId(e.legacy_id) ? Number(e.legacy_id) : e.id,
    patientId: patient.id,
    date: day(e.examination_date || e.created_at),
    doctor: str(e.doctor_name),
    visualAcuityR: str(e.visual_acuity_od),
    visualAcuityL: str(e.visual_acuity_os),
    iopR: str(e.iop_od),
    iopL: str(e.iop_os),
    anteriorSegment: str(e.anterior_segment),
    posteriorSegment: str(e.posterior_segment),
    colorVision: str(e.color_vision),
    contrast: str(e.contrast),
    coverTest: str(e.cover_test),
    diagnosis: str(e.diagnosis_summary),
    treatmentPlan: str(e.treatment_plan),
    followUp: str(e.followup_date),
    notes: str(e.notes),
    _core: true,
    _coreId: present(e.id) ? String(e.id) : null,
    _legacyId: present(e.legacy_id) ? String(e.legacy_id) : null,
    _coreVisitId: present(e.visit_id) ? String(e.visit_id) : null,
    _sources: ['core']
  }));
}

export function mapCoreVisits(file, patient) {
  return scoped(file && file.visits, patient).map(v => ({
    id: v.id,
    patientId: patient.id,
    date: day(v.visit_date || v.created_at),
    type: str(v.visit_type) || 'visit',
    doctor: str(v.doctor_name),
    complaint: str(v.chief_complaint),
    result: str(v.clinical_summary),
    notes: str(v.notes),
    cost: v.cost || 0,
    paid: !!v.paid,
    nextVisit: str(v.next_visit),
    _core: true,
    _coreId: present(v.id) ? String(v.id) : null,
    _legacyId: present(v.legacy_id) ? String(v.legacy_id) : null,
    _sources: ['core']
  }));
}

export function mapCoreRx(file, patient) {
  return scoped(file && file.prescriptions, patient).map(r => ({
    id: present(r.legacy_id) && isNumericId(r.legacy_id) ? Number(r.legacy_id) : r.id,
    patientId: patient.id,
    date: day(r.prescription_date || r.date),
    eye: str(r.eye) || 'OU',
    sphR: str(r.sph_od || r.sphR), sphL: str(r.sph_os || r.sphL),
    cylR: str(r.cyl_od || r.cylR), cylL: str(r.cyl_os || r.cylL),
    axisR: str(r.axis_od || r.axisR), axisL: str(r.axis_os || r.axisL),
    add: str(r.add_power || r.add),
    medicines: medicinesToText(r.medicines),
    notes: str(r.notes),
    patient: patient.name,
    _core: true,
    _coreId: present(r.id) ? String(r.id) : null,
    _legacyId: present(r.legacy_id) ? String(r.legacy_id) : null,
    _coreVisitId: present(r.visit_id) ? String(r.visit_id) : null,
    _sources: ['core']
  }));
}

function safeTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? '' : d.toTimeString().slice(0, 5);
}

export function mapCoreRequests(file, patient, today = '') {
  const orders = scoped(file && file.investigation_orders, patient);
  const imagingOrders = scoped(file && file.imaging_orders, patient);
  const byInvestigation = new Map(
    imagingOrders.filter(x => x.investigation_order_id != null).map(x => [String(x.investigation_order_id), x])
  );
  return orders.map(o => {
    const io = byInvestigation.get(String(o.id));
    const name = str(o.test_name || o.investigation_type) || 'Investigation';
    return {
      id: 'core-order-' + o.id,
      patientId: patient.id,
      patient: str(file.full_name) || patient.name,
      patientCode: str(file.patient_code) || str(patient.patientCode),
      date: day(o.ordered_at || (io && io.order_date)) || today,
      time: safeTime(o.ordered_at) || str(io && io.order_time),
      doctor: str(o.doctor_name || o.requested_by || (io && io.doctor_name)),
      testType: str(o.investigation_type) || 'Investigation',
      requestedTests: [{ id: o.id, name, name_ar: name, category: 'Core', eye: str(o.eye) || 'OU' }],
      notes: str(o.clinical_note || (io && io.notes)),
      status: str(o.status || (io && io.status)) || 'requested',
      priority: str(o.priority || (io && io.priority)),
      resultSummary: str(o.result_summary),
      completedAt: str(o.completed_at || (io && io.completed_at)),
      coreInvestigationOrderId: present(o.id) ? String(o.id) : null,
      coreImagingOrderId: io && present(io.id) ? String(io.id) : null,
      // Only read when the backend actually returns it; never inferred.
      sourceLegacyId: present(o.source_exam_legacy_id) ? String(o.source_exam_legacy_id)
        : (io && present(io.source_exam_legacy_id) ? String(io.source_exam_legacy_id) : null),
      visitId: present(o.visit_id) ? String(o.visit_id) : (io && present(io.visit_id) ? String(io.visit_id) : null),
      _core: true,
      _coreId: present(o.id) ? String(o.id) : null,
      _sources: ['core']
    };
  });
}

export function mapCoreImages(file, patient) {
  const out = [];
  scoped(file && file.imaging_studies, patient).forEach(st => {
    const declared = Array.isArray(st.files) ? st.files.filter(f => f && typeof f === 'object') : [];
    const files = declared.length ? declared : [{
      id: st.cloudinary_public_id || st.legacy_id || ('core-study-' + st.id),
      public_id: st.cloudinary_public_id || '',
      src: st.cloudinary_url || '',
      name: (st.metadata && st.metadata.name) || st.type_name || st.study_type || 'Medical image',
      date: st.performed_date || day(st.performed_at),
      time: st.performed_time || '',
      type: st.type_name || st.modality || st.study_type || 'Medical image',
      eye: st.eye || 'OU',
      notes: st.notes || st.report || '',
      examId: null
    }];
    // `iapp_imaging_studies_core.order_id` holds the INVESTIGATION order id (verified against the
    // live iapp_create_imaging_study definition). Older code read a non-existent
    // `investigation_order_id` column, so the study -> request link was always lost.
    const studyOrderId = present(st.order_id) ? String(st.order_id) : (present(st.investigation_order_id) ? String(st.investigation_order_id) : null);
    const meta = st.metadata && typeof st.metadata === 'object' ? st.metadata : {};
    files.forEach(f => {
      const src = f.src || st.cloudinary_url || '';
      if (!src) return;
      out.push({
        ...f,
        id: f.id || f.public_id || ('core-study-' + st.id),
        public_id: f.public_id || st.cloudinary_public_id || '',
        src,
        coreStudyId: present(st.id) ? String(st.id) : null,
        coreOrderId: studyOrderId,
        coreVisitId: present(st.visit_id) ? String(st.visit_id) : null,
        studyStatus: str(st.status),
        report: str(st.report),
        studyDoctor: str(st.doctor_name),
        // The imaging screen stores the local order id in metadata.order_id when it uploads.
        ...(present(meta.order_id) && !present(f.orderId) ? { orderId: String(meta.order_id) } : {}),
        _core: true,
        _sources: ['core']
      });
    });
  });
  return out;
}

// ---- identity keys ------------------------------------------------------------
// Two records are "the same record" only when they share at least one of these.

const SHADOW_KINDS = { 'exam-visit': 'exam', 'radiology-visit': 'radiology', 'rx-visit': 'rx' };

export function visitKeys(v) {
  const k = [];
  if (!v) return k;
  if (present(v._coreId)) k.push('core:' + v._coreId);
  if (v._core && present(v.id)) k.push('core:' + v.id);
  if (present(v._legacyId)) k.push('lid:' + v._legacyId);
  if (!v._core && present(v.id)) {
    const id = String(v.id);
    k.push('lid:' + id);
    // Legacy "shadow" visits created by the examination / radiology / rx flows
    // use ids like `exam-visit:<examId>`; the Core visit created for the same
    // action carries legacy_id `exam:<examId>` (see createClinicalVisitCore
    // callers in patients-orchestration.js). The iapp_visits row mapping does
    // not persist `_coreId`, so this deterministic alias is what keeps the pair
    // from showing up twice after a reload.
    const m = /^([a-z]+-visit):(.+)$/.exec(id);
    if (m && SHADOW_KINDS[m[1]]) k.push('lid:' + SHADOW_KINDS[m[1]] + ':' + m[2]);
    const c = /^core-visit:(.+)$/.exec(id);
    if (c) k.push('core:' + c[1]);
  }
  return k;
}

export function examKeys(e) {
  const k = [];
  if (!e) return k;
  if (present(e._coreId)) k.push('core:' + e._coreId);
  if (present(e._legacyId)) k.push('lid:' + e._legacyId);
  if (!e._core && present(e.id)) k.push('lid:' + e.id);
  if (e._core && present(e.id)) k.push(isNumericId(e.id) ? 'lid:' + e.id : 'core:' + e.id);
  return k;
}

export const rxKeys = examKeys;

export function requestKeys(r) {
  const k = [];
  if (!r) return k;
  if (present(r.coreInvestigationOrderId)) k.push('inv:' + r.coreInvestigationOrderId);
  if (present(r.coreImagingOrderId)) k.push('img:' + r.coreImagingOrderId);
  if (present(r.sourceLegacyId)) k.push('src:' + r.sourceLegacyId);
  if (!r._core && present(r.id)) { k.push('lid:' + r.id); k.push('src:' + r.id); }
  return k;
}

export function imageKeys(i) {
  const k = [];
  if (!i) return k;
  if (present(i.public_id)) k.push('pid:' + i.public_id);
  if (present(i.id)) k.push('id:' + i.id);
  if (present(i.src)) k.push('src:' + i.src);
  return k;
}

// ---- merge with provenance ---------------------------------------------------

export function mergeByIdentity(legacy, core, keysFn) {
  const out = [];
  const index = new Map();
  const add = (rec, sources) => {
    const entry = { rec: { ...rec, _sources: sources } };
    out.push(entry);
    keysFn(rec).forEach(key => { if (!index.has(key)) index.set(key, entry); });
    return entry;
  };
  arr(legacy).forEach(r => add(r, (r._sources && r._sources.includes('core')) ? r._sources : ['legacy']));
  arr(core).forEach(c => {
    const ks = keysFn(c);
    const hitKey = ks.find(key => index.has(key));
    if (hitKey === undefined) { add(c, ['core']); return; }
    const entry = index.get(hitKey);
    const r = entry.rec;
    // Legacy wins; Core contributes identity + provenance only.
    entry.rec = {
      ...r,
      _coreId: present(r._coreId) ? r._coreId : (present(c._coreId) ? c._coreId : null),
      _legacyId: present(r._legacyId) ? r._legacyId : (present(c._legacyId) ? c._legacyId : null),
      _coreVisitId: present(r._coreVisitId) ? r._coreVisitId : (present(c._coreVisitId) ? c._coreVisitId : null),
      _sources: ['legacy', 'core']
    };
    keysFn(entry.rec).concat(ks).forEach(key => { if (!index.has(key)) index.set(key, entry); });
  });
  return out.map(e => e.rec);
}

// ---- the one entry point ------------------------------------------------------

const isRequestRecord = e => e && (e.status === 'requested' || (Array.isArray(e.requestedTests) && e.requestedTests.length > 0));
const byDateDesc = (a, b) => str(b.date).localeCompare(str(a.date));

export function normalizePatientFile({ patient, coreFile = null, legacy = {}, metaImages = [], today = '' } = {}) {
  if (!patient) throw new Error('patient is required');
  const file = coreFile && coreFileMatchesPatient(coreFile, patient) ? coreFile : null;
  const pid = patient.id;
  const mine = list => arr(list).filter(x => x.patientId === pid);

  const exAll = mergeByIdentity(mine(legacy.exams), mapCoreExams(file, patient), examKeys);
  const requests = mergeByIdentity(
    exAll.filter(isRequestRecord),
    mapCoreRequests(file, patient, today),
    requestKeys
  );
  const exams = exAll.filter(e => !isRequestRecord(e));
  const rxList = mergeByIdentity(mine(legacy.rx), mapCoreRx(file, patient), rxKeys);
  const visits = mergeByIdentity(mine(legacy.visits), mapCoreVisits(file, patient), visitKeys).sort(byDateDesc);
  const images = mergeByIdentity(arr(metaImages), mapCoreImages(file, patient), imageKeys);
  return { exams, requests, patientRecords: exAll, rxList, visits, images, coreMatched: !!file };
}

// ---- timeline -----------------------------------------------------------------

export const EVENT_KINDS = {
  visit: { type: 'زيارة', icon: '🩺', colorKey: 'teal', tab: 'visits' },
  examination: { type: 'فحص', icon: '🔍', colorKey: 'accent', tab: 'exams' },
  diagnosis: { type: 'تشخيص', icon: '🧬', colorKey: 'gold', tab: 'exams' },
  treatment: { type: 'علاج', icon: '💊', colorKey: 'gold', tab: 'treatment' },
  prescription: { type: 'وصفة', icon: '📋', colorKey: 'gold', tab: 'rx' },
  investigation: { type: 'طلب أشعة', icon: '🩻', colorKey: 'gold', tab: 'requests' },
  imaging: { type: 'صورة', icon: '🖼️', colorKey: 'purple', tab: 'images' },
  followup: { type: 'متابعة', icon: '📅', colorKey: 'teal', tab: 'treatment' }
};

const norm = s => str(s).trim().toLowerCase();

function mkEvent(kind, rec, fields, colors) {
  const def = EVENT_KINDS[kind];
  return {
    key: kind + ':' + str(rec.id),
    kind,
    type: def.type,
    icon: def.icon,
    color: (colors || {})[def.colorKey],
    source: { tab: def.tab, id: str(rec.id) },
    visitRef: present(rec._coreVisitId) ? str(rec._coreVisitId) : (present(rec.coreVisitId) ? str(rec.coreVisitId) : null),
    date: day(fields.date),
    time: str(fields.time),
    title: fields.title,
    detail: str(fields.detail),
    doctor: str(fields.doctor)
  };
}

export function buildPatientTimeline({ visits = [], requests = [], exams = [], rxList = [], images = [], coreFile = null, patient = null } = {}, colors) {
  const events = [];
  visits.forEach(v => events.push(mkEvent('visit', v, {
    date: v.date, time: v.time, title: tv(v.type) || t('g1.tl.clinicVisit'), detail: tv(v.result || v.complaint || v.notes), doctor: v.doctor
  }, colors)));
  requests.forEach(r => events.push(mkEvent('investigation', r, {
    date: r.date, time: r.time, title: t('g1.tl.testRequest'),
    detail: t('g1.tl.requested') + ': ' + arr(r.requestedTests).map(x => str(x.name) + ' (' + (x.eye || 'OU') + ')').join(getLang() === 'en' ? ', ' : '، ') + (r.notes ? ' · ' + tv(r.notes) : ''),
    doctor: r.doctor
  }, colors)));
  exams.forEach(e => events.push(mkEvent('examination', e, {
    date: e.date, time: e.time, title: tv(e.testType || e.type) || t('g1.tl.eyeExam'),
    detail: [tv(e.diagnosis || e.chiefComplaint || e.notes), e.treatmentPlan ? t('g1.tl.treatmentPrefix') + ': ' + tv(e.treatmentPlan) : '', e.followUp ? t('g1.tl.followUpPrefix') + ': ' + e.followUp : ''].filter(Boolean).join('\n'),
    doctor: e.doctor
  }, colors)));
  rxList.forEach(r => events.push(mkEvent('prescription', r, {
    date: r.date, time: r.time, title: t('g1.tl.prescription'),
    detail: tv(r.notes || medicinesToText(r.medications) || medicinesToText(r.medicines) || medicinesToText(r.drugs)),
    doctor: r.doctor
  }, colors)));
  images.forEach(i => events.push(mkEvent('imaging', i, {
    date: i.date, time: i.time, title: tv(i.type) || t('g1.tl.medicalImage'),
    detail: `${i.eye && i.eye !== 'OU' ? i.eye + ' · ' : ''}${i.name || ''}${i.notes ? ' · ' + i.notes : ''}`
  }, colors)));

  // Diagnoses / treatments / follow-ups that exist only as Core rows. A Core row
  // that merely mirrors an examination on the same encounter (same visit id AND
  // identical text/date) is the same clinical fact and is not shown twice.
  const file = coreFile && patient && coreFileMatchesPatient(coreFile, patient) ? coreFile : null;
  const examByVisit = new Map();
  exams.forEach(e => { if (present(e._coreVisitId)) examByVisit.set(String(e._coreVisitId), e); });
  const derived = new Set();
  const mirrored = (visitId, pick, value) => {
    const e = present(visitId) ? examByVisit.get(String(visitId)) : null;
    return !!e && norm(pick(e)) !== '' && norm(pick(e)) === norm(value);
  };
  if (file) {
    scoped(file.diagnoses, patient).forEach(d => {
      derived.add('diagnosis');
      const text = d.diagnosis || d.diagnosis_name || d.name;
      if (!present(text) || mirrored(d.visit_id, e => e.diagnosis, text)) return;
      events.push(mkEvent('diagnosis', { id: d.id, _coreVisitId: d.visit_id }, {
        date: d.diagnosed_at || d.diagnosis_date || d.created_at, title: t('g1.tl.diagnosis'),
        detail: [text, d.laterality, d.status, d.notes].filter(present).join(' · '), doctor: d.doctor_name
      }, colors));
    });
    scoped(file.treatments, patient).forEach(tr => {
      derived.add('treatment');
      const text = tr.treatment || tr.treatment_name || tr.name;
      if (!present(text) || mirrored(tr.visit_id, e => e.treatmentPlan, text)) return;
      events.push(mkEvent('treatment', { id: tr.id, _coreVisitId: tr.visit_id }, {
        date: tr.started_at || tr.treatment_date || tr.created_at, title: t('g1.tl.treatment'),
        detail: [text, tr.eye, tr.instructions, tr.notes].filter(present).join(' · '), doctor: tr.doctor_name
      }, colors));
    });
    scoped(file.followups, patient).forEach(f => {
      derived.add('followup');
      if (mirrored(f.visit_id, e => e.followUp, day(f.followup_date))) return;
      events.push(mkEvent('followup', { id: f.id, _coreVisitId: f.visit_id }, {
        date: f.followup_date, title: t('g1.tl.followUp'),
        detail: [f.reason, f.status, f.notes].filter(present).join(' · '), doctor: f.doctor_name
      }, colors));
    });
    // Backend-supplied journey rows are used only for kinds we could not derive.
    arr(file.journey).forEach(j => {
      const kind = str(j.event_type);
      if (!['diagnosis', 'treatment', 'followup'].includes(kind) || derived.has(kind)) return;
      events.push(mkEvent(kind, { id: j.id ?? j.source_id ?? `${kind}-${str(j.event_date)}-${events.length}` }, {
        date: j.event_date, time: j.event_time, title: j.title || EVENT_KINDS[kind].type, detail: j.detail, doctor: j.doctor
      }, colors));
    });
  }

  // De-duplicate on the stable key, then order newest first (undated last).
  const seen = new Set();
  const unique = events.filter(e => (seen.has(e.key) ? false : (seen.add(e.key), true)));
  return unique.sort((a, b) => {
    if (!a.date !== !b.date) return a.date ? -1 : 1;
    return b.date.localeCompare(a.date) || b.time.localeCompare(a.time) || a.key.localeCompare(b.key);
  });
}

export function filterPatientTimeline(events, filter, search) {
  const q = norm(search);
  return events.filter(e => (!filter || filter === 'All' || e.type === filter) &&
    (!q || norm(e.title + ' ' + e.detail + ' ' + e.doctor).includes(q)));
}
