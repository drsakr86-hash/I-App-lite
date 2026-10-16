// Pure allergy helpers for the prescription form — no React, no I/O.
//
// SCOPE (on purpose): this is a TEXT match against what the clinic typed in the patient's
// "allergies" field. It shows the recorded allergy while prescribing and flags a medicine line
// that contains one of the recorded words. It does NOT know drug classes, brand/generic
// names or cross-reactivity (a recorded "بنسلين" is not matched to "Amoxicillin"), so the absence
// of a flag is never a safety statement. The decision stays with the doctor.

import { normArabic } from '../patients/list.js';

// Wordings that mean "no allergy" (compared after normArabic and without trailing punctuation).
const NONE = new Set([
  'لا يوجد', 'لايوجد', 'لا توجد', 'لا شيء', 'لا', 'لا يوجد حساسيه', 'لا توجد حساسيه',
  'no', 'none', 'nil', 'n/a', 'na', 'nkda', 'no known allergies', '-', '—'
].map(normArabic));

const stripEnd = s => s.replace(/[.!،,؛;]+$/, '').trim();

// The recorded allergy text of a patient, or '' when empty / "none".
export const allergyOf = patient => {
  const raw = String(patient && patient.allergies != null ? patient.allergies : '').trim();
  if (!raw) return '';
  return NONE.has(stripEnd(normArabic(raw))) ? '' : raw;
};

// Separate allergens in the free text; normalised, at least 3 characters (avoids matching "a", "ب").
export const allergyTerms = text =>
  String(text || '')
    .split(/[,،;؛/\n\r·+|]|\s+و\s+|\s+and\s+/i)
    .map(p => normArabic(p))
    .filter(p => p.length >= 3);

// Recorded allergens that appear inside the medicines text, in the order they were recorded.
export const allergyMatches = (allergyText, medicinesText) => {
  if (!allergyOf({ allergies: allergyText })) return [];
  const meds = normArabic(medicinesText);
  if (!meds) return [];
  const out = [];
  for (const term of allergyTerms(allergyText)) if (meds.includes(term) && !out.includes(term)) out.push(term);
  return out;
};

// What the prescription form should show for the chosen patient, or null when nothing is recorded.
export const rxAllergyAlert = (patients, f) => {
  if (!Array.isArray(patients) || !f || f.patientId == null || f.patientId === '') return null;
  const p = patients.find(x => x.id === Number(f.patientId));
  const allergy = allergyOf(p);
  if (!allergy) return null;
  return { allergy, matches: allergyMatches(allergy, f.medicines) };
};
