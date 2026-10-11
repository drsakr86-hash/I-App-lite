// tv(value): display a STORED data value (complaint, option, status, gender...) in the current language.
// Known app terms are translated both ways; free text typed by a person is returned unchanged.
// Composite values joined with " · " (e.g. the auto note "<user note> · <recurring note>") are
// translated segment by segment; unknown segments (free text) stay unchanged.
import { getLang } from './index.js';
import { translateTerm } from './medical-terms.js';
const SEP = ' · ';
export const tv = (value, lang) => {
  const l = lang || getLang();
  if (typeof value === 'string' && value.includes(SEP)) {
    return value.split(SEP).map(part => translateTerm(part, l)).join(SEP);
  }
  return translateTerm(value, l);
};
