// Compares the suggested reply with what the secretary actually sent, so the assistant can be improved from real edits.
// Only a number and a label are kept (never the text).
const words = s => String(s || '').replace(/[ً-ٟـ]/g, '').split(/\s+/).filter(Boolean);

// Share of the suggestion that was changed, 0 (identical) .. 1 (nothing in common), by word-level longest common subsequence.
export function editRatio(original, sent) {
  const a = words(original), b = words(sent);
  if (!a.length && !b.length) return 0;
  if (!a.length || !b.length) return 1;
  let prev = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    const cur = [0];
    for (let j = 1; j <= b.length; j++) cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]);
    prev = cur;
  }
  return 1 - prev[b.length] / Math.max(a.length, b.length);
}

export function draftOutcome(original, sent) {
  const r = editRatio(original, sent);
  return { ratio: Math.round(r * 100) / 100, outcome: r === 0 ? 'as_is' : r <= 0.5 ? 'edited' : 'rewritten' };
}
