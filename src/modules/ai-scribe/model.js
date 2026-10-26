// Pure logic of the AI scribe panel in ExamForm: turns the server's draft into reviewable rows and applies the ones the
// doctor ticks. Nothing is saved here; the exam is stored only by the form's own "save" button.

// Fields in sheet order, with the i18n key of the label the form already uses.
export const SCRIBE_ROWS = [
  ['chiefComplaint', 'g2.exam.chiefComplaint'],
  ['visualAcuityR', 'ai.scribe.vaR'],
  ['visualAcuityL', 'ai.scribe.vaL'],
  ['iopR', 'ai.scribe.iopR'],
  ['iopL', 'ai.scribe.iopL'],
  ['colorVision', 'g2.exam.sel.colorVision'],
  ['coverTest', 'g2.exam.sel.coverTest'],
  ['contrast', 'g2.exam.sel.contrast'],
  ['anteriorSegment', 'g2.exam.anterior'],
  ['posteriorSegment', 'g2.exam.posterior'],
  ['diagnosis', 'g2.exam.dx'],
  ['treatmentPlan', 'g2.exam.plan'],
  ['followUp', 'g2.common.followUpDate'],
  ['notes', 'g2.common.notes']
];
// Defaults of blankExam(): a field still at its default counts as empty, so the draft may fill it.
const DEFAULTS = { colorVision: 'طبيعي', contrast: 'طبيعي', coverTest: 'طبيعي' };
const isEmpty = (k, v) => v == null || String(v).trim() === '' || DEFAULTS[k] === v;

// One row per drafted field. A field the doctor already filled differently is a conflict and starts unticked.
export function draftRows(form, draft) {
  const fields = (draft && draft.fields) || {};
  const evidence = (draft && draft.evidence) || {};
  return SCRIBE_ROWS.filter(([k]) => fields[k]).map(([key, label]) => {
    const current = form ? form[key] : '';
    const same = String(current || '') === String(fields[key]);
    const conflict = !same && !isEmpty(key, current);
    return { key, label, value: fields[key], current: current || '', quote: evidence[key] || '', conflict, same, checked: !conflict && !same };
  });
}

export const defaultSelection = rows => Object.fromEntries(rows.map(r => [r.key, r.checked]));

// Ticked rows overwrite the form; the exam records that the scribe was used and the consent was confirmed.
export function applyDraft(form, rows, selection, meta = {}) {
  const next = { ...form };
  let n = 0;
  for (const r of rows) if (selection[r.key] && !r.same) { next[r.key] = r.value; n++; }
  if (n) next.aiScribe = { used: true, consent: true, model: meta.model || '', at: meta.at || '' };
  return { form: next, applied: n };
}

// Recorder mime type: webm/opus (Chrome, Android WebView) first, then mp4 (Safari / iOS).
export function pickMime(isSupported) {
  const opts = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
  for (const m of opts) { try { if (isSupported(m)) return m; } catch { /* ignore */ } }
  return '';
}

export const formatClock = sec => { const s = Math.max(0, Math.floor(sec)); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };
// Soft cap so one request stays well under the server's audio limit.
export const SCRIBE_MAX_SECONDS = 15 * 60;
