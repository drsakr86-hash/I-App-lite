import { safeTemplate } from './escape.js';
import {
  getDailyReportHTMLRaw,
  getPatientFileHTMLRaw,
  getRxHTMLRaw,
  getGlassesHTMLRaw,
  getRadiologyHTMLRaw,
  getAccountingReportHTMLRaw
} from './templates.js';

// Same wrapping the legacy runtime applied to every print template: escape
// every argument deeply before building the HTML string, so patient-entered
// text can never break out of the generated document.
export const getDailyReportHTML = safeTemplate(getDailyReportHTMLRaw);
export const getPatientFileHTML = safeTemplate(getPatientFileHTMLRaw);
export const getRxHTML = safeTemplate(getRxHTMLRaw);
export const getGlassesHTML = safeTemplate(getGlassesHTMLRaw);
export const getRadiologyHTML = safeTemplate(getRadiologyHTMLRaw);
export const getAccountingReportHTML = safeTemplate(getAccountingReportHTMLRaw);

export { escHTML, escDeep, safeTemplate } from './escape.js';
export {
  getDailyReportHTMLRaw,
  getPatientFileHTMLRaw,
  getRxHTMLRaw,
  getGlassesHTMLRaw,
  getRadiologyHTMLRaw,
  getAccountingReportHTMLRaw
} from './templates.js';
export { printDoc, printViaIframe, whenPrintReady } from './dom-print.js';
