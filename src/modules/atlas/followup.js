// Follow-up: the last approved drawing of the same chart (same eye) for this patient, so the doctor can lay it faintly
// under today's drawing to compare, or copy its markings as the starting point. Pure functions over the exams the
// patient file already holds; nothing is read from anywhere else and nothing is written.
import { currentDrawings } from './drawings.js';
import { sanitize, newId } from './annotations.js';

// -> { examId, examDate, approvedAt, annotations } of the newest approved drawing of `plateId`, or null.
// The exam being edited is excluded (its own drawing is not "previous"). Roles that may not see drawings get null.
export function priorDrawing({ exams, patientId, plateId, excludeExamId = null, role }) {
  let best = null;
  for (const e of Array.isArray(exams) ? exams : []) {
    if (!e || String(e.patientId) !== String(patientId)) continue;
    if (excludeExamId != null && String(e.id) === String(excludeExamId)) continue;
    for (const d of currentDrawings(e.atlasDrawings, role)) {
      if (d.plateId !== plateId) continue;
      const at = String(d.approvedAt || '');
      if (!best || at > best.approvedAt) best = { examId: e.id, examDate: String(e.date || ''), approvedAt: at, annotations: sanitize(d.annotations) };
    }
  }
  return best && best.annotations.length ? best : null;
}

// A copy of earlier markings with fresh ids, so they never collide with (or overwrite) the old drawing's own records.
export const carryForward = list => sanitize(list).map(a => ({ ...a, id: newId() }));
