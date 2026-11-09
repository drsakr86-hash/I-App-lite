// Interactive SVG canvas for one atlas plate: select a structure, zoom/pan (wheel, drag, pinch), labels, and drawn annotations.
// All geometry comes from plain plate data (src/modules/atlas); nothing is injected as raw HTML.
import React, { useRef, useState, useEffect, useCallback } from 'react';
import { partsInDrawOrder, labelText, labelPlacement, partName, pick, symAxis, plateVBox, plateImageUrl } from '../../modules/atlas/model.js';
import {
  zoomAt, panBy, clientToPlate, unitsPerPx, pinchFactor, wheelFactor, viewBoxString, labelFontUnits, zoomLevel, defaultLabelMode
} from '../../modules/atlas/viewport.js';
import { pen, arrow, penPath, arrowHead } from '../../modules/atlas/annotations.js';
import { PlacedStamp } from './StampGlyph.jsx';

const PAPER = '#fbf9f4';
const HILITE = '#e8590c';
const DRAG_PX = 5;

const GEOM = {
  path: ['d'], circle: ['cx', 'cy', 'r'], ellipse: ['cx', 'cy', 'rx', 'ry'], rect: ['x', 'y', 'width', 'height', 'rx'],
  line: ['x1', 'y1', 'x2', 'y2'], polygon: ['points'], text: ['x', 'y']
};

function shapeProps(sh, extraTransform) {
  const p = { fill: sh.f == null ? 'none' : sh.f, stroke: sh.s == null ? 'none' : sh.s, strokeWidth: sh.sw == null ? 1 : sh.sw };
  if (sh.o != null) p.opacity = sh.o;
  if (sh.dash) p.strokeDasharray = sh.dash;
  if (sh.fr) p.fillRule = sh.fr;
  const tf = [extraTransform, sh.tf].filter(Boolean).join(' ');
  if (tf) p.transform = tf;
  for (const k of GEOM[sh.t]) if (sh[k] != null) p[k] = sh[k];
  return p;
}

function renderShape(sh, key, lang, axis) {
  const variants = sh.sym ? [null, `translate(${2 * axis},0) scale(-1,1)`] : [null];
  return variants.map((mirror, vi) => {
    const k = `${key}-${vi}`;
    if (sh.t === 'text') {
      return <text key={k} x={sh.x} y={sh.y} fontSize={sh.size || 12} textAnchor={sh.anchor || 'start'} fill={sh.f || '#444'} direction="ltr" pointerEvents="none">{pick(sh.text, lang)}</text>;
    }
    const props = shapeProps(sh, mirror);
    const El = sh.t;
    const main = <El key={k} {...props} />;
    if (!sh.hit) return main;
    const hitProps = { ...props, fill: 'none', stroke: 'transparent', strokeWidth: sh.hit, strokeDasharray: undefined, pointerEvents: 'stroke', opacity: undefined };
    return <g key={k}>{main}<El {...hitProps} /></g>;
  });
}

function outline(sh, key, axis) {
  if (sh.t === 'text') return null;
  const variants = sh.sym ? [null, `translate(${2 * axis},0) scale(-1,1)`] : [null];
  return variants.map((mirror, vi) => {
    const props = { ...shapeProps(sh, mirror), fill: 'none', stroke: HILITE, strokeWidth: 3, strokeDasharray: undefined, opacity: 0.95, pointerEvents: 'none', vectorEffect: 'non-scaling-stroke' };
    const El = sh.t;
    return <El key={`${key}-${vi}`} {...props} />;
  });
}

