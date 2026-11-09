// Plate 2 -- Retinal layers (schematic cross-section through the neurosensory retina, RPE and choroid; not to scale).
// Original vector artwork drawn for this project; see docs/ATLAS.md. Content status: draft until a doctor approves it.
const X0 = 150, X1 = 410, W = X1 - X0;
const band = (y0, y1, f, s = '#8a7a6a') => ({ t: 'rect', x: X0, y: y0, width: W, height: y1 - y0, f, s, sw: 0.8 });
// staggered dots (cell nuclei) inside a band
const nuclei = (y0, y1, dx, r, f, s) => {
  const out = [];
  const rows = Math.max(1, Math.floor((y1 - y0 - r) / (r * 2.1)));
  for (let j = 0; j < rows; j++) {
    const y = y0 + r + 1 + j * ((y1 - y0 - 2 * r - 2) / Math.max(1, rows - 1 || 1));
    for (let x = X0 + r + 3 + (j % 2) * (dx / 2); x < X1 - r; x += dx) out.push({ t: 'circle', cx: Math.round(x * 10) / 10, cy: Math.round(y * 10) / 10, r, f, s, sw: 0.5 });
  }
  return out;
};
const fibres = (y0, y1, f) => { const out = []; for (let y = y0 + 4; y < y1 - 2; y += 6) out.push({ t: 'line', x1: X0 + 2, y1: y, x2: X1 - 2, y2: y, s: f, sw: 1.4 }); return out; };
const layers = (y0, y1, s) => { const out = []; for (let x = X0 + 10; x < X1; x += 22) out.push({ t: 'line', x1: x, y1: y0 + 3, x2: x + 4, y2: y1 - 3, s, sw: 0.9 }); return out; };
const photoreceptors = () => {
  const out = [];
  let i = 0;
  for (let x = X0 + 6; x < X1 - 4; x += 9, i++) {
    if (i % 4 === 3) { // cone
      out.push({ t: 'path', d: `M${x - 3.5},262 L${x + 3.5},262 L${x + 3.5},282 L${x + 1},300 L${x - 1},300 L${x - 3.5},282 Z`, f: '#7fb069', s: '#4f7a3f', sw: 0.6 });
    } else { // rod
      out.push({ t: 'rect', x: x - 2.5, y: 262, width: 5, height: 22, rx: 1.5, f: '#e0a93d', s: '#a87a1c', sw: 0.5 });
      out.push({ t: 'rect', x: x - 2, y: 284, width: 4, height: 30, rx: 2, f: '#f3d68a', s: '#c9a24a', sw: 0.5 });
    }
  }
  return out;
};
const vessels = () => {
  const out = [];
  for (let x = X0 + 16; x < X1 - 10; x += 26) out.push({ t: 'ellipse', cx: x, cy: 352, rx: 9, ry: 3, f: '#d9645c', s: '#7a2a2a', sw: 0.6 });
  for (let x = X0 + 30; x < X1 - 20; x += 62) out.push({ t: 'ellipse', cx: x, cy: 372, rx: 14, ry: 6, f: '#c84a4a', s: '#6e1f1f', sw: 0.7 });
  for (let x = X0 + 60; x < X1 - 30; x += 110) out.push({ t: 'ellipse', cx: x, cy: 392, rx: 22, ry: 8, f: '#b83a3a', s: '#5e1414', sw: 0.8 });
  return out;
};
const L = (id, name, short, desc, y0, y1, fill, label, extra = {}) => ({
  id, name, short, desc, shapes: [band(y0, y1, fill, extra.stroke)], overlay: extra.overlay, anchor: [X1 - 6, (y0 + y1) / 2], label: [446, label, 's']
});

