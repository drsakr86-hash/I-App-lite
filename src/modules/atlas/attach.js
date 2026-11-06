// "Approve" for a drawing made while examining. The drawing becomes part of the exam being edited: this uploads the
// image to private storage and returns the exam's new drawing list; the exam form keeps that list in its state and it
// is saved together with the exam by the normal "Save exam" button. Plain async function, storage injected (testable).
// If the exam is never saved the uploaded file is simply not linked to anything (private, reachable only by doctor/admin).
import { approveDrawing, reviseDrawing, addDrawing, setIncludeInReport, canApproveDrawing } from './drawings.js';

export async function approveIntoList({ storage, list = [], plate, annotations, png, thumb = null, patient, exam, user, role, replaceId = null, newId = () => globalThis.crypto.randomUUID(), now = Date.now() }) {
  if (!canApproveDrawing(role)) throw new Error('not allowed');
  if (!patient || !exam || String(exam.patientId) !== String(patient.id)) throw new Error('exam does not belong to this patient');
  const cur = Array.isArray(list) ? list : [];
  const id = newId();
  const image = await storage.uploadAtlasImage({ patientId: patient.id, blob: png, thumbBlob: thumb, id });
  const next = replaceId
    ? reviseDrawing(cur, replaceId, { newId: id, annotations, image, user, role, now })
    : addDrawing(cur, approveDrawing({ id, plateId: plate.id, plateVersion: plate.version || 1, annotations, image, patientId: patient.id, visitId: exam.visitId ?? exam.coreVisitId ?? null, examId: exam.id, user, role, now }));
  return { list: next, drawing: next.find(d => d.id === id) };
}

export function setReportInList({ list, id, value, user, role, now = Date.now() }) {
  if (!canApproveDrawing(role)) throw new Error('not allowed');
  return setIncludeInReport(Array.isArray(list) ? list : [], id, value, { user, role, now });
}
