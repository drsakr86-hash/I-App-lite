import React, { useRef, useState } from 'react';
import { C } from '../../modules/theme/index.js';
import { useLang, t } from '../../modules/i18n/index.js';
import { inp } from '../../modules/ui/atoms.jsx';
import {
  VIEW, MAX_DIAGRAMS, MAX_STROKES, MAX_NOTE, INK, INK_KEYS, WIDTHS, TEMPLATES,
  blankDiagram, makeStroke, strokePath, hitStroke, templateShapes, normalizeDiagrams, diagramIsEmpty
} from '../../modules/exam-diagrams/model.js';

const PAPER = '#ffffff';

// One template shape -> React element (the print template renders the same list as a string).
function Shape({ sh }) {
  const common = { stroke: sh.col, strokeWidth: sh.w || 3, fill: 'none' };
  if (sh.k === 'circle') return <circle cx={sh.cx} cy={sh.cy} r={sh.r} {...common} fill={sh.fill || 'none'} strokeDasharray={sh.dash} />;
  if (sh.k === 'line') return <line x1={sh.x1} y1={sh.y1} x2={sh.x2} y2={sh.y2} stroke={sh.col} strokeWidth={sh.w || 2} />;
  if (sh.k === 'rect') return <rect x={sh.x} y={sh.y} width={sh.w} height={sh.h} fill="none" stroke={sh.col} strokeWidth={sh.w2 || 3} />;
  if (sh.k === 'path') return <path d={sh.d} {...common} />;
  if (sh.k === 'text') return <text x={sh.x} y={sh.y} fontSize={sh.s || 30} fill={sh.col} textAnchor="middle" fontFamily="sans-serif" fontWeight={sh.bold ? 700 : 400}>{sh.text}</text>;
  return null;
}

// Read-only picture of a diagram (template + strokes). Used by the editor, the patient-file view.
export function DiagramSvg({ diagram, size, live, style }) {
  const shapes = templateShapes(diagram.tpl);
  return (
    <svg
      viewBox={`0 0 ${VIEW} ${VIEW}`}
      width={size}
      height={size}
      role="img"
      aria-label={t('g2.diag.tpl.' + diagram.tpl)}
      style={{ background: PAPER, borderRadius: 10, border: `1px solid ${C.border}`, maxWidth: '100%', height: 'auto', display: 'block', ...style }}
    >
      {shapes.map((sh, i) => <Shape key={i} sh={sh} />)}
      {diagram.strokes.map((s, i) => (
        <path key={i} d={strokePath(s)} fill="none" stroke={INK[s.c] || INK.k} strokeWidth={WIDTHS[s.w] || 8} strokeLinecap="round" strokeLinejoin="round" />
      ))}
      {live && live.p.length >= 2 && (
        <path d={strokePath(live)} fill="none" stroke={INK[live.c] || INK.k} strokeWidth={WIDTHS[live.w] || 8} strokeLinecap="round" strokeLinejoin="round" />
      )}
    </svg>
  );
}

const chip = (active, color) => ({
  minHeight: 40, minWidth: 40, padding: '6px 10px', borderRadius: 10, cursor: 'pointer', font: 'inherit', fontSize: 12, fontWeight: 700,
  border: `2px solid ${active ? (color || C.accent) : C.border}`, background: active ? (color || C.accent) + '22' : 'transparent', color: active ? (color || C.accent) : C.muted
});