export default function AtlasViewer({
  plate, lang, selectedId, onSelect, labelMode, bothLangs, tool, color, annotations, onAnnotate, onTextPoint, onStamp, view, onViewChange, svgRef, background = null
}) {
  const wrapRef = useRef(null);
  const localSvg = useRef(null);
  const svgEl = svgRef || localSvg;
  const base = plateVBox(plate);
  const axis = symAxis(plate);
  const [width, setWidth] = useState(640);
  const [draft, setDraft] = useState(null); // stroke/arrow being drawn
  const gesture = useRef({ pointers: new Map(), pinch: 0, pan: null, partId: null, moved: false });

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const measure = () => setWidth(el.clientWidth || 640);
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const rectOf = () => { const r = svgEl.current ? svgEl.current.getBoundingClientRect() : null; return r && r.width ? r : { left: 0, top: 0, width, height: width * (base.h / base.w) }; };
  const point = e => clientToPlate({ x: e.clientX, y: e.clientY }, rectOf(), view);

  // wheel zoom needs a non-passive listener to stop the page from scrolling while zooming
  useEffect(() => {
    const el = svgEl.current;
    if (!el) return undefined;
    const onWheel = e => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const c = clientToPlate({ x: e.clientX, y: e.clientY }, r, view);
      onViewChange(zoomAt(view, base, wheelFactor(e.deltaY), c.x, c.y));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [view, base.x, base.y, base.w, base.h, onViewChange, svgEl]);

  const partIdFrom = target => {
    let n = target;
    while (n && n.getAttribute) {
      const id = n.getAttribute('data-part');
      if (id) return id;
      n = n.parentNode;
    }
    return null;
  };

  const onPointerDown = e => {
    const g = gesture.current;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* not capturable (synthetic event): non-fatal */ }
    g.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (g.pointers.size === 2) { // second finger: switch to pinch, abandon any stroke
      const [a, b] = [...g.pointers.values()];
      g.pinch = Math.hypot(a.x - b.x, a.y - b.y);
      g.pan = null; setDraft(null);
      return;
    }
    g.partId = partIdFrom(e.target);
    g.moved = false;
    g.pan = { x: e.clientX, y: e.clientY };
    const p = point(e);
    if (tool === 'pen') setDraft({ type: 'pen', points: [[p.x, p.y]] });
    else if (tool === 'arrow') setDraft({ type: 'arrow', from: p, to: p });
  };

  const onPointerMove = e => {
    const g = gesture.current;
    if (!g.pointers.has(e.pointerId)) return;
    g.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (g.pointers.size === 2) {
      const [a, b] = [...g.pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = clientToPlate({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, rectOf(), view);
      onViewChange(zoomAt(view, base, pinchFactor(g.pinch, dist), mid.x, mid.y));
      g.pinch = dist; g.moved = true;
      return;
    }
    if (!g.pan) return;
    const dx = e.clientX - g.pan.x; const dy = e.clientY - g.pan.y;
    if (!g.moved && Math.hypot(dx, dy) < DRAG_PX) return;
    g.moved = true;
    if (tool === 'select') {
      const upx = unitsPerPx(view, rectOf());
      onViewChange(panBy(view, base, dx * upx, dy * upx));
      g.pan = { x: e.clientX, y: e.clientY };
    } else if (tool === 'pen') {
      const p = point(e);
      setDraft(d => (d && d.type === 'pen' ? { ...d, points: [...d.points, [p.x, p.y]] } : d));
    } else if (tool === 'arrow') {
      const p = point(e);
      setDraft(d => (d && d.type === 'arrow' ? { ...d, to: p } : d));
    }
  };

  const finish = (e, cancelled) => {
    const g = gesture.current;
    g.pointers.delete(e.pointerId);
    if (g.pointers.size === 1) { // one finger left after a pinch: resume panning from where it is
      const [rest] = [...g.pointers.values()];
      g.pan = { x: rest.x, y: rest.y }; g.moved = true;
      return;
    }
    if (g.pointers.size > 0) return;
    const wasPan = g.pan; const { moved, partId } = g;
    g.pan = null; g.pinch = 0;
    if (cancelled || !wasPan) { setDraft(null); return; }
    if (tool === 'select') {
      if (!moved) onSelect(partId);
    } else if (tool === 'pen' && draft) {
      onAnnotate(pen(draft.points, color));
    } else if (tool === 'arrow' && draft) {
      if (moved) onAnnotate(arrow(draft.from, draft.to, color));
    } else if (tool === 'text' && !moved) {
      onTextPoint(point(e));
    } else if (tool === 'stamp' && !moved && onStamp) {
      onStamp(point(e));
    }
    setDraft(null);
  };

  const onKey = (e, id) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(id); }
  };

  const rect = { width, left: 0, top: 0, height: width * (base.h / base.w) };
  const upx = unitsPerPx(view, rect);
  const fs = labelFontUnits(12.5, view, rect);
  const mode = labelMode || defaultLabelMode(width);
  const ordered = partsInDrawOrder(plate);
  const index = new Map(plate.parts.map((p, i) => [p.id, i + 1]));
  const zoomed = zoomLevel(view, base) > 1.001;
  const sel = selectedId ? plate.parts.find(p => p.id === selectedId) : null;

  return (
    <div ref={wrapRef} style={{ width: '100%' }}>
      <style>{'.atlas-part{cursor:pointer}.atlas-part:hover{filter:brightness(1.07)}.atlas-part:focus{outline:none}.atlas-part:focus-visible{filter:drop-shadow(0 0 3px #e8590c)}'}</style>
      <svg
        ref={svgEl}
        role="img"
        aria-label={`${pick(plate.title, lang)} — ${pick(plate.subtitle, lang)}`}
        viewBox={viewBoxString(view)}
        preserveAspectRatio="xMidYMid meet"
        xmlns="http://www.w3.org/2000/svg"
        style={{ width: '100%', height: 'auto', aspectRatio: `${base.w} / ${base.h}`, display: 'block', background: PAPER, borderRadius: 12, border: '1px solid #d9d2c3', touchAction: zoomed || tool !== 'select' ? 'none' : 'pan-y', cursor: tool === 'select' ? (zoomed ? 'grab' : 'default') : 'crosshair', userSelect: 'none', WebkitUserSelect: 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={e => finish(e, false)}
        onPointerCancel={e => finish(e, true)}
      >
        <rect x={base.x} y={base.y} width={base.w} height={base.h} fill={PAPER} />
        {background ? <image data-layer="photo" href={background.href} x={background.x} y={background.y} width={background.width} height={background.height} preserveAspectRatio="none" pointerEvents="none" /> : null}
        {plate.image ? <image data-layer="photo" href={plateImageUrl(plate)} x={0} y={0} width={plate.image.width} height={plate.image.height} preserveAspectRatio="none" pointerEvents="none" /> : null}
        <g data-layer="decor">{(plate.decor || []).map((sh, i) => renderShape(sh, `d${i}`, lang, axis))}</g>
        <g data-layer="parts">
          {ordered.map(part => (
            <g
              key={part.id}
              data-part={part.id}
              className="atlas-part"
              role="button"
              tabIndex={0}
              aria-label={partName(part, lang)}
              aria-pressed={part.id === selectedId}
              onKeyDown={e => onKey(e, part.id)}
            >
              {part.shapes.map((sh, i) => renderShape(sh, `${part.id}-${i}`, lang, axis))}
              {part.overlay ? <g pointerEvents="none">{part.overlay.map((sh, i) => renderShape(sh, `${part.id}-o${i}`, lang, axis))}</g> : null}
            </g>
          ))}
        </g>
        {sel ? <g data-ui="1" pointerEvents="none">{sel.shapes.map((sh, i) => outline(sh, `sel-${i}`, axis))}</g> : null}
        {mode !== 'off' ? (
          <g data-layer="labels" fontFamily="'Segoe UI',Tahoma,Arial,sans-serif">
            {plate.parts.map(part => {
              const L = labelPlacement(part);
              const active = part.id === selectedId;
              if (mode === 'numbers') {
                const r = 10 * upx;
                return (
                  <g key={part.id} data-part={part.id} style={{ cursor: 'pointer' }}>
                    <circle cx={L.ax} cy={L.ay} r={r} fill={active ? HILITE : '#1f2937'} stroke="#fff" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
                    <text x={L.ax} y={L.ay} fontSize={11 * upx} fill="#fff" textAnchor="middle" dominantBaseline="central" direction="ltr" pointerEvents="none">{index.get(part.id)}</text>
                  </g>
                );
              }
              return (
                <g key={part.id} data-part={part.id} style={{ cursor: 'pointer' }}>
                  <line x1={L.ax} y1={L.ay} x2={L.lineX} y2={L.lineY} stroke={active ? HILITE : '#4b5563'} strokeWidth={active ? 1.6 : 0.9} vectorEffect="non-scaling-stroke" pointerEvents="none" />
                  <circle cx={L.ax} cy={L.ay} r={2.6 * upx} fill={active ? HILITE : '#d62828'} pointerEvents="none" />
                  <text x={L.lx} y={L.ly} fontSize={fs} fill={active ? HILITE : '#1f2937'} fontWeight={active ? 700 : 500} textAnchor={L.anchor} direction="ltr" stroke={PAPER} strokeWidth={3 * upx} paintOrder="stroke" strokeLinejoin="round">
                    {labelText(part, lang, bothLangs)}
                  </text>
                </g>
              );
            })}
          </g>
        ) : null}
        <g data-layer="annotations" pointerEvents="none" fontFamily="'Segoe UI',Tahoma,Arial,sans-serif">
          {annotations.map(a => {
            if (a.type === 'stamp') return <PlacedStamp key={a.id} a={a} />;
            if (a.type === 'pen') return <path key={a.id} d={penPath(a.points)} fill="none" stroke={a.color} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />;
            if (a.type === 'arrow') {
              return (
                <g key={a.id}>
                  <line x1={a.points[0][0]} y1={a.points[0][1]} x2={a.points[1][0]} y2={a.points[1][1]} stroke={a.color} strokeWidth={3} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                  <polygon points={arrowHead(a.points[0], a.points[1], 13 * upx)} fill={a.color} />
                </g>
              );
            }
            return <text key={a.id} x={a.points[0][0]} y={a.points[0][1]} fontSize={14 * upx} fill={a.color} fontWeight={700} direction="ltr" stroke={PAPER} strokeWidth={3 * upx} paintOrder="stroke">{a.text}</text>;
          })}
          {draft && draft.type === 'pen' ? <path d={penPath(draft.points.map(p => [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10]))} fill="none" stroke={color} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" /> : null}
          {draft && draft.type === 'arrow' ? (
            <g>
              <line x1={draft.from.x} y1={draft.from.y} x2={draft.to.x} y2={draft.to.y} stroke={color} strokeWidth={3} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
              <polygon points={arrowHead([draft.from.x, draft.from.y], [draft.to.x, draft.to.y], 13 * upx)} fill={color} />
            </g>
          ) : null}
        </g>
      </svg>
    </div>
  );
}
