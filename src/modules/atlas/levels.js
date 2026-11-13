// Blood (hyphema) and pus (hypopyon) level in the anterior chamber, drawn on the anterior chart.
// Pure geometry + grading, no React. The level is a fraction of the anterior-chamber height measured from its floor
// (the patient sits upright, so the layer is flat and horizontal), the same way hyphema is graded.
export const LEVEL_KINDS = Object.freeze(['hyphema', 'hypopyon']);
export const LEVEL_MIN = 0.05;
export const LEVEL_STEP = 0.05;
export const LEVEL_PRESETS = Object.freeze([1 / 3, 0.5, 0.75, 1]);

const num = v => typeof v === 'number' && Number.isFinite(v);
const r1 = n => Math.round(n * 10) / 10;

// 0.05 .. 1, three decimals (so the one-third preset stays 0.333)
export const clampLevel = v => (num(v) ? Math.min(1, Math.max(LEVEL_MIN, Math.round(v * 1000) / 1000)) : LEVEL_MIN);
export const levelPercent = frac => Math.round(frac * 100);

// Hyphema grade from the fraction of the chamber filled: I up to 1/3, II 1/3 to 1/2, III over 1/2 but not total, IV total.
export function hyphemaGrade(frac) {
  if (!num(frac) || frac <= 0) return 0;
  if (frac >= 0.99) return 4;
  if (frac > 0.5) return 3;
  if (frac > 0.34) return 2;
  return 1;
}

export const levelStyle = kind => (kind === 'hypopyon' ? { f: '#fef3c7', s: '#d6b656', o: 0.95 } : { f: '#b91c1c', s: '#7f1d1d', o: 0.8 });

// SVG path of the layer inside the circle `ac` ({cx, cy, r}): everything below the horizontal line at `frac` of the height.
export function levelPath(ac, frac) {
  const { cx, cy, r } = ac;
  const f = clampLevel(frac);
  if (f >= 0.999) return `M${r1(cx - r)},${r1(cy)} A${r},${r} 0 1 0 ${r1(cx + r)},${r1(cy)} A${r},${r} 0 1 0 ${r1(cx - r)},${r1(cy)} Z`;
  const y = cy + r - 2 * r * f;
  const dx = Math.sqrt(Math.max(0, r * r - (y - cy) * (y - cy)));
  const large = y < cy ? 1 : 0; // the arc through the bottom is longer than a half circle once the level is above the middle
  return `M${r1(cx - dx)},${r1(y)} A${r},${r} 0 ${large} 0 ${r1(cx + dx)},${r1(y)} Z`;
}
