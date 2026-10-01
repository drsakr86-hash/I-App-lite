// Test helper: pulls literal values out of a frozen snapshot of the legacy
// runtime source, so the form models stay pinned to the exact legacy values
// they were ported from.
//
// Final batch: public/legacy/app-runtime.js itself is deleted (React is now
// the only runtime -- see the migration roadmap). These pin tests still earn
// their keep as a permanent record of "the port matches what legacy did",
// so rather than deleting them, this helper now reads a frozen copy kept
// only for tests: tests/fixtures/legacy-app-runtime-snapshot.js. It is never
// built, served, or imported by the app -- see that file's own header.
import { readFileSync } from 'node:fs';

const SRC = readFileSync(new URL('./fixtures/legacy-app-runtime-snapshot.js', import.meta.url), 'utf8');

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
