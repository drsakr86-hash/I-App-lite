// Imaging-center constants and lookups — moved here from
// public/legacy/app-runtime.js (Phase 8, batch 2). Exact copies of the
// original values; app-runtime.js now delegates to this module instead of
// defining its own.

export const IMAGING_TYPES = [
  { id: 'oct', name: 'OCT', icon: '🧬', hint: 'Macular / RNFL / ONH' },
  { id: 'octa', name: 'OCT Angio', icon: '🩸', hint: 'OCTA / WF-OCTA' },
  { id: 'ffa', name: 'FFA', icon: '💉', hint: 'Fluorescein angiography' },
  { id: 'fundus', name: 'Fundus Photography', icon: '📷', hint: 'Color / Red-free / UWF' },
  { id: 'pentacam', name: 'Pentacam', icon: '🔵', hint: 'Corneal tomography' },
  { id: 'erg', name: 'ERG', icon: '📈', hint: 'Electroretinography' },
  { id: 'vf', name: 'Visual Field', icon: '◉', hint: 'Perimetry' },
  { id: 'optos', name: 'Optos', icon: '🌐', hint: 'Ultra-widefield' },
  { id: 'other', name: 'Other', icon: '📄', hint: 'Other imaging / test' }
];

export const IMAGING_EYES = [
  { v: 'OU', l: 'OU — كلتا العينين' },
  { v: 'OD', l: 'OD — اليمنى' },
  { v: 'OS', l: 'OS — اليسرى' }
];

export const IMAGING_REPORT_TEMPLATES = {
  oct: `Vitreomacular Interface:\nFoveal Contour:\nCentral Foveal Thickness OD:\nCentral Foveal Thickness OS:\nRetinal Layers:\nChoroid:\nImpression:`,
  octa: `Scan / Area:\nSuperficial Plexus:\nDeep Plexus:\nFAZ:\nNon-perfusion / Capillary Dropout:\nNeovascularization:\nImpression:`,
  ffa: `Arm-Retina Circulation:\nArterial Filling:\nVenous Emptying:\nCapillary Dropout:\nFAZ:\nLeakage / Staining / Blockage:\nImpression:`,
  fundus: `OD:\nOS:\nDisc:\nMacula:\nVessels:\nPeripheral Retina:\nImpression:`,
  pentacam: `Anterior Corneal Surface:\nPosterior Elevation:\nKeratometry:\nPachymetry:\nAstigmatism:\nImpression:`,
  erg: `Protocol:\nOD Response:\nOS Response:\nAmplitude:\nImplicit Time:\nImpression:`,
  vf: `Test Strategy:\nReliability Indices:\nMD / PSD:\nCentral Field:\nOD:\nOS:\nImpression:`,
  optos: `OD:\nOS:\nMacula:\nDisc:\nVessels:\nPeripheral Retina / 360°:\nImpression:`,
  other: `Findings:\nImpression:`
};

export const IMAGING_ORDER_STATUSES = {
  requested: 'مطلوب',
  scheduled: 'مجدول',
  in_progress: 'جارٍ التنفيذ',
  completed: 'تم التنفيذ',
  reported: 'تم التقرير',
  cancelled: 'ملغى'
};

export const imagingTypeName = id => (IMAGING_TYPES.find(x => x.id === id) || {}).name || id || '';
