import * as g1 from './g1.js'; import * as g2 from './g2.js'; import * as g3 from './g3.js'; import * as g4 from './g4.js';
import * as g5 from './g5.js'; import * as g6 from './g6.js'; import * as g7 from './g7.js';
const all = [g1, g2, g3, g4, g5, g6, g7];
export const EXTRA_AR = Object.assign({}, ...all.map(g => g.ar));
export const EXTRA_EN = Object.assign({}, ...all.map(g => g.en));
