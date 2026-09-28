// Test helper: pulls literal values straight out of the legacy runtime
// source (public/legacy/app-runtime.js), so the form models are pinned to
// the legacy values rather than to a copy that could drift.
import { readFileSync } from 'node:fs';

const SRC = readFileSync(new URL('../public/legacy/app-runtime.js', import.meta.url), 'utf8');

// Body of a top-level legacy function, from "function Name(" to the next
// top-level declaration.
export function legacyFunctionSource(name) {
  const start = SRC.indexOf('\nfunction ' + name + '(');
  if (start < 0) throw new Error('legacy function not found: ' + name);
  const rest = SRC.slice(start + 1);
  const end = rest.slice(1).search(/\n(function |const |let |class |async function )/);
  return end < 0 ? rest : rest.slice(0, end + 1);
}

// Evaluates `const NAME = <expr>;` found in `src` (whole file by default),
// with the free names it uses supplied through `scope`.
export function legacyConst(name, src = SRC, scope = {}) {
  const re = new RegExp('const ' + name + ' = ');
  const m = re.exec(src);
  if (!m) throw new Error('legacy const not found: ' + name);
  let i = m.index + m[0].length;
  // Scan to the terminating ';' at bracket depth 0 (strings are simple here).
  let depth = 0, q = null;
  for (; i < src.length; i++) {
    const c = src[i];
    if (q) { if (c === q && src[i - 1] !== '\\') q = null; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; continue; }
    if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) depth--;
    else if (c === ';' && depth === 0) break;
  }
  const expr = src.slice(m.index + m[0].length, i);
  return new Function(...Object.keys(scope), 'return (' + expr + ');')(...Object.values(scope));
}
