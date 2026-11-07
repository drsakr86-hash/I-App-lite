// Draws one lesion symbol (plain data from modules/atlas/stamps.js) as SVG. Used on the canvas and in the palette.
import React from 'react';
import { getStamp } from '../../modules/atlas/stamps.js';

const sub = (v, color) => (v === '@' ? color : v);

export function StampShapes({ stamp, color }) {
  return stamp.shapes.map((sh, i) => {
    const p = { fill: sub(sh.f, color) || 'none', stroke: sub(sh.s, color) || 'none', strokeWidth: sh.sw == null ? 1 : sh.sw };
    if (sh.o != null) p.opacity = sh.o;
    if (sh.dash) p.strokeDasharray = sh.dash;
    if (sh.tf) p.transform = sh.tf;
    p.strokeLinecap = 'round'; p.strokeLinejoin = 'round';
    if (sh.t === 'circle') return <circle key={i} {...p} cx={sh.cx} cy={sh.cy} r={sh.r} />;
    if (sh.t === 'ellipse') return <ellipse key={i} {...p} cx={sh.cx} cy={sh.cy} rx={sh.rx} ry={sh.ry} />;
    if (sh.t === 'line') return <line key={i} {...p} x1={sh.x1} y1={sh.y1} x2={sh.x2} y2={sh.y2} />;
    return <path key={i} {...p} d={sh.d} />;
  });
}

// A stamp placed on the canvas: centred on (x, y), `size` plate units across, rotated by `rot` degrees.
export function PlacedStamp({ a }) {
  const stamp = getStamp(a.symbol);
  if (!stamp) return null;
  return <g data-stamp={a.symbol} transform={`translate(${a.points[0][0]},${a.points[0][1]}) rotate(${a.rot || 0}) scale(${a.size / 40})`}><StampShapes stamp={stamp} color={a.color} /></g>;
}

// Small preview for the palette.
export default function StampIcon({ stamp, color, size = 34 }) {
  return <svg width={size} height={size} viewBox="-20 -20 40 40" aria-hidden="true" style={{ display: 'block', background: '#fbf9f4', borderRadius: 6 }}><StampShapes stamp={stamp} color={color} /></svg>;
}
