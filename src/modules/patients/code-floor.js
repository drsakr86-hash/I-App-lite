// Highest patient file number ever SEEN on this device. nextPatientCode() looked only at the current list, so deleting or
// merging away the last patients re-issued their numbers to new people (production: P-0062..P-0064 each used by 3 patients).
// The floor only goes up. It is a number, not patient data, and is kept across sign-out (see PHI_KEEP_KEYS).
// Limitation: it is per device; two devices can still issue the same number at the same moment (needs a server sequence,
// see docs/audit/DATABASE-AND-MIGRATION-REVIEW.md section G).
export const FLOOR_KEY = 'iapp_patient_code_floor';

const store = s => s || (typeof localStorage !== 'undefined' ? localStorage : null);
const numOf = c => parseInt(String((c && c.patientCode) || '').replace('P-', ''), 10) || 0;

export function readCodeFloor(storage) {
  try {
    const s = store(storage);
    const n = s ? Number(s.getItem(FLOOR_KEY)) : 0;
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  } catch { return 0; }
}

// Raise the floor to the highest code in `patients`. Safe to call on every render/list change.
export function raiseCodeFloor(patients, storage) {
  try {
    const s = store(storage);
    if (!s || !Array.isArray(patients)) return;
    const max = Math.max(0, ...patients.map(numOf));
    if (max > readCodeFloor(s)) s.setItem(FLOOR_KEY, String(max));
  } catch { /* storage unavailable (private mode / quota): non-fatal */ }
}
