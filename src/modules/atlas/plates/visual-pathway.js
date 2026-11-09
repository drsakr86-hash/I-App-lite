// Plate 5 -- Neuro-ophthalmology: the afferent visual pathway seen from above (schematic).
// The right-hand side of the patient is drawn on the right of the plate and mirrored (sym) for the left.
// Original vector artwork drawn for this project; see docs/ATLAS.md. Content status: draft until a doctor approves it.
export default {
  id: 'visual-pathway',
  title: { ar: 'مسار الإبصار (طب أعصاب العين)', en: 'Visual pathway (neuro-ophthalmology)' },
  subtitle: { ar: 'منظر علوي تخطيطي؛ كل جزء يذكر عيب المجال البصري عند إصابته', en: 'Schematic view from above; each part lists the field defect when it is injured' },
  viewBox: [0, 0, 700, 440],
  status: 'draft',
  source: { type: 'original', author: 'Sakr Eye Clinic / I-App-lite', license: 'Original project artwork (all rights reserved by the clinic)' },
  references: ['AAO BCSC Section 5: Neuro-Ophthalmology', 'Miller NR, Newman NJ. Walsh & Hoyt Clinical Neuro-Ophthalmology'],
  decor: [
    { t: 'text', x: 350, y: 420, text: { ar: 'الخلف (القشرة القذالية)', en: 'Posterior (occipital)' }, size: 11, anchor: 'middle', f: '#888' },
    { t: 'text', x: 350, y: 14, text: { ar: 'الأمام', en: 'Anterior' }, size: 11, anchor: 'middle', f: '#888' },
    { t: 'line', x1: 322, y1: 148, x2: 378, y2: 182, s: '#9a7a22', sw: 1.4 },
    { t: 'line', x1: 322, y1: 182, x2: 378, y2: 148, s: '#9a7a22', sw: 1.4 },
    { t: 'line', x1: 350, y1: 36, x2: 350, y2: 395, s: '#bbb', sw: 0.8, dash: '4 4' }
  ],
  parts: [
    {
      id: 'retina-eyes', z: 1,
      name: { ar: 'العينان والشبكيتان', en: 'Eyes and retinae' }, short: { ar: 'الشبكيتان', en: 'Retinae' },
      desc: {
        ar: 'يقع المجال الصدغي على الشبكية الأنفية والمجال الأنفي على الشبكية الصدغية. تنقسم كل شبكية عند الخط الرأسي المار بالنقرة؛ الألياف الأنفية تتصالب في الصليبة والصدغية لا تتصالب.',
        en: 'The temporal field falls on the nasal retina and the nasal field on the temporal retina. Each retina is divided at the vertical meridian through the fovea; nasal fibres cross at the chiasm, temporal fibres do not.'
      },
      shapes: [
        { t: 'circle', cx: 480, cy: 66, r: 30, f: '#fbf6ea', s: '#8d8570', sw: 2, sym: true },
        { t: 'path', d: 'M506,52 A30,30 0 0 1 506,80', f: 'none', s: '#e08a6a', sw: 5, sym: true }
      ],
      anchor: [480, 66], label: [530, 40, 's']
    },
    {
      id: 'optic-nerve', z: 2,
      name: { ar: 'العصب البصري', en: 'Optic nerve' }, short: { ar: 'العصب البصري', en: 'Optic nerve' },
      desc: {
        ar: 'الإصابة قبل الصليبة تُحدث فقداً بصرياً أحادي الجانب مع عيب حدقي وارد نسبي (RAPD) في العين المصابة: التهاب العصب البصري، الاعتلال الإقفاري، الانضغاط.',
        en: 'A pre-chiasmal lesion gives monocular visual loss with a relative afferent pupillary defect (RAPD) in the affected eye: optic neuritis, ischaemic optic neuropathy, compression.'
      },
      shapes: [{ t: 'path', d: 'M468,94 C440,118 396,136 362,152', f: 'none', s: '#e8c070', sw: 14, sym: true, hit: 6 }],
      anchor: [425, 122], label: [530, 120, 's']
    },
    {
      id: 'chiasm', z: 3,
      name: { ar: 'الصليبة البصرية', en: 'Optic chiasm' }, short: { ar: 'الصليبة', en: 'Chiasm' },
      desc: {
        ar: 'تتصالب فيها الألياف الأنفية (من المجال الصدغي). الإصابة تعطي عمى نصفي صدغي ثنائي: ورم الغدة النخامية يضغط من الأسفل فيبدأ بالربعين العلويين، وورم القحفية البلعومية يضغط من الأعلى فيبدأ بالربعين السفليين.',
        en: 'Nasal fibres (from the temporal fields) cross here. A lesion gives bitemporal hemianopia: pituitary adenomas compress from below (superior defects first), craniopharyngiomas from above (inferior defects first).'
      },
      shapes: [{ t: 'ellipse', cx: 350, cy: 165, rx: 46, ry: 19, f: '#e8c070', s: '#9a7a22', sw: 1.5, o: 0.95 }],
      anchor: [322, 172], label: [160, 190, 'e']
    },
    {
      id: 'optic-tract', z: 2,
      name: { ar: 'السبيل البصري', en: 'Optic tract' }, short: { ar: 'السبيل البصري', en: 'Optic tract' },
      desc: {
        ar: 'يحمل ألياف نصف المجال المقابل من العينين. الإصابة تعطي عمى نصفي متجانس غير متطابق في الجهة المقابلة مع RAPD في العين المقابلة للإصابة (لأن الألياف المتصالبة أكثر).',
        en: 'Carries the opposite hemifield from both eyes. A lesion gives a contralateral incongruous homonymous hemianopia with an RAPD in the contralateral eye (crossed fibres outnumber uncrossed).'
      },
      shapes: [{ t: 'path', d: 'M384,178 C410,198 428,224 440,258', f: 'none', s: '#d9a850', sw: 12, sym: true, hit: 6 }],
      anchor: [418, 214], label: [530, 200, 's']
    },
    {
      id: 'lgn', z: 4,
      name: { ar: 'الجسم الركبي الوحشي', en: 'Lateral geniculate nucleus (LGN)' }, short: { ar: 'الجسم الركبي', en: 'LGN' },
      desc: {
        ar: 'ست طبقات: الطبقات 1 و4 و6 تستقبل ألياف متصالبة، و2 و3 و5 ألياف غير متصالبة. إمداده الدموي مزدوج (الشريان المشيمي الأمامي والشريان المشيمي الوحشي الخلفي)، فتعطي إصاباته عيوباً قطاعية متجانسة مميزة.',
        en: 'Six layers: layers 1, 4 and 6 receive crossed fibres, layers 2, 3 and 5 uncrossed fibres. Its dual blood supply (anterior choroidal and lateral posterior choroidal arteries) gives characteristic sectoral homonymous defects.'
      },
      shapes: [{ t: 'ellipse', cx: 446, cy: 272, rx: 21, ry: 13, f: '#9bb7d4', s: '#456a8f', sw: 1.5, sym: true }],
      anchor: [446, 272], label: [530, 262, 's']
    },
    {
      id: 'meyers-loop', z: 2,
      name: { ar: 'حلقة ماير (الفص الصدغي)', en: "Meyer's loop (temporal lobe)" }, short: { ar: 'حلقة ماير', en: "Meyer's loop" },
      desc: {
        ar: 'تحمل ألياف الشبكية السفلية (المجال العلوي) وتلتف أمامياً داخل الفص الصدغي. الإصابة تعطي ربع عمى علوي متجانس مقابل (pie in the sky).',
        en: 'Carries fibres from the inferior retina (superior visual field) that loop forward into the temporal lobe. A lesion gives a contralateral superior homonymous quadrantanopia ("pie in the sky").'
      },
      shapes: [{ t: 'path', d: 'M452,282 C520,282 540,336 500,358 C478,370 452,372 428,376', f: 'none', s: '#4a7fb5', sw: 6, sym: true, hit: 8 }],
      anchor: [524, 330], label: [570, 330, 's']
    },
    {
      id: 'parietal-radiation', z: 2,
      name: { ar: 'الإشعاع البصري الجداري', en: 'Parietal optic radiation' }, short: { ar: 'الإشعاع الجداري', en: 'Parietal radiation' },
      desc: {
        ar: 'تحمل ألياف الشبكية العلوية (المجال السفلي) في مسار مباشر عبر الفص الجداري. الإصابة تعطي ربع عمى سفلي متجانس مقابل (pie on the floor).',
        en: 'Carries fibres from the superior retina (inferior visual field) on a direct course through the parietal lobe. A lesion gives a contralateral inferior homonymous quadrantanopia ("pie on the floor").'
      },
      shapes: [{ t: 'path', d: 'M444,286 C462,322 452,350 420,374', f: 'none', s: '#2f9e6e', sw: 6, sym: true, hit: 8 }],
      anchor: [456, 326], label: [570, 372, 's']
    },
    {
      id: 'v1', z: 3,
      name: { ar: 'القشرة البصرية الأولية (V1)', en: 'Primary visual cortex (V1)' }, short: { ar: 'القشرة البصرية V1', en: 'Visual cortex (V1)' },
      desc: {
        ar: 'القشرة المهمازية في الفص القذالي؛ تشغل ألياف البقعة الثلث الخلفي منها. احتشاء الشريان المخي الخلفي يعطي عمى نصفياً متجانساً مقابلاً مع حفظ البقعة (macular sparing) بسبب الإمداد الجانبي من الشريان المخي المتوسط.',
        en: 'Calcarine cortex of the occipital lobe; macular fibres occupy its posterior third. A posterior cerebral artery infarct gives a contralateral homonymous hemianopia with macular sparing (collateral supply from the middle cerebral artery).'
      },
      shapes: [{ t: 'rect', x: 240, y: 374, width: 220, height: 30, rx: 15, f: '#c9a0dc', s: '#7a4d91', sw: 1.5 }],
      anchor: [350, 390], label: [160, 392, 'e']
    }
  ]
};
