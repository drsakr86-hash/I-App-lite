// tv(value): display a STORED data value (complaint, option, status, gender...) in the current language.
// Known app terms are translated both ways; free text typed by a person is returned unchanged.
import { getLang } from './index.js';
import { translateTerm } from './medical-terms.js';
export const tv = (value, lang) => translateTerm(value, lang || getLang());
