import * as g1 from './g1.js'; import * as g2 from './g2.js'; import * as g3 from './g3.js'; import * as g4 from './g4.js';
import * as g5 from './g5.js'; import * as g6 from './g6.js'; import * as g7 from './g7.js'; import * as g8 from './g8.js'; import * as g9 from './g9.js'; import * as g10 from './g10.js'; import * as g11 from './g11.js'; import * as g12 from './g12.js'; import * as g13 from './g13.js'; import * as g14 from './g14.js'; import * as g15 from './g15.js'; import * as g16 from './g16.js'; import * as g17 from './g17.js';
const all = [g1, g2, g3, g4, g5, g6, g7, g8, g9, g10, g11, g12, g13, g14, g15, g16, g17];
export const EXTRA_AR = Object.assign({}, ...all.map(g => g.ar));
export const EXTRA_EN = Object.assign({}, ...all.map(g => g.en));
