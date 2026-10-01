// Live data layer behind the Patients list + patient-file flow. Exact port
// of the legacy runtime's Patients() orchestrator (public/legacy/
// app-runtime.js) -- every useState/handler it ran on every render, not just
// its dead post-gate fallback JSX. Pure list filtering/sorting/code-
// generation already live in src/modules/patients/list.js and are reused
// here, not re-derived.
import { useState, useEffect, useRef } from 'react';
import { trashPut, logAudit } from '../sync/index.js';
import { sbGet, sbMutate } from '../sync/wiring.js';
import { runExamCoreSync, readExamMarkers, writeExamMarkers } from '../patient-file/exam-core-sync.js';
import { offlineNow } from '../sync/engine.js';
import { getSB, iappRpc } from '../data-access/index.js';
import { localISO } from '../constants/misc.js';
import { finishQueueEntries } from '../appointments/queue.js';
import { nextPatientCode } from './list.js';
import { createClinicalVisitCore } from '../visits/core.js';
import { prescriptionParamsFromLegacy } from '../prescriptions/prescription.mapper.js';

const rxCoreParams = (rx, visitId, today) => prescriptionParamsFromLegacy(rx, { visitId, today });

export function usePatientsOrchestration({
  patients, setPatients, exams, setExams, prescriptions, setRx, visits, setVisits,
  doctorNames = [], primaryDoctor, prices = [], clinic, initOpenId, initNewName, onInitDone,
  customTests = []
}) {
  // Always-current view of the visits list for writes that happen after an
  // `await` (a render-time closure would be seconds stale by then and a
  // setVisits(next) built from it would silently drop concurrent changes).
  const visitsRef = useRef(visits);
  visitsRef.current = visits;
  const [search, setSearch] = useState(initNewName || '');
  const [openFile, setOpenFile] = useState(null);

  useEffect(() => {
    if (initOpenId) {
      setOpenFile(initOpenId);
      if (onInitDone) onInitDone();
    } else if (initNewName) {
      setSearch(initNewName);
      if (onInitDone) onInitDone();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updP = f => setPatients(patients.map(p => (p.id === f.id ? f : p)));
  const addP = f => {
    const newP = { ...f, id: Date.now(), patientCode: nextPatientCode(patients) };
    setPatients([newP, ...patients]);
  };
  const delP = async id => {
    const rec = patients.find(p => p.id === id);
    await trashPut('iapp_patients', rec, 'مريض: ' + ((rec && rec.name) || id));
    setPatients(patients.filter(p => p.id !== id));
    logAudit('حذف مريض', (rec && rec.patientCode + ' · ' + rec.name) || id);
  };

  // Phase 30: every clinical examination must belong to a visit/encounter.
  // Keep a legacy visit shadow record for backward-compatible UI/counts, while
  // the Core visit remains the source of truth for the clinical relationship.
  const ensureLegacyVisitShadow = async ({ patientId, date, doctor, type, complaint, notes, coreVisitId = null, shadowId = null }) => {
    if (!patientId) return null;
    const pid = Number(patientId);
    const day = String(date || localISO()).slice(0, 10);
    const doc = String(doctor || '').trim();
    // Phase 33 fix (M1): only reuse a same-day visit by patient+date when the doctor
    // actually matches (or both sides are genuinely blank) — matching on "either side
    // is blank" could silently attach an examination to an unrelated visit.
    const visits = visitsRef.current || [];
    const existing = (coreVisitId && visits.find(v => String(v._coreId || '') === String(coreVisitId))) ||
      (shadowId && visits.find(v => String(v.id) === String(shadowId))) ||
      visits.find(v => Number(v.patientId) === pid && String(v.date || '').slice(0, 10) === day &&
        ((!doc && !String(v.doctor || '').trim()) || (!!doc && String(v.doctor || '').trim() === doc)));
    const rec = existing ? {
      ...existing,
      patientId: pid,
      date: existing.date || day,
      doctor: existing.doctor || doc,
      type: existing.type || type || 'clinic',
      complaint: existing.complaint || complaint || '',
      notes: existing.notes || notes || '',
      _coreId: coreVisitId || existing?._coreId || null,
      _autoFromExamination: true
    } : {
      id: shadowId || `core-visit:${coreVisitId || Date.now()}`,
      patientId: pid,
      date: day,
      type: type || 'clinic',
      doctor: doc,
      complaint: complaint || '',
      result: '',
      notes: notes || 'زيارة تلقائية مرتبطة بالفحص',
      cost: 0,
      paid: false,
      nextVisit: '',
      _coreId: coreVisitId || null,
      _autoFromExamination: true
    };
    const next = existing ? visits.map(v => (v.id === existing.id ? rec : v)) : [...visits, rec];
    await setVisits(next);
    return rec;
  };

  const saveExam = async (f, opts = {}) => {
    const ex = exams.find(e => e.id === f.id);
    const next = ex ? exams.map(e => (e.id === f.id ? f : e)) : [...exams, f];
    const legacyResult = await setExams(next);
    if (opts.onLocalSaved) opts.onLocalSaved();
    // Finishing the examination closes the patient's queue entry (called / in room -> done).
    try {
      const examDate = String(f.date || localISO()).slice(0, 10);
      const examPatient = f.patient || patients.find(p => p.id === f.patientId)?.name || '';
      sbMutate('iapp_appointments', list => finishQueueEntries(list, {
        patientId: f.patientId, patient: examPatient, date: examDate
      })).catch(() => {});
    } catch {}
    // Core write-through (see exam-core-sync.js): independent steps, create-RPCs
    // only run for values that changed since the last successful sync.
    let sync = { status: 'offline', coreSynced: false, visitId: null, steps: [], error: 'offline', markers: null, markersChanged: false };
    try {
      const sb = getSB();
      if (sb && !offlineNow()) {
        const stored = readExamMarkers(f.id);
        const examForSync = { ...f, _coreSync: { ...stored, ...(f._coreSync || {}) } };
        sync = await runExamCoreSync({
          exam: examForSync,
          patientCode: patients.find(p => p.id === f.patientId)?.patientCode || '',
          call: (name, args) => iappRpc(sb, name, args),
          findVisitId: async legacyVisitId => (await sb.from('iapp_visits_core').select('id').eq('legacy_id', legacyVisitId).maybeSingle()).data?.id || null
        });
        if (sync.markersChanged) {
          writeExamMarkers(f.id, sync.markers);
          try {
            await sbMutate('iapp_exams', list => list.map(e => (String(e.id) === String(f.id) ? { ...e, _coreSync: sync.markers } : e)));
          } catch (e) { console.warn('[exam core markers]', e?.message || e); }
        }
      }
    } catch (e) {
      sync = { ...sync, status: 'failed', error: e?.message || String(e) };
      console.warn('[core examination sync]', e);
    }
    const visitId = sync.visitId;
    const coreSynced = sync.coreSynced;
    const coreError = sync.error;
    // Phase 30: an examination itself establishes a clinical encounter locally,
    // even if Core/Supabase is temporarily unavailable — written once, with whichever
    // coreVisitId we ended up resolving (or null if Core sync didn't happen).
    await ensureLegacyVisitShadow({
      patientId: f.patientId, date: f.date, doctor: f.doctor, type: f.type || 'clinic',
      complaint: f.chiefComplaint || f.complaint || '', notes: f.notes || '',
      coreVisitId: visitId,
      shadowId: `exam-visit:${f.id}`
    });
    if (!coreSynced && coreError && legacyResult?.queued !== true) {
      console.warn('Examination saved in legacy store; Core sync pending', coreError);
    }
    return { legacyResult, coreSynced, coreError, status: sync.status, steps: sync.steps };
  };

  const saveRadiologyRequest = async rec => {
    const remote = await sbGet('iapp_exams');
    const base = Array.isArray(remote) ? remote : exams;
    const next = base.some(e => e.id === rec.id) ? base.map(e => (e.id === rec.id ? rec : e)) : [...base, rec];
    await setExams(next);
    // Investigation requests are clinical events too: create/link a visit when possible.
    try {
      const sb = getSB();
      // A request whose Core steps already failed (rec.coreSyncError) is NOT silently
      // re-sent here: that is a non-idempotent write and is retried only by the explicit
      // "resync" action.
      if (sb && !offlineNow() && rec.patientId && !rec.coreSyncError) {
        let visitId = rec.coreVisitId || null;
        if (!visitId) {
          const { data, error } = await createClinicalVisitCore(sb, {
            p_patient_id: Number(rec.patientId),
            p_appointment_id: null,
            p_doctor_name: rec.doctor || primaryDoctor?.name || '',
            p_visit_date: String(rec.date || localISO()).slice(0, 10),
            p_visit_type: 'investigation',
            p_chief_complaint: rec.complaint || '',
            p_clinical_summary: 'طلب فحص/أشعة',
            p_notes: rec.notes || '',
            p_status: 'completed'
          }, `radiology:${rec.id}`);
          if (error) throw error;
          visitId = data || null;
        }
        if (visitId) await ensureLegacyVisitShadow({
          patientId: rec.patientId,
          date: rec.date || localISO(),
          doctor: rec.doctor || primaryDoctor?.name || '',
          type: 'investigation',
          complaint: rec.complaint || '',
          notes: rec.notes || 'طلب فحص/أشعة',
          coreVisitId: visitId,
          shadowId: `radiology-visit:${rec.id}`
        });
      }
    } catch (e) {
      console.warn('[clinical visit for investigation]', e?.message || e);
    }
  };

  const delExam = async id => {
    const rec = exams.find(e => e.id === id);
    await trashPut('iapp_exams', rec, 'فحص/طلب أشعة');
    setExams(exams.filter(e => e.id !== id));
    logAudit('حذف فحص', (rec && rec.date) || id);
  };

  const saveVisit = async (f, opts = {}) => {
    const ex = visits.find(v => v.id === f.id);
    const next = ex ? visits.map(v => (v.id === f.id ? f : v)) : [...visits, f];
    const legacyResult = await setVisits(next);
    if (opts.onLocalSaved) opts.onLocalSaved();
    let coreError = null;
    try {
      const sb = getSB();
      if (sb && !offlineNow()) {
        const patient = patients.find(p => p.id === f.patientId);
        const { error } = await iappRpc(sb, 'iapp_sync_visit_core', {
          p_visit: f, p_patient_code: patient?.patientCode || ''
        });
        if (error) throw error;
      } else {
        coreError = 'offline';
      }
    } catch (e) {
      coreError = e?.message || String(e);
      console.warn('[core visit sync]', coreError);
    }
    return { legacyResult, coreSynced: !coreError, coreError };
  };

  const saveRx = async (updated, opts = {}) => {
    const old = prescriptions || [];
    const changed = (updated || []).find(r => {
      const prev = old.find(x => x.id === r.id);
      return !prev || JSON.stringify(prev) !== JSON.stringify(r);
    });
    const legacyResult = await setRx(updated || []);
    if (opts.onLocalSaved) opts.onLocalSaved();
    let coreError = null;
    if (changed && offlineNow()) coreError = 'offline';
    if (changed && !offlineNow()) {
      try {
        const sb = getSB();
        if (sb) {
          let coreVisitId = changed._coreVisitId || null;
          if (!coreVisitId) {
            const { data: visitId, error: visitError } = await createClinicalVisitCore(sb, {
              p_patient_id: Number(changed.patientId),
              p_appointment_id: null,
              p_doctor_name: changed.doctor || primaryDoctor?.name || '',
              p_visit_date: String(changed.date || localISO()).slice(0, 10),
              p_visit_type: 'prescription',
              p_chief_complaint: '',
              p_clinical_summary: 'Prescription',
              p_notes: changed.notes || '',
              p_status: 'completed'
            }, `rx:${changed.id}`);
            if (visitError) throw visitError;
            coreVisitId = visitId || null;
          }
          if (coreVisitId) {
            await ensureLegacyVisitShadow({
              patientId: changed.patientId,
              date: changed.date || localISO(),
              doctor: changed.doctor || primaryDoctor?.name || '',
              type: 'prescription',
              complaint: '',
              notes: changed.notes || 'روشتة مرتبطة بالزيارة',
              coreVisitId,
              shadowId: `rx-visit:${changed.id}`
            });
          }
          const { error } = await iappRpc(sb, 'iapp_create_prescription_core', rxCoreParams(changed, coreVisitId, localISO()));
          if (error) { coreError = error?.message || String(error); console.warn('[core prescription sync]', error); }
        } else {
          coreError = 'no-client';
        }
      } catch (e) {
        coreError = e?.message || String(e);
        console.warn('[core prescription sync]', e);
      }
    }
    return { legacyResult, coreSynced: !!changed && !coreError, coreError };
  };

  const delVisit = async id => {
    const rec = visits.find(v => v.id === id);
    await trashPut('iapp_visits', rec, 'زيارة');
    setVisits(visits.filter(v => v.id !== id));
    logAudit('حذف زيارة', (rec && rec.date + ' · ' + (rec.patient || '')) || id);
  };

  return {
    search, setSearch, openFile, setOpenFile,
    updP, addP, delP,
    saveExam, saveRadiologyRequest, delExam, saveVisit, saveRx, delVisit,
    doctorNames, primaryDoctor, prices, clinic, customTests
  };
}
