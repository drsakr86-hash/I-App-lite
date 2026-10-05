// Investigation-request save workflow (pure orchestration, all I/O injected).
//
// Fixes over the inline version in use-patient-file.js:
//  * one stable draft id per request draft: a retry after an ambiguous failure
//    re-sends the SAME legacy ids instead of minting new ones (the old code used
//    Date.now() on every click, so a double click created two visits + two orders);
//  * the imaging-orders list is updated with a read-modify-write mutation that is
//    keyed by order id (the old code rewrote the whole list from a read that could
//    have failed, which could drop existing orders);
//  * the result states exactly what happened: saved / local-only / partial / failed,
//    never "saved" when a required step failed;
//  * no automatic retry of any write.

import { t } from '../i18n/index.js';

const errText = e => (e && (e.message || e.hint || e.details)) || String(e || 'error');

export const REQUEST_MESSAGES = {
  get saved() { return t('g1.req.saved'); },
  get 'local-only'() { return t('g1.req.localOnly'); },
  get partial() { return t('g1.req.partial'); },
  get failed() { return t('g1.req.failed'); },
  get invalid() { return t('g1.req.invalid'); }
};

export function buildRequestRecords({ patient, tests, notes, doctorName, draftId, date, time, now }) {
  const rec = {
    id: draftId, patientId: patient.id, patient: patient.name, date, time,
    doctor: doctorName || '', testType: 'طلب فحوصات', requestedTests: tests,
    notes: notes || '', status: 'requested', imagingOrderId: 'ORD-' + draftId
  };
  const order = {
    id: 'ORD-' + draftId, patientId: patient.id, patient: patient.name, patientCode: patient.patientCode || '',
    doctor: doctorName || '', date, time, tests, notes: notes || '', status: 'requested',
    sourceExamId: draftId, createdAt: now
  };
  return { rec, order };
}

/**
 * deps:
 *   client()              -> supabase client or null
 *   offline()             -> boolean
 *   createVisit(sb, params, legacyId) -> { data, error }
 *   call(name, args)      -> { data, error }
 *   visitParams(ctx)      -> params for createVisit
 *   orderParams(ctx)      -> params for iapp_create_investigation_workflow_order
 *   saveLegacyRequest(rec)-> Promise (throws on failure)
 *   upsertOrder(order)    -> Promise<{ok:boolean}>
 *   today(), clock(), nowIso()
 * input: { patient, tests, notes, doctorName, draftId, resume }
 *   resume: { coreVisitId, coreInvestigationOrderId, coreImagingOrderId } from a previous partial attempt
 */
