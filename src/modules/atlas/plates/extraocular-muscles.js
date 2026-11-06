// Plate 4 -- Extraocular muscles: the six muscles of the right eye as the examiner sees it (front view, schematic).
// Original vector artwork drawn for this project; see docs/ATLAS.md. Content status: draft until a doctor approves it.
const MUSCLE = '#c0504d', MUSCLE_S = '#7a2a28', TENDON = '#eadfc2', TENDON_S = '#a89a72';
const rectus = (tendon, belly) => [
  { t: 'polygon', points: belly, f: MUSCLE, s: MUSCLE_S, sw: 1.2 },
  { t: 'polygon', points: tendon, f: TENDON, s: TENDON_S, sw: 1.2 }
];

export default {
  id: 'extraocular-muscles',
  title: { ar: 'العضلات الخارجية للعين', en: 'Extraocular muscles' },
  subtitle: { ar: 'العين اليمنى كما يراها الفاحص (منظر أمامي تخطيطي)', en: 'Right eye as seen by the examiner (schematic front view)' },
  viewBox: [0, 0, 720, 440],
  status: 'draft',
  source: { type: 'original', author: 'Sakr Eye Clinic / I-App-lite', license: 'Original project artwork (all rights reserved by the clinic)' },
  references: ['AAO BCSC Section 6: Pediatric Ophthalmology and Strabismus (anatomy of the extraocular muscles)', 'von Noorden GK. Binocular Vision and Ocular Motility'],
  decor: [
    { t: 'circle', cx: 360, cy: 220, r: 105, f: '#f1ece0', s: '#8d8570', sw: 2 },
    { t: 'circle', cx: 360, cy: 220, r: 46, f: '#e9f1f4', s: '#6fa3b8', sw: 1.5 },
    { t: 'circle', cx: 360, cy: 220, r: 36, f: '#6f8fa8', s: '#41607a', sw: 1 },
    { t: 'circle', cx: 360, cy: 220, r: 14, f: '#15202b', s: 'none' },
    { t: 'text', x: 70, y: 36, text: { ar: 'الجهة الصدغية', en: 'Temporal' }, size: 12, anchor: 'middle', f: '#666' },
    { t: 'text', x: 650, y: 36, text: { ar: 'الجهة الأنفية', en: 'Nasal' }, size: 12, anchor: 'middle', f: '#666' }
  ],
  parts: [
    {
      id: 'inferior-oblique', z: 1,
      name: { ar: 'المائلة السفلية', en: 'Inferior oblique (IO)' }, short: { ar: 'المائلة السفلية', en: 'Inferior oblique' },
      desc: {
        ar: 'الأفعال: تدوير خارجي (primary)، رفع (يبلغ أقصاه في التقريب)، تبعيد. العصب الثالث (الفرع السفلي). تنشأ من أرضية الحجاج (الفك العلوي) خلف الحافة السفلية الأنفية، وهي العضلة الوحيدة التي لا تنشأ من قمة الحجاج.',
        en: 'Actions: extorsion (primary), elevation (greatest in adduction), abduction. CN III, inferior division. Arises from the orbital floor (maxilla) behind the inferior nasal rim; the only extraocular muscle that does not arise from the orbital apex.'
      },
      shapes: [
        { t: 'path', d: 'M476,350 C430,336 380,318 322,296', f: 'none', s: MUSCLE, sw: 15 },
        { t: 'path', d: 'M476,350 C430,336 380,318 322,296', f: 'none', s: MUSCLE_S, sw: 1, dash: '3 3' },
        { t: 'polygon', points: '322,286 296,282 284,298 310,312', f: TENDON, s: TENDON_S, sw: 1.2 }
      ],
      anchor: [420, 330], label: [150, 360, 'e']
    },
    {
      id: 'superior-oblique', z: 1,
      name: { ar: 'المائلة العلوية', en: 'Superior oblique (SO)' }, short: { ar: 'المائلة العلوية', en: 'Superior oblique' },
      desc: {
        ar: 'الأفعال: تدوير داخلي (primary)، خفض (في التقريب)، تبعيد. العصب الرابع. يمر وترها عبر البكرة (trochlea) ثم يغور تحت المستقيمة العلوية ليندغم في الربع الصدغي العلوي خلف خط الاستواء.',
        en: 'Actions: intorsion (primary), depression (greatest in adduction), abduction. CN IV. Its tendon passes through the trochlea, then runs under the superior rectus to insert in the superotemporal quadrant behind the equator.'
      },
      shapes: [
        { t: 'line', x1: 476, y1: 62, x2: 566, y2: 22, s: MUSCLE, sw: 16 },
        { t: 'path', d: 'M476,62 C440,80 400,106 338,132', f: 'none', s: TENDON, sw: 10 },
        { t: 'polygon', points: '338,122 300,130 284,152 326,152', f: TENDON, s: TENDON_S, sw: 1.2 }
      ],
      anchor: [305, 140], label: [150, 100, 'e']
    },
    {
      id: 'superior-rectus', z: 2,
      name: { ar: 'المستقيمة العلوية', en: 'Superior rectus (SR)' }, short: { ar: 'المستقيمة العلوية', en: 'Superior rectus' },
      desc: {
        ar: 'الأفعال: رفع (primary)، تدوير داخلي، تقريب. العصب الثالث (الفرع العلوي). الاندغام نحو 7.7 مم من الليمبس. أقصى رفع في التبعيد.',
        en: 'Actions: elevation (primary), intorsion, adduction. CN III, superior division. Inserts about 7.7 mm from the limbus. Maximal elevating effect in abduction.'
      },
      shapes: rectus('342,128 378,128 379,108 341,108', '341,108 379,108 387,30 333,30'),
      anchor: [360, 70], label: [360, 14, 'm']
    },
    {
      id: 'inferior-rectus', z: 2,
      name: { ar: 'المستقيمة السفلية', en: 'Inferior rectus (IR)' }, short: { ar: 'المستقيمة السفلية', en: 'Inferior rectus' },
      desc: {
        ar: 'الأفعال: خفض (primary)، تدوير خارجي، تقريب. العصب الثالث (الفرع السفلي). الاندغام نحو 6.5 مم من الليمبس. أقصى خفض في التبعيد.',
        en: 'Actions: depression (primary), extorsion, adduction. CN III, inferior division. Inserts about 6.5 mm from the limbus. Maximal depressing effect in abduction.'
      },
      shapes: rectus('342,300 378,300 379,320 341,320', '341,320 379,320 387,400 333,400'),
      anchor: [360, 372], label: [360, 432, 'm']
    },
    {
      id: 'lateral-rectus', z: 2,
      name: { ar: 'المستقيمة الوحشية', en: 'Lateral rectus (LR)' }, short: { ar: 'المستقيمة الوحشية', en: 'Lateral rectus' },
      desc: {
        ar: 'الفعل: تبعيد (فعل وحيد). العصب السادس. الاندغام نحو 6.9 مم من الليمبس. شلل العصب السادس يعطي حَوَلاً داخلياً وعجزاً عن التبعيد.',
        en: 'Action: abduction (pure). CN VI. Inserts about 6.9 mm from the limbus. A sixth nerve palsy gives esotropia with a limitation of abduction.'
      },
      shapes: rectus('274,202 274,238 254,239 254,201', '254,201 254,239 170,248 170,192'),
      anchor: [205, 220], label: [150, 220, 'e']
    },
    {
      id: 'medial-rectus', z: 2,
      name: { ar: 'المستقيمة الإنسية', en: 'Medial rectus (MR)' }, short: { ar: 'المستقيمة الإنسية', en: 'Medial rectus' },
      desc: {
        ar: 'الفعل: تقريب (فعل وحيد). العصب الثالث (الفرع السفلي). أقرب العضلات الأربع إلى الليمبس (نحو 5.5 مم). ',
        en: 'Action: adduction (pure). CN III, inferior division. The rectus muscle that inserts closest to the limbus (about 5.5 mm).'
      },
      shapes: rectus('434,202 434,238 454,239 454,201', '454,201 454,239 550,248 550,192'),
      anchor: [515, 220], label: [585, 220, 's']
    },
    {
      id: 'trochlea', z: 3,
      name: { ar: 'البكرة', en: 'Trochlea' }, short: { ar: 'البكرة', en: 'Trochlea' },
      desc: {
        ar: 'بكرة غضروفية عند الحافة العلوية الأنفية للحجاج (العظم الجبهي) يمر عبرها وتر المائلة العلوية فتغيّر اتجاه شدّه. التهاب غمد الوتر عندها يسبب متلازمة براون (Brown).',
        en: 'A cartilaginous pulley at the superonasal orbital rim (frontal bone) through which the superior oblique tendon passes, changing its direction of pull. Tendon–trochlea restriction causes Brown syndrome.'
      },
      shapes: [{ t: 'circle', cx: 476, cy: 62, r: 9, f: '#d9c37a', s: '#8a7420', sw: 1.5 }],
      anchor: [476, 62], label: [585, 70, 's']
    }
  ]
};