export default {
  id: 'retina-layers',
  title: { ar: 'طبقات الشبكية', en: 'Retinal layers' },
  subtitle: { ar: 'مقطع تخطيطي من الزجاجي إلى المشيمية (غير مقيّس)', en: 'Schematic section from vitreous to choroid (not to scale)' },
  viewBox: [0, 0, 640, 440],
  status: 'draft',
  source: { type: 'original', author: 'Sakr Eye Clinic / I-App-lite', license: 'Original project artwork (all rights reserved by the clinic)' },
  references: ['AAO BCSC Section 12: Retina and Vitreous (anatomy)', 'Spaide RF, Curcio CA. Anatomical correlates to the bands seen in the outer retina by OCT (Retina 2011)'],
  decor: [
    { t: 'text', x: 92, y: 22, text: { ar: 'الضوء', en: 'Light' }, size: 12, anchor: 'middle', f: '#555' },
    { t: 'line', x1: 92, y1: 30, x2: 92, y2: 300, s: '#e8a317', sw: 3 },
    { t: 'polygon', points: '84,296 100,296 92,312', f: '#e8a317', s: '#e8a317', sw: 1 },
    { t: 'text', x: 134, y: 22, text: { ar: 'الإشارة', en: 'Signal' }, size: 12, anchor: 'middle', f: '#555' },
    { t: 'line', x1: 134, y1: 300, x2: 134, y2: 40, s: '#4a7fb5', sw: 3 },
    { t: 'polygon', points: '126,46 142,46 134,30', f: '#4a7fb5', s: '#4a7fb5', sw: 1 },
    { t: 'rect', x: X0, y: 405, width: W, height: 22, f: '#efe8d8', s: '#8d8570', sw: 0.8 }
  ],
  parts: [
    L('vitreous', { ar: 'الجسم الزجاجي', en: 'Vitreous' }, { ar: 'الزجاجي', en: 'Vitreous' },
      { ar: 'الهلام الزجاجي؛ تلتصق قشرته (القشرة الزجاجية) بالغشاء المحدّد الداخلي.', en: 'The vitreous gel; its cortex (posterior hyaloid) lies against the internal limiting membrane.' },
      20, 62, '#e6f3ea', 30),
    L('ilm', { ar: 'الغشاء المحدّد الداخلي', en: 'Internal limiting membrane (ILM)' }, { ar: 'الغشاء المحدّد الداخلي', en: 'ILM' },
      { ar: 'الغشاء القاعدي لخلايا مولر؛ الحدّ بين الشبكية والزجاجي. نقطة ارتكاز القشرة الزجاجية وهدف عملية سلخه في جراحة الثقب البقعي.', en: 'Basement membrane of the Müller cells; the boundary between retina and vitreous. It anchors the vitreous cortex and is the target of ILM peeling in macular hole surgery.' },
      62, 67, '#a98bd0', 58),
    L('rnfl', { ar: 'طبقة ألياف الأعصاب', en: 'Retinal nerve fibre layer (RNFL)' }, { ar: 'ألياف الأعصاب', en: 'RNFL' },
      { ar: 'محاور الخلايا العقدية المتجهة إلى القرص البصري؛ أسمك ما تكون حول القرص. يُقاس سمكها بـ OCT لمتابعة الجلوكوما.', en: 'Axons of the ganglion cells running to the optic disc; thickest around the disc. Its thickness is measured by OCT to follow glaucoma.' },
      67, 92, '#f6d98c', 86, { overlay: fibres(67, 92, '#c79a2e') }),
    L('gcl', { ar: 'طبقة الخلايا العقدية', en: 'Ganglion cell layer (GCL)' }, { ar: 'الخلايا العقدية', en: 'GCL' },
      { ar: 'أجسام الخلايا العقدية الشبكية (مع بعض الخلايا عديمة المحاور). تبلغ أقصى سماكتها في البقعة.', en: 'Cell bodies of the retinal ganglion cells (with displaced amacrine cells). Thickest in the macula.' },
      92, 118, '#eeb48c', 114, { overlay: nuclei(92, 118, 17, 6, '#cf7d4a', '#8c4a22') }),
    L('ipl', { ar: 'الطبقة الضفيرية الداخلية', en: 'Inner plexiform layer (IPL)' }, { ar: 'الضفيرية الداخلية', en: 'IPL' },
      { ar: 'مشابك بين الخلايا ثنائية القطب وعديمة المحاور والتشعبات الشجيرية للخلايا العقدية، بطبقات فرعية تعمل بنظام ON/OFF.', en: 'Synapses between bipolar/amacrine cell terminals and ganglion cell dendrites, organised in ON and OFF sublayers.' },
      118, 156, '#f4e3c6', 142, { overlay: layers(118, 156, '#b79b6a') }),
    L('inl', { ar: 'الطبقة النووية الداخلية', en: 'Inner nuclear layer (INL)' }, { ar: 'النووية الداخلية', en: 'INL' },
      { ar: 'أنوية الخلايا ثنائية القطب والأفقية وعديمة المحاور وخلايا مولر.', en: 'Nuclei of bipolar, horizontal and amacrine cells and of the Müller cells.' },
      156, 186, '#e2998c', 170, { overlay: nuclei(156, 186, 11, 4.6, '#b45a50', '#6e2a24') }),
    L('opl', { ar: 'الطبقة الضفيرية الخارجية', en: 'Outer plexiform layer (OPL)' }, { ar: 'الضفيرية الخارجية', en: 'OPL' },
      { ar: 'مشابك المستقبِلات الضوئية مع الخلايا ثنائية القطب والأفقية. في النقرة تصبح ألياف هنلي المائلة.', en: 'Synapses of photoreceptor terminals with bipolar and horizontal cells. In the fovea it forms the oblique Henle fibre layer.' },
      186, 208, '#f4e3c6', 198, { overlay: layers(186, 208, '#b79b6a') }),
    L('onl', { ar: 'الطبقة النووية الخارجية', en: 'Outer nuclear layer (ONL)' }, { ar: 'النووية الخارجية', en: 'ONL' },
      { ar: 'أنوية العصي والمخاريط؛ أسمك ما تكون في النقرة (أنوية المخاريط).', en: 'Nuclei of rods and cones; thickest at the fovea (cone nuclei).' },
      208, 256, '#cf8896', 232, { overlay: nuclei(208, 256, 9, 3.8, '#a04e63', '#5e2433') }),
    L('elm', { ar: 'الغشاء المحدّد الخارجي', en: 'External limiting membrane (ELM)' }, { ar: 'الغشاء المحدّد الخارجي', en: 'ELM' },
      { ar: 'ليس غشاءً حقيقياً: مجمّعات اتصال بين خلايا مولر والأجزاء الداخلية للمستقبِلات الضوئية. يظهر كخط رقيق في OCT.', en: 'Not a true membrane: junctional complexes between Müller cells and photoreceptor inner segments. Seen as a thin line on OCT.' },
      256, 261, '#6a4c93', 262),
    L('photoreceptors', { ar: 'المستقبِلات الضوئية', en: 'Photoreceptor segments (IS/OS)' }, { ar: 'المستقبِلات الضوئية', en: 'Photoreceptors' },
      { ar: 'الأجزاء الداخلية والخارجية للعصي (≈120 مليوناً) والمخاريط (≈6 ملايين). تعكس منطقة الإهليلج (EZ) في OCT الأجزاء الداخلية الغنية بالميتوكوندريا، وتبتلع الظهارة الصباغية الأجزاء الخارجية باستمرار.', en: 'Inner and outer segments of rods (about 120 million) and cones (about 6 million). The ellipsoid zone (EZ) on OCT reflects the mitochondria-rich inner segments; the RPE continually phagocytoses the outer segments.' },
      261, 318, '#fbeec4', 292, { overlay: photoreceptors() }),
    L('rpe', { ar: 'الظهارة الصباغية', en: 'Retinal pigment epithelium (RPE)' }, { ar: 'الظهارة الصباغية', en: 'RPE' },
      { ar: 'طبقة واحدة من خلايا سداسية صباغية: تشكّل الحاجز الدموي الشبكي الخارجي، وتبتلع الأجزاء الخارجية للمستقبِلات، وتشارك في الدورة البصرية (إعادة تدوير الريتينويد)، وتمتص الضوء الشارد.', en: 'Single layer of pigmented hexagonal cells: forms the outer blood–retinal barrier, phagocytoses photoreceptor outer segments, recycles retinoids (visual cycle) and absorbs stray light.' },
      318, 340, '#5a3a2b', 326),
    L('bruch', { ar: 'غشاء بروخ', en: "Bruch's membrane" }, { ar: 'غشاء بروخ', en: "Bruch's membrane" },
      { ar: 'مصفوفة من خمس طبقات بين الظهارة الصباغية والشعيرات المشيمية. تتكوّن الدرنات (drusen) بينه وبين الظهارة الصباغية، ويخترقه الغشاء الوعائي الجديد في التنكس البقعي الرطب.', en: 'Five-layered extracellular matrix between the RPE and choriocapillaris. Drusen form between it and the RPE, and choroidal neovascularisation breaks through it in wet AMD.' },
      340, 346, '#c9b18a', 360),
    L('choroid', { ar: 'المشيمية', en: 'Choroid' }, { ar: 'المشيمية', en: 'Choroid' },
      { ar: 'طبقة وعائية: الشعيرات المشيمية (الأعمق)، ثم طبقة ساتلر (أوعية متوسطة)، ثم طبقة هالر (أوعية كبيرة). غزيرة التدفق الدموي وتغذّي الشبكية الخارجية.', en: 'Vascular layer: choriocapillaris (innermost), Sattler layer (medium vessels) and Haller layer (large vessels). Very high blood flow; nourishes the outer retina.' },
      346, 405, '#9a5143', 392, { overlay: vessels() })
  ]
};
