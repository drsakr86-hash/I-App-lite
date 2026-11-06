// Pure zoom/pan maths for the atlas canvas. A view is an SVG viewBox {x, y, w, h}; "base" is the whole plate.
// The canvas element keeps the plate's aspect ratio, so client -> plate coordinates are a plain linear map.
export const MIN_ZOOM = 1;
export const MAX_ZOOM = 8;
export const ZOOM_STEP = 1.4;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export const zoomLevel = (view, base) => base.w / view.w;

// keep the view inside the plate
export function clampView(view, base) {
  const w = clamp(view.w, base.w / MAX_ZOOM, base.w / MIN_ZOOM);
  const h = w * (base.h / base.w);
  return { x: clamp(view.x, base.x, base.x + base.w - w), y: clamp(view.y, base.y, base.y + base.h - h), w, h };
}

// Zoom by `factor` keeping the plate point (cx, cy) fixed on screen.
export function zoomAt(view, base, factor, cx, cy) {
  const level = clamp(zoomLevel(view, base) * factor, MIN_ZOOM, MAX_ZOOM);
  const w = base.w / level;
  const h = w * (base.h / base.w);
  const x = cx - (cx - view.x) * (w / view.w);
  const y = cy - (cy - view.y) * (h / view.h);
  return clampView({ x, y, w, h }, base);
}

export const zoomCentered = (view, base, factor) => zoomAt(view, base, factor, view.x + view.w / 2, view.y + view.h / 2);

// Pan by a delta expressed in plate units.
export const panBy = (view, base, dx, dy) => clampView({ ...view, x: view.x - dx, y: view.y - dy }, base);

// screen point -> plate coordinates (rect = element bounding box, view = current viewBox)
export function clientToPlate(pt, rect, view) {
  const w = rect.width || 1;
  const h = rect.height || 1;
  return { x: view.x + ((pt.x - rect.left) / w) * view.w, y: view.y + ((pt.y - rect.top) / h) * view.h };
}

// plate units per screen pixel
export const unitsPerPx = (view, rect) => view.w / (rect.width || 1);

export const pinchFactor = (prevDist, dist) => (prevDist > 0 && dist > 0 ? dist / prevDist : 1);

export const wheelFactor = deltaY => (deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP);

export const viewBoxString = v => `${round(v.x)} ${round(v.y)} ${round(v.w)} ${round(v.h)}`;
const round = n => Math.round(n * 100) / 100;

// Label text size in plate units for a constant on-screen size (px), so labels stay readable at any zoom.
export function labelFontUnits(px, view, rect) {
  return px * unitsPerPx(view, rect);
}

// On narrow screens long names do not fit beside the drawing; numbered markers + a legend are used instead.
export const NAMES_MIN_WIDTH_PX = 560;
export const defaultLabelMode = widthPx => (widthPx >= NAMES_MIN_WIDTH_PX ? 'names' : 'numbers');