// Drawing surface: pointer events (finger / stylus / mouse), vector strokes, stroke eraser, undo.
function Editor({ diagram, onChange, onDone }) {
  const lang = useLang();
  const svgRef = useRef(null);
  const drawing = useRef(null);   // { pts: [] } while a pointer is down
  const [ink, setInk] = useState('r');
  const [width, setWidth] = useState(2);
  const [erase, setErase] = useState(false);
  const [live, setLive] = useState(null);
  const strokes = diagram.strokes;

  const toView = e => {
    const r = svgRef.current.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * VIEW, ((e.clientY - r.top) / r.height) * VIEW];
  };
  const eraseAt = (x, y) => {
    const k = hitStroke(strokes, x, y);
    if (k !== -1) onChange({ ...diagram, strokes: strokes.filter((_, i) => i !== k) });
  };
  const down = e => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    try { svgRef.current.setPointerCapture(e.pointerId); } catch { /* capture is best-effort */ }
    const [x, y] = toView(e);
    if (erase) { drawing.current = { erasing: true }; eraseAt(x, y); return; }
    if (strokes.length >= MAX_STROKES) return;
    drawing.current = { pts: [x, y] };
    setLive({ c: ink, w: width, p: [Math.round(x), Math.round(y)] });
  };
  const move = e => {
    const d = drawing.current;
    if (!d) return;
    const [x, y] = toView(e);
    if (d.erasing) { eraseAt(x, y); return; }
    d.pts.push(x, y);
    setLive({ c: ink, w: width, p: d.pts.map(Math.round) });
  };
  const up = () => {
    const d = drawing.current;
    drawing.current = null;
    setLive(null);
    if (!d || d.erasing) return;
    const s = makeStroke(d.pts, ink, width);
    if (s) onChange({ ...diagram, strokes: [...strokes, s] });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
        {INK_KEYS.map(k => (
          <button
            type="button" key={k}
            aria-label={t('g2.diag.color.' + k)} aria-pressed={!erase && ink === k} title={t('g2.diag.color.' + k)}
            onClick={() => { setInk(k); setErase(false); }}
            style={{ ...chip(!erase && ink === k, INK[k]), padding: 0, width: 40 }}
          ><span style={{ display: 'block', margin: '0 auto', width: 18, height: 18, borderRadius: 9, background: INK[k] }} /></button>
        ))}
        <span aria-hidden="true" style={{ width: 1, alignSelf: 'stretch', background: C.border, margin: '0 2px' }} />
        {[1, 2, 3].map(w => (
          <button type="button" key={w} aria-label={t('g2.diag.width' + w)} aria-pressed={width === w} onClick={() => setWidth(w)} style={chip(width === w)}>
            <span style={{ display: 'inline-block', width: 20, height: WIDTHS[w] / 2 + 1, borderRadius: 4, background: 'currentColor', verticalAlign: 'middle' }} />
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        <button type="button" aria-pressed={erase} onClick={() => setErase(v => !v)} style={chip(erase, C.gold)}>🧽 {t('g2.diag.eraser', lang)}</button>
        <button type="button" disabled={!strokes.length} onClick={() => onChange({ ...diagram, strokes: strokes.slice(0, -1) })} style={{ ...chip(false), opacity: strokes.length ? 1 : 0.4 }}>↩ {t('g2.diag.undo', lang)}</button>
        <button
          type="button" disabled={!strokes.length}
          onClick={() => { if (window.confirm(t('g2.diag.clearConfirm', lang))) onChange({ ...diagram, strokes: [] }); }}
          style={{ ...chip(false, C.danger), opacity: strokes.length ? 1 : 0.4 }}
        >🗑 {t('g2.diag.clear', lang)}</button>
        <button type="button" onClick={onDone} style={{ ...chip(true, C.success), marginInlineStart: 'auto' }}>✓ {t('g2.diag.done', lang)}</button>
      </div>
      <div ref={svgRef} style={{ touchAction: 'none', lineHeight: 0, userSelect: 'none', WebkitUserSelect: 'none' }}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        <DiagramSvg diagram={diagram} live={live} style={{ width: '100%', cursor: erase ? 'cell' : 'crosshair' }} />
      </div>
      <div style={{ color: C.muted, fontSize: 10 }}>{t('g2.diag.legend', lang)}</div>
      <input
        style={inp()} dir="auto" maxLength={MAX_NOTE} value={diagram.note}
        aria-label={t('g2.diag.note', lang)} placeholder={t('g2.diag.notePh', lang)}
        onChange={e => onChange({ ...diagram, note: e.target.value })}
      />
    </div>
  );
}

// Form section: list of diagrams on this exam + "add" buttons. `value` is exam.diagrams.
export default function ExamDiagrams({ value, onChange }) {
  const lang = useLang();
  const list = normalizeDiagrams(value);
  const [openId, setOpenId] = useState(null);
  const setOne = d => onChange(list.map(x => (x.id === d.id ? d : x)));
  const add = tpl => {
    if (list.length >= MAX_DIAGRAMS) return;
    const base = Date.now();
    let id = base;
    while (list.some(x => x.id === id)) id += 1;
    onChange([...list, blankDiagram(tpl, id)]);
    setOpenId(id);
  };
  const remove = d => {
    if (!diagramIsEmpty(d) && !window.confirm(t('g2.diag.deleteConfirm', lang))) return;
    onChange(list.filter(x => x.id !== d.id));
    if (openId === d.id) setOpenId(null);
  };
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 12 }}>
      <div style={{ color: C.text, fontWeight: 700, fontSize: 13, marginBottom: 4 }}>🖍 {t('g2.diag.title', lang)}</div>
      <div style={{ color: C.muted, fontSize: 11, marginBottom: 10 }}>{t('g2.diag.hint', lang)}</div>
      {list.map(d => (
        <div key={d.id} style={{ borderTop: `1px solid ${C.border}`, padding: '10px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ color: C.accent, fontWeight: 700, fontSize: 12, flex: 1 }}>{t('g2.diag.tpl.' + d.tpl, lang)}</span>
            {openId !== d.id && <button type="button" onClick={() => setOpenId(d.id)} style={chip(false, C.accent)}>✏ {t('g2.diag.edit', lang)}</button>}
            <button type="button" aria-label={t('g2.common.delete', lang)} onClick={() => remove(d)} style={chip(false, C.danger)}>🗑</button>
          </div>
          {openId === d.id
            ? <Editor diagram={d} onChange={setOne} onDone={() => setOpenId(null)} />
            : (
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <div role="button" tabIndex={0} onClick={() => setOpenId(d.id)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpenId(d.id); } }}>
                  <DiagramSvg diagram={d} size={110} />
                </div>
                {d.note && <div style={{ color: C.text, fontSize: 12 }} dir="auto">{d.note}</div>}
              </div>
            )}
        </div>
      ))}
      {list.length < MAX_DIAGRAMS ? (
        <div style={{ borderTop: list.length ? `1px solid ${C.border}` : 'none', paddingTop: list.length ? 10 : 0 }}>
          <div style={{ color: C.muted, fontSize: 11, marginBottom: 6 }}>{t('g2.diag.add', lang)}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {TEMPLATES.map(tpl => <button type="button" key={tpl} onClick={() => add(tpl)} style={chip(false)}>+ {t('g2.diag.tpl.' + tpl, lang)}</button>)}
          </div>
        </div>
      ) : <div style={{ color: C.muted, fontSize: 11 }}>{t('g2.diag.max', lang)}</div>}
    </div>
  );
}

// Read-only list for the patient file / exam card. Tapping a thumbnail enlarges it.
export function ExamDiagramsView({ diagrams }) {
  const lang = useLang();
  const list = normalizeDiagrams(diagrams).filter(d => !diagramIsEmpty(d));
  const [big, setBig] = useState(null);
  if (!list.length) return null;
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ color: C.muted, fontSize: 10, marginBottom: 4 }}>🖍 {t('g2.diag.title', lang)}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {list.map(d => (
          <div key={d.id} style={{ width: big === d.id ? '100%' : 120 }}>
            <div role="button" tabIndex={0} aria-label={t('g2.diag.tpl.' + d.tpl, lang)}
              onClick={() => setBig(big === d.id ? null : d.id)}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setBig(big === d.id ? null : d.id); } }}
              style={{ cursor: 'pointer' }}>
              <DiagramSvg diagram={d} style={{ width: '100%', maxWidth: big === d.id ? 420 : 120 }} />
            </div>
            <div style={{ color: C.muted, fontSize: 10, marginTop: 2 }}>{t('g2.diag.tpl.' + d.tpl, lang)}</div>
            {d.note && <div style={{ color: C.text, fontSize: 11 }} dir="auto">{d.note}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
