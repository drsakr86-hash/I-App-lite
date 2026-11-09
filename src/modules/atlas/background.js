// An image the doctor adds from outside as the background of the blank canvas (photo, scan, own sketch).
// Pure helpers only; the file reading / resizing is done by the screen. The picture is never edited: drawing sits on top.
export const BG_MIMES = Object.freeze(['image/png', 'image/jpeg', 'image/webp']);
export const BG_MAX_FILE_BYTES = 15 * 1024 * 1024;
export const BG_MAX_SIDE = 1600; // longest side after downscaling

export function checkBackgroundFile(file) {
  if (!file || !BG_MIMES.includes(file.type)) return 'type';
  if (!(file.size > 0) || file.size > BG_MAX_FILE_BYTES) return 'size';
  return null;
}

// Size after downscaling so the longest side is at most `max` (never enlarges).
export function scaledSize(w, h, max = BG_MAX_SIDE) {
  if (!(w > 0) || !(h > 0)) throw new Error('bad size');
  const k = Math.min(1, max / Math.max(w, h));
  return { width: Math.max(1, Math.round(w * k)), height: Math.max(1, Math.round(h * k)) };
}

// Largest rectangle of the picture's aspect ratio that fits the plate, centred ("contain").
export function fitRect(imgW, imgH, boxW, boxH) {
  if (!(imgW > 0) || !(imgH > 0) || !(boxW > 0) || !(boxH > 0)) throw new Error('bad size');
  const k = Math.min(boxW / imgW, boxH / imgH);
  const width = imgW * k, height = imgH * k;
  return { x: (boxW - width) / 2, y: (boxH - height) / 2, width, height };
}
