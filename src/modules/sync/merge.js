// Three-way merge of id-keyed record lists (base = last synced copy).
// Local edits win over remote when both changed; untouched records take the remote copy.
export function mergeData(base, local, remote) {
  const okList = a => Array.isArray(a) && a.every(x => x && typeof x === "object" && x.id !== undefined && x.id !== null);
  if (!okList(local) || !okList(remote) || base != null && !okList(base)) return local;
  const mp = a => new Map((a || []).map(x => [String(x.id), x]));
  const B = mp(base),
    L = mp(local),
    R = mp(remote);
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const out = [];
  for (const [id, l] of L) {
    const b = B.get(id),
      r = R.get(id);
    if (!b) out.push(l);else if (!same(l, b)) out.push(l);else if (r) out.push(r);
  }
  for (const [id, r] of R) {
    if (L.has(id)) continue;
    const b = B.get(id);
    if (!b) out.push(r);else if (!same(r, b)) out.push(r);
  }
  return out;
}
