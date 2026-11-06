// Phase 2 / G5: "approve & attach" and the report switch, as plain async functions with injected dependencies
// (storage = createPrivateStorage(...), mutate = sbMutate). The UI only calls these; nothing here knows React.
// Order matters: the file is uploaded first, the record is changed second. If the second step fails the file is
// left in the private bucket (harmless, unreachable by anyone but doctor/admin) and the error names its path.
import { approveDrawing, reviseDrawing, addDrawing, setIncludeInReport, canApproveDrawing, ATLAS_DRAWINGS_KEY } from './drawings.js';

const same = (a, b) => String(a) === String(b);
const examFrom = (list, examId) => (Array.isArray(list) ? list.find(e => same(e.id, examId)) : null);

export async function attachApprovedDrawing({ storage, mutate, plate, annotations, png, thumb = null, patient, exam, user, role, replaceId = null, newId = () => globalThis.crypto.randomUUID(), now = Date.now() }) {
  if (!canApproveDrawing(role)) throw new Error('not allowed');
  if (!patient || !exam || !same(exam.patientId, patient.id)) throw new Error('exam does not belong to this patient');
  const id = newId();
  const image = await storage.uploadAtlasImage({ patientId: patient.id, blob: png, thumbBlob: thumb, id });
  let saved = null;
  try {
    await mutate('iapp_exams', list => (Array.isArray(list) ? list : []).map(e => {
      if (!same(e.id, exam.id)) return e;
      const cur = Array.isArray(e[ATLAS_DRAWINGS_KEY]) ? e[ATLAS_DRAWINGS_KEY] : [];
      const next = replaceId
        ? reviseDrawing(cur, replaceId, { newId: id, annotations, image, user, role, now })
        : addDrawing(cur, approveDrawing({ id, plateId: plate.id, plateVersion: plate.version || 1, annotations, image, patientId: patient.id, visitId: exam.visitId ?? exam.coreVisitId ?? null, examId: exam.id, user, role, now }));
      saved = next.find(d => d.id === id);
      return { ...e, [ATLAS_DRAWINGS_KEY]: next };
    }));
  } catch (err) {
    const e = new Error('file uploaded but not attached');
    e.cause = err; e.orphanPath = image.path;
    throw e;
  }
  if (!saved) { const e = new Error('exam not found'); e.orphanPath = image.path; throw e; }
  return saved;
}

export async function setDrawingReport({ mutate, examId, id, value, user, role, now = Date.now() }) {
  if (!canApproveDrawing(role)) throw new Error('not allowed');
  await mutate('iapp_exams', list => (Array.isArray(list) ? list : []).map(e => (same(e.id, examId)
    ? { ...e, [ATLAS_DRAWINGS_KEY]: setIncludeInReport(e[ATLAS_DRAWINGS_KEY] || [], id, value, { user, role, now }) }
    : e)));
}
