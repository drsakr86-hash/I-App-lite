// Save/delete for intravitreal injection records. Exact copy of the legacy
// runtime's saveInjection/deleteInjection (public/legacy/app-runtime.js) --
// used only by src/components/InjectionsSection.jsx.
import { sbMutate } from '../sync/wiring.js';
import { trashPut, logAudit } from '../sync/index.js';
import { INJ_KEY } from './followups-model.js';

export async function saveInjection(rec) {
  const res = await sbMutate(INJ_KEY, list => (list.some(x => x.id === rec.id) ? list.map(x => (x.id === rec.id ? rec : x)) : [...list, rec]), list => list.some(x => x.id === rec.id));
  if (res.ok) logAudit('تسجيل حقنة', (rec.patient || '') + ' · ' + (rec.drug || '') + ' · ' + (rec.eye || ''));
  return res.ok ? res.data : null;
}

export async function deleteInjection(id, rec) {
  await trashPut(INJ_KEY, rec, 'حقنة: ' + ((rec && rec.patient) || ''));
  const res = await sbMutate(INJ_KEY, list => list.filter(x => x.id !== id));
  if (res.ok) logAudit('حذف حقنة', (rec && rec.patient) || id);
  return res.ok ? res.data : null;
}
