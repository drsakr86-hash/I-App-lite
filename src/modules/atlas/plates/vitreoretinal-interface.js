// Plate 3 -- Vitreoretinal interface (schematic posterior pole to ora serrata; the axis is broken, not to scale).
// Original vector artwork drawn for this project; see docs/ATLAS.md. Content status: draft until a doctor approves it.
const TOP = 'M40,250 L97,250 C100,250 105,276 125,276 C145,276 150,250 153,250 L250,250 C262,250 268,244 280,244 C296,244 302,276 320,276 C338,276 344,244 360,244 C372,244 378,250 390,250 L500,250 L525,250';

export default {
  id: 'vitreoretinal-interface',
  title: { ar: 'الواجهة الزجاجية الشبكية', en: 'Vitreoretinal interface' },
  subtitle: { ar: 'من القرص البصري إلى الحافة المسننة (تخطيطي، المحور مقطوع)', en: 'Optic disc to ora serrata (schematic, axis broken)' },
  viewBox: [-160, 0, 940, 420],
  status: 'draft',
  source: { type: 'original', author: 'Sakr Eye Clinic / I-App-lite', license: 'Original project artwork (all rights reserved by the clinic)' },
  references: ['AAO BCSC Section 12: Retina and Vitreous', 'Sebag J. The Vitreous: Structure, Function and Pathobiology', 'Kishi S, Shimizu K. Posterior precortical vitreous pocket (Arch Ophthalmol 1990)'],
  decor: [
    { t: 'rect', x: 40, y: 330, width: 560, height: 22, f: '#efe8d8', s: '#8d8570', sw: 0.8 }
  ],
  parts: [
    {
      id: 'vitreous-gel', z: 0,
      name: { ar: 'الجسم الزجاجي (الهلام)', en: 'Vitreous gel' }, short: { ar: 'الهلام الزجاجي', en: 'Vitreous gel' },
      desc: {
        ar: 'ألياف كولاجين من النوع الثاني مع حمض الهيالورونيك. يتسيّل مع التقدم في العمر (synchysis) وتتكثف أليافه (syneresis)، ما يمهّد لانفصال الزجاجي الخلفي.',
        en: 'Type II collagen fibrils with hyaluronan. With age it liquefies (synchysis) and the fibrils aggregate (syneresis), which prepares the way for posterior vitreous detachment.'
      },
      shapes: [{ t: 'rect', x: 40, y: 44, width: 560, height: 206, f: '#e6f3ea', s: 'none' }],
      anchor: [380, 100], label: [25, 80, 'e']
    },
    {
      id: 'rpe-choroid', z: 1,
      name: { ar: 'الظهارة الصباغية والمشيمية', en: 'RPE and choroid' }, short: { ar: 'الصباغية/المشيمية', en: 'RPE / choroid' },
      desc: {
        ar: 'الظهارة الصباغية (الأعمق صبغةً) تحتها المشيمية الوعائية؛ لا تشارك مباشرة في الالتصاق الزجاجي لكنها تتأثر بالشد والانفصال الشبكي.',
        en: 'The pigmented RPE with the vascular choroid beneath it. They do not take part in vitreous adhesion directly but are affected by traction and retinal detachment.'
      },
      shapes: [
        { t: 'rect', x: 40, y: 282, width: 485, height: 10, f: '#5a3a2b', s: '#3b2418', sw: 0.8 },
        { t: 'rect', x: 40, y: 292, width: 560, height: 38, f: '#9a5143', s: '#6e3326', sw: 0.8 }
      ],
      anchor: [440, 311], label: [612, 312, 's']
    },
    {
      id: 'retina', z: 2,
      name: { ar: 'الشبكية العصبية', en: 'Neurosensory retina' }, short: { ar: 'الشبكية', en: 'Retina' },
      desc: {
        ar: 'تغطي الظهارة الصباغية؛ أرقّ ما تكون عند النقرة (الحفرة المركزية) وأسمك ما تكون حولها (جنب النقرة). تنتهي أماماً عند الحافة المسننة.',
        en: 'Overlies the RPE; thinnest at the foveal pit and thickest around it (parafovea). It ends anteriorly at the ora serrata.'
      },
      shapes: [{ t: 'path', d: `${TOP} L535,282 L40,282 Z`, f: '#f3b9a5', s: '#c97d66', sw: 1 }],
      anchor: [210, 268], label: [25, 268, 'e']
    },
    {
      id: 'optic-nerve-head', z: 3,
      name: { ar: 'رأس العصب البصري', en: 'Optic nerve head' }, short: { ar: 'رأس العصب', en: 'Optic disc' },
      desc: {
        ar: 'التصاق زجاجي حليمي (vitreopapillary) قوي حول حافة القرص. عند انفصال الزجاجي الخلفي قد يظهر حلقة وايس (Weiss ring) وهي نسيج دبقي مقتلع من حافة القرص.',
        en: 'Firm vitreopapillary adhesion around the disc margin. When the vitreous detaches a Weiss ring (glial tissue torn from the disc margin) may be seen.'
      },
      shapes: [
        { t: 'rect', x: 105, y: 276, width: 40, height: 76, f: '#e8dcc0', s: '#a89a72', sw: 1 },
        { t: 'path', d: 'M97,250 C100,250 105,276 125,276 C145,276 150,250 153,250 L148,250 C146,264 138,270 125,270 C112,270 104,264 102,250 Z', f: '#f3d77e', s: '#c49a1c', sw: 1 }
      ],
      anchor: [125, 313], label: [25, 330, 'e']
    },
    {
      id: 'fovea', z: 3,
      name: { ar: 'النقرة (الالتصاق البقعي)', en: 'Fovea (macular adhesion)' }, short: { ar: 'النقرة', en: 'Fovea' },
      desc: {
        ar: 'الحفرة المركزية للبقعة. التصاق الزجاجي بالنقرة وثيق عند الشباب؛ وإذا بقي التصاق بؤري أثناء انفصال الزجاجي الخلفي نشأ الشد الزجاجي البقعي (VMT) وقد يتطور إلى ثقب بقعي.',
        en: 'The central pit of the macula. Vitreous adhesion here is firm in young people; a focal adhesion that persists during posterior vitreous detachment causes vitreomacular traction (VMT) and may progress to a macular hole.'
      },
      shapes: [{ t: 'path', d: 'M284,244 C296,244 302,276 320,276 C338,276 344,244 356,244', f: 'none', s: '#e6b43a', sw: 6, hit: 16 }],
      anchor: [320, 268], label: [330, 396, 'm']
    },
    {
      id: 'ilm', z: 4,
      name: { ar: 'الغشاء المحدّد الداخلي', en: 'Internal limiting membrane' }, short: { ar: 'الغشاء المحدّد الداخلي', en: 'ILM' },
      desc: {
        ar: 'الغشاء القاعدي لخلايا مولر على سطح الشبكية؛ الحدّ الفاصل مع الزجاجي، وتلتصق به ألياف القشرة الزجاجية. يُسلخ جراحياً في علاج الثقب البقعي.',
        en: 'Basement membrane of the Müller cells on the retinal surface; the boundary with the vitreous, to which cortical vitreous fibrils attach. It is peeled surgically in macular hole surgery.'
      },
      shapes: [{ t: 'path', d: TOP, f: 'none', s: '#8a63c4', sw: 3, hit: 12 }],
      anchor: [420, 250], label: [612, 240, 's']
    },
    {
      id: 'posterior-hyaloid', z: 5,
      name: { ar: 'القشرة الزجاجية الخلفية', en: 'Posterior hyaloid (vitreous cortex)' }, short: { ar: 'القشرة الزجاجية', en: 'Vitreous cortex' },
      desc: {
        ar: 'الطبقة الخارجية المتكثفة من الزجاجي، ملتصقة بالغشاء المحدّد الداخلي. انفصالها عن الشبكية هو انفصال الزجاجي الخلفي (PVD)؛ والانفصال غير الطبيعي قد يسبب شدّاً بقعياً أو ثقباً أو تمزقاً شبكياً.',
        en: 'The condensed outer layer of the vitreous, attached to the ILM. Its separation from the retina is posterior vitreous detachment (PVD); an anomalous PVD can cause vitreomacular traction, a macular hole or a retinal tear.'
      },
      shapes: [{ t: 'path', d: 'M40,200 C70,204 85,236 100,250 L150,250 C165,236 190,212 230,210 C262,208 290,214 305,232 C312,242 318,247 320,247 C322,247 328,242 335,232 C350,214 378,208 410,210 C450,212 490,232 520,248 L575,262', f: 'none', s: '#3f6fc4', sw: 2.6, hit: 12 }],
      anchor: [210, 211], label: [25, 168, 'e']
    },
    {
      id: 'premacular-bursa', z: 5,
      name: { ar: 'الجيب أمام البقعي', en: 'Premacular bursa' }, short: { ar: 'الجيب أمام البقعي', en: 'Premacular bursa' },
      desc: {
        ar: 'جيب مسيَّل أمام البقعة (posterior precortical vitreous pocket وصفه Kishi) يُرى في OCT ممسوح المصدر؛ جداره الخلفي هو القشرة الزجاجية.',
        en: 'Liquefied pocket in front of the macula (the posterior precortical vitreous pocket described by Kishi), visible on swept-source OCT; its posterior wall is the vitreous cortex.'
      },
      shapes: [{ t: 'ellipse', cx: 320, cy: 200, rx: 62, ry: 24, f: '#ffffff', o: 0.55, s: '#3f6fc4', sw: 1.2, dash: '5 3' }],
      anchor: [320, 192], label: [612, 100, 's']
    },
    {
      id: 'vitreous-base', z: 6,
      name: { ar: 'قاعدة الزجاجي', en: 'Vitreous base' }, short: { ar: 'قاعدة الزجاجي', en: 'Vitreous base' },
      desc: {
        ar: 'شريط بعرض نحو 3–4 مم يمتد على جانبي الحافة المسننة؛ أشدّ مواضع الالتصاق ولا ينفصل أثناء PVD. تنشأ عند حدّه الخلفي التمزقات الشبكية (تمزق الشريحة).',
        en: 'A band about 3–4 mm wide straddling the ora serrata; the firmest vitreous attachment, which stays attached during PVD. Retinal tears (flap tears) occur at its posterior border.'
      },
      shapes: [{ t: 'polygon', points: '488,236 560,262 560,282 488,282', f: '#3f6fc4', o: 0.28, s: '#3f6fc4', sw: 1.2, dash: '4 3' }],
      anchor: [520, 262], label: [612, 150, 's']
    },
    {
      id: 'ora-serrata', z: 7,
      name: { ar: 'الحافة المسننة', en: 'Ora serrata' }, short: { ar: 'الحافة المسننة', en: 'Ora serrata' },
      desc: {
        ar: 'النهاية الأمامية المسننة للشبكية العصبية على بعد نحو 6–7 مم خلف الليمبس (الحافة القرنية الصلبية)؛ عندها تبدأ الجزء المسطح من الجسم الهدبي.',
        en: 'The serrated anterior end of the neurosensory retina about 6–7 mm behind the limbus; the pars plana of the ciliary body begins here.'
      },
      shapes: [{ t: 'path', d: 'M525,250 L536,282 L526,282 L522,266 Z', f: '#c0553a', s: '#7a2a1a', sw: 1.2, hit: 6 }],
      anchor: [529, 268], label: [612, 340, 's']
    },
    {
      id: 'pars-plana', z: 7,
      name: { ar: 'الجزء المسطح', en: 'Pars plana' }, short: { ar: 'الجزء المسطح', en: 'Pars plana' },
      desc: {
        ar: 'الجزء الخلفي الأملس من الجسم الهدبي (≈4 مم). موضع آمن للحقن داخل الزجاجي ولمنافذ استئصال الزجاجي (3.5–4 مم خلف الليمبس (الحافة القرنية الصلبية)).',
        en: 'The smooth posterior part of the ciliary body (about 4 mm). The safe site for intravitreal injections and vitrectomy ports (3.5–4 mm behind the limbus).'
      },
      shapes: [{ t: 'polygon', points: '536,262 600,262 600,282 536,282', f: '#d9b38c', s: '#a07c55', sw: 1 }],
      anchor: [575, 272], label: [612, 276, 's']
    }
  ]
};
