// Blood / pus level tool of the anterior chart: pick the layer, set how high it reaches (presets or slider) and the
// hyphema grade is shown. The level is an annotation (type "level"), so it undoes, persists and exports with the drawing.
import React, { useState, useEffect } from 'react';
import { C } from '../../modules/theme/index.js';
import { t } from '../../modules/i18n/index.js';
import { LEVEL_KINDS, LEVEL_MIN, LEVEL_STEP, LEVEL_PRESETS, hyphemaGrade, levelPercent, levelStyle, clampLevel } from '../../modules/atlas/levels.js';
import { levelOf, setLevel, removeLevel } from '../../modules/atlas/annotations.js';

const btn = (on, extra = {}) => ({
  background: on ? `${C.accent}22` : C.card, border: `1px solid ${on ? C.accent : C.border}`, color: on ? C.accent : C.text,
  borderRadius: 10, padding: '7px 11px', fontSize: 13, fontWeight: 600, cursor: 'pointer', minHeight: 36, ...extra
});
const PRESET_KEYS = ['third', 'half', 'three', 'total'];

export default function LevelPanel({ lang, annotations, onChange }) {
  const [kind, setKind] = useState('hyphema');
  const cur = levelOf(annotations, kind);
  const [frac, setFrac] = useState(cur ? cur.frac : 0.3);
  // switching layer shows that layer's own level
  useEffect(() => { const c = levelOf(annotations, kind); if (c) setFrac(c.frac); }, [kind]); // eslint-disable-line react-hooks/exhaustive-deps

  const apply = f => { const v = clampLevel(f); setFrac(v); onChange(setLevel(annotations, kind, v)); };
  const shown = cur ? cur.frac : null;
  const grade = kind === 'hyphema' && shown != null ? hyphemaGrade(shown) : 0;

  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 14, fontWeight: 800 }}>{t('atlas.level.title', lang)}</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {LEVEL_KINDS.map(k => (
          <button key={k} type="button" aria-pressed={kind === k} style={{ ...btn(kind === k), display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => setKind(k)}>
            <span aria-hidden="true" style={{ width: 12, height: 12, borderRadius: 6, background: levelStyle(k).f, border: `1px solid ${levelStyle(k).s}` }} />
            {t(`atlas.level.${k}`, lang)}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {LEVEL_PRESETS.map((p, i) => (
          <button key={PRESET_KEYS[i]} type="button" aria-pressed={shown != null && Math.abs(shown - p) < 0.005} style={btn(shown != null && Math.abs(shown - p) < 0.005)} onClick={() => apply(p)}>{t(`atlas.level.p.${PRESET_KEYS[i]}`, lang)}</button>
        ))}
      </div>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: C.muted }}>
        {t('atlas.level.height', lang)}: <b style={{ color: C.text }}>{levelPercent(frac)}%</b>
        <input type="range" min={LEVEL_MIN} max={1} step={LEVEL_STEP} value={Math.round(frac * 100) / 100} onChange={e => apply(Number(e.target.value))} aria-label={t('atlas.level.height', lang)} />
      </label>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        {shown == null ? <span style={{ fontSize: 12, color: C.muted }}>{t('atlas.level.none', lang)}</span>
          : kind === 'hyphema' ? <span role="status" style={{ fontSize: 13, fontWeight: 700 }}>{t('atlas.level.grade', lang)}: {t(`atlas.level.g${grade}`, lang)}</span>
          : <span role="status" style={{ fontSize: 13, fontWeight: 700 }}>{levelPercent(shown)}%</span>}
        {shown != null ? <button type="button" style={btn(false)} onClick={() => onChange(removeLevel(annotations, kind))}>{t('atlas.level.remove', lang)}</button> : null}
      </div>
      <div style={{ fontSize: 12, color: C.muted }}>{t('atlas.level.hint', lang)}</div>
    </div>
  );
}
