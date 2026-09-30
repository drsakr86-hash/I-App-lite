// Examination test-catalog constants — moved here from
// public/legacy/app-runtime.js (Phase 8, batch 2). Exact copies of the
// original values; app-runtime.js now delegates to this module instead of
// defining its own.
//
// CAT_COLORS reads the shared theme object C at module-load time (same as
// legacy did) — it is NOT reactive to later theme toggles. That is a
// pre-existing quirk being preserved exactly, not a new bug: fixing it is
// out of scope for a behavior-preserving move.

import { C } from '../theme/index.js';

export const DEFAULT_TESTS = [
  { id: 'oct', name: 'OCT', name_ar: 'تصوير الشبكية المقطعي', cat: 'شبكية' },
  { id: 'ffa', name: 'FFA', name_ar: 'تصوير الأوعية بالفلوريسين', cat: 'شبكية' },
  { id: 'optos', name: 'Optos', name_ar: 'تصوير قاع العين الواسع', cat: 'شبكية' },
  { id: 'octa', name: 'OCT Angio', name_ar: 'أنجيوغرافيا OCT', cat: 'شبكية' },
  { id: 'vf', name: 'Visual Field', name_ar: 'مجال الإبصار', cat: 'جلوكوما' },
  { id: 'penta', name: 'Pentacam', name_ar: 'خريطة القرنية', cat: 'قرنية' },
  { id: 'topo', name: 'Topography', name_ar: 'طبوغرافيا القرنية', cat: 'قرنية' },
  { id: 'pachy', name: 'Pachymetry', name_ar: 'قياس سماكة القرنية', cat: 'قرنية' },
  { id: 'bio', name: 'Biometry', name_ar: 'قياسات ما قبل الجراحة', cat: 'جراحة' },
  { id: 'echo', name: 'B-Scan', name_ar: 'سونار العين', cat: 'أخرى' },
  { id: 'erg', name: 'ERG', name_ar: 'كهربية الشبكية', cat: 'أخرى' },
  { id: 'ep', name: 'VEP', name_ar: 'استجابة القشرة البصرية', cat: 'أخرى' }
];

export const CAT_COLORS = {
  'شبكية': C.accent,
  'جلوكوما': C.teal,
  'قرنية': C.gold,
  'جراحة': C.purple,
  'أخرى': C.muted,
  'مخصص': C.success
};
