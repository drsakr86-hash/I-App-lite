// Pure parse/serialize logic for MedicinesStep's "name - dose" text format,
// extracted so it's directly testable. Exact copy of the logic that used to
// be inline in public/legacy/app-runtime.js's MedicinesStep (Phase 8, batch
// 15) -- same "Name - Dose" split-on-first-" - " convention, same fallback
// to an empty dose when there's no separator.

export function parseMedicines(medicines) {
  if (!medicines) return [];
  return medicines.split('\n').filter(Boolean).map(line => {
    const dash = line.indexOf(' - ');
    if (dash > -1) {
      return { name: line.slice(0, dash).trim(), dose: line.slice(dash + 3).trim() };
    }
    return { name: line.trim(), dose: '' };
  });
}

export function serializeMedicines(list) {
  return list.map(m => m.name + (m.dose ? ' - ' + m.dose : '')).join('\n');
}

// Used by the "save current list as a template" shortcut: only named
// medicines count, same as the legacy original.
export function medicinesTextForTemplate(meds) {
  return meds.filter(m => m.name).map(m => m.name + (m.dose ? ' - ' + m.dose : '')).join('\n');
}