export async function submitInvestigationRequest(deps, input) {
  const { patient, tests = [], notes = '', doctorName = '', draftId } = input;
  if (!tests.length) return { status: 'invalid', message: REQUEST_MESSAGES.invalid, steps: [] };
  const steps = [];
  const { rec, order } = buildRequestRecords({
    patient, tests, notes, doctorName, draftId, date: deps.today(), time: deps.clock(), now: deps.nowIso()
  });
  const resume = input.resume || {};
  let visitId = resume.coreVisitId || null;
  let invId = resume.coreInvestigationOrderId || null;
  let imgId = resume.coreImagingOrderId || null;
  let coreAttempted = false;
  let coreError = null;

  const sb = deps.client();
  if (sb && !deps.offline()) {
    coreAttempted = true;
    try {
      if (!visitId) {
        const v = await deps.createVisit(sb, deps.visitParams({ patient, notes, doctorName }), `investigation:${draftId}`);
        if (v.error) throw v.error;
        visitId = v.data || null;
      }
      steps.push({ name: 'core-visit', ok: true });
      if (!invId) {
        const o = await deps.call('iapp_create_investigation_workflow_order', deps.orderParams({ patient, visitId, tests, notes, doctorName, draftId }));
        if (o.error) throw o.error;
        invId = (o.data && o.data.investigation_order_id) || null;
        imgId = (o.data && o.data.imaging_order_id) || null;
      }
      steps.push({ name: 'core-order', ok: true });
    } catch (e) {
      coreError = errText(e);
      steps.push({ name: visitId ? 'core-order' : 'core-visit', ok: false, error: coreError });
    }
  } else {
    coreError = 'offline';
    steps.push({ name: 'core', ok: false, error: 'offline' });
  }

  rec.coreVisitId = visitId;
  rec.coreInvestigationOrderId = invId;
  rec.coreImagingOrderId = imgId;
  rec.coreSyncError = coreError;
  order.coreInvestigationOrderId = invId;
  order.coreImagingOrderId = imgId;
  order.coreSyncError = coreError;

  let legacyOk = true;
  try { await deps.saveLegacyRequest(rec); steps.push({ name: 'legacy-request', ok: true }); } catch (e) {
    legacyOk = false;
    steps.push({ name: 'legacy-request', ok: false, error: errText(e) });
  }
  let orderOk = true;
  try {
    const r = await deps.upsertOrder(order);
    orderOk = !!(r && r.ok);
    steps.push({ name: 'imaging-order', ok: orderOk, ...(orderOk ? {} : { error: (r && r.error) || 'write-failed' }) });
  } catch (e) {
    orderOk = false;
    steps.push({ name: 'imaging-order', ok: false, error: errText(e) });
  }

  if (!coreError && !invId) {
    // The RPC answered without an order id: treat as not synced, never as success.
    coreError = 'no-order-id';
    rec.coreSyncError = coreError;
    order.coreSyncError = coreError;
  }
  const coreOk = !!invId && !coreError;
  let status;
  if (!legacyOk && !orderOk && !coreOk) status = 'failed';
  else if (coreOk && legacyOk && orderOk) status = 'saved';
  else if (!coreOk && legacyOk && orderOk) status = 'local-only';
  else status = 'partial';
  return {
    status, message: REQUEST_MESSAGES[status], steps, coreAttempted, rec, order,
    resume: { coreVisitId: visitId, coreInvestigationOrderId: invId, coreImagingOrderId: imgId },
    // The draft id may be discarded only when nothing needs a retry.
    complete: status === 'saved' || status === 'local-only'
  };
}

// Re-run only the Core part for a request that was saved locally with a recorded
// coreSyncError. Uses the request's own id as legacy id so the backend sees the
// same identity as the first attempt.
export async function resyncInvestigationRequest(deps, rec, patient) {
  if (!rec || rec.coreInvestigationOrderId) return { status: 'noop', steps: [] };
  const sb = deps.client();
  if (!sb || deps.offline()) return { status: 'offline', message: t('g1.req.offline'), steps: [] };
  const steps = [];
  try {
    let visitId = rec.coreVisitId || null;
    if (!visitId) {
      const v = await deps.createVisit(sb, deps.visitParams({ patient, notes: rec.notes, doctorName: rec.doctor }), `investigation:${rec.id}`);
      if (v.error) throw v.error;
      visitId = v.data || null;
    }
    steps.push({ name: 'core-visit', ok: true });
    const o = await deps.call('iapp_create_investigation_workflow_order', deps.orderParams({
      patient, visitId, tests: rec.requestedTests || [], notes: rec.notes, doctorName: rec.doctor, draftId: rec.id
    }));
    if (o.error) throw o.error;
    const patch = {
      coreVisitId: visitId,
      coreInvestigationOrderId: (o.data && o.data.investigation_order_id) || null,
      coreImagingOrderId: (o.data && o.data.imaging_order_id) || null,
      coreSyncError: null
    };
    steps.push({ name: 'core-order', ok: true });
    await deps.patchRequest(rec.id, patch);
    return { status: 'synced', steps, patch };
  } catch (e) {
    steps.push({ name: 'core', ok: false, error: errText(e) });
    return { status: 'failed', message: t('g1.req.syncFailed') + ': ' + errText(e), steps };
  }
}
