// Pure logic for PrintModal (src/components/modals/PrintModal.jsx). Every
// value and expression mirrors the legacy runtime's PrintModal exactly
// (public/legacy/app-runtime.js). The printed documents themselves come from
// the runtime's getGlassesHTML / getRxHTML templates and printDoc, unchanged.

export const DEFAULT_PRINT_DOCTOR = 'د. عبدالستار صقر';

// Doctor name printed on both documents: the primary doctor's full name.
export const printDoctorName = primaryDoctor => primaryDoctor && primaryDoctor.name || DEFAULT_PRINT_DOCTOR;
// A prescription with no linked patient prints with an empty patient.
export const printPatient = patient => patient || {};

// Glasses preview grid (distance row only; the reading row is always empty).
export const GLASSES_HEADERS = ['SPH', 'CYL', 'AX', 'SPH', 'CYL', 'AX'];
export const GLASSES_ROWS = ['Distance', 'Reading'];
export const GLASSES_KEYS = ['sphR', 'cylR', 'axisR', 'sphL', 'cylL', 'axisL'];
export const glassesCell = (rx, row, k) => (row === 'Distance' ? rx[k] || '' : '');

// Medicines preview: non-empty lines, first three shown, the rest counted.
// rx.medicines must be a string when truthy (legacy calls .split on it).
export const MEDICINES_PREVIEW = 3;
export const medicineLines = medicines => medicines.split('\n').filter(Boolean);
export const medicinePreview = medicines => medicineLines(medicines).slice(0, MEDICINES_PREVIEW);
export const moreMedicinesCount = medicines => medicineLines(medicines).length - MEDICINES_PREVIEW;
export const hasMoreMedicines = medicines => medicineLines(medicines).length > MEDICINES_PREVIEW;
