// Image-backed plates: a supplied picture (static webp in public/atlas) is the background layer; the doctor's drawing
// tools, labels and selectable hotspots sit on top of it. The picture itself is never edited. Hotspot positions were
// placed by eye for the doctor to review: every plate here stays `draft` until a doctor approves it.
const SOURCE = {
  type: 'supplied',
  author: 'Supplied by Dr. Abd Elsatar Sakr (original author not stated)',
  license: 'Not verified: confirm the licence before using outside the clinic'
};
const REFS = ['Image supplied by the clinic owner; origin and licence not confirmed', 'Hotspot positions placed manually; not clinically validated'];

// A selectable hotspot: a faint ellipse over the structure plus its label (cx, cy centre; rx, ry radii).
const hot = (id, ar, en, descAr, descEn, cx, cy, rx, ry, label, side = 's') => ({
  id, name: { ar, en }, short: { ar, en }, desc: { ar: descAr, en: descEn },
  shapes: [{ t: 'ellipse', cx, cy, rx, ry, f: '#ffd60a', s: '#e8590c', sw: 1.2, o: 0.14 }],
  anchor: [cx, cy], label: [label[0], label[1], side]
});

const plate = (id, titleAr, titleEn, subAr, subEn, file, width, height, parts) => ({
  id, title: { ar: titleAr, en: titleEn }, subtitle: { ar: subAr, en: subEn },
  viewBox: [0, 0, width, height], status: 'draft', source: SOURCE, references: REFS,
  image: { src: `atlas/${file}.webp`, width, height }, decor: [], parts
});

const DISC = ['القرص البصري', 'Optic disc', 'نقطة خروج الألياف العصبية ودخول الأوعية المركزية؛ يقع أنفيّاً من النقرة.', 'Where the nerve fibres leave and the central vessels enter; lies nasal to the fovea.'];
const MAC = ['النقرة والبقعة', 'Fovea and macula', 'مركز الإبصار الحاد؛ منطقة داكنة خالية من الأوعية تقع صُدغياً من القرص.', 'The centre of sharp vision; a darker, vessel-free area temporal to the disc.'];

const fundus = (id, tAr, tEn, sAr, sEn, file, w, h, disc, mac, dl, ml, dSide, mSide) => plate(id, tAr, tEn, sAr, sEn, file, w, h, [
  hot('optic-disc', DISC[0], DISC[1], DISC[2], DISC[3], disc[0], disc[1], disc[2], disc[2], dl, dSide),
  hot('fovea', MAC[0], MAC[1], MAC[2], MAC[3], mac[0], mac[1], mac[2], mac[2], ml, mSide)
]);

const MUS = {
  sr: ['العضلة المستقيمة العلوية', 'Superior rectus', 'ترفع مقلة العين وتديرها للداخل قليلاً؛ يغذّيها العصب القحفي الثالث.', 'Elevates the globe and adducts slightly; supplied by cranial nerve III.'],
  ir: ['العضلة المستقيمة السفلية', 'Inferior rectus', 'تخفض مقلة العين وتديرها للخارج قليلاً؛ يغذّيها العصب القحفي الثالث.', 'Depresses the globe and extorts slightly; supplied by cranial nerve III.'],
  mr: ['العضلة المستقيمة الإنسية', 'Medial rectus', 'تقرّب العين نحو الأنف (ضمّ)؛ يغذّيها العصب القحفي الثالث.', 'Adducts the eye toward the nose; supplied by cranial nerve III.'],
  lr: ['العضلة المستقيمة الوحشية', 'Lateral rectus', 'تبعد العين عن الأنف (تبعيد)؛ يغذّيها العصب القحفي السادس.', 'Abducts the eye away from the nose; supplied by cranial nerve VI.'],
  tr: ['البكرة والعضلة المائلة العلوية', 'Trochlea and superior oblique', 'تمر وتر العضلة المائلة العلوية عبر البكرة؛ يغذّيها العصب القحفي الرابع.', 'The superior oblique tendon passes through the trochlea; supplied by cranial nerve IV.']
};
const mus = k => [MUS[k][0], MUS[k][1], MUS[k][2], MUS[k][3]];

const AS = {
  cornea: ['القرنية', 'Cornea', 'النسيج الشفاف في مقدمة العين وهو أقوى سطح كاسر للضوء.', 'The transparent front of the eye and its strongest refracting surface.'],
  chamber: ['الحجرة الأمامية', 'Anterior chamber', 'الحيّز المملوء بالسائل المائي بين القرنية والقزحية.', 'The aqueous-filled space between the cornea and the iris.'],
  iris: ['القزحية', 'Iris', 'الحجاب الملوّن الذي يتحكم بحجم الحدقة.', 'The coloured diaphragm that controls pupil size.'],
  angle: ['الشبكة التربيقية والزاوية', 'Trabecular meshwork / angle', 'منطقة تصريف السائل المائي عند زاوية الحجرة الأمامية.', 'The aqueous drainage area at the angle of the anterior chamber.'],
  lens: ['العدسة البلورية', 'Crystalline lens', 'عدسة شفافة خلف القزحية تغيّر قوتها للتركيز على القريب.', 'A transparent lens behind the iris that changes power to focus near.'],
  zonules: ['الألياف المعلّقة (الزنيّات)', 'Zonules', 'ألياف دقيقة تصل العدسة بالجسم الهدبي.', 'Fine fibres that connect the lens to the ciliary body.'],
  ciliary: ['الجسم الهدبي', 'Ciliary body', 'يفرز السائل المائي ويحرّك العدسة أثناء التطابق.', 'Produces aqueous humour and drives accommodation.']
};
const as = k => AS[k];

export default [
  fundus('fundus-photo-od', 'قاع العين اليمنى (صورة)', 'Right eye fundus (photo)', 'صورة قاع عين يمنى؛ القرص إلى اليمين والنقرة إلى اليسار', 'Right-eye fundus photograph; disc on the right, macula on the left',
    'fundus-photo-od', 1024, 1024, [625, 492, 34], [490, 513, 28], [720, 400], [330, 600], 's', 'e'),
  fundus('fundus-photo-os', 'قاع العين اليسرى (صورة)', 'Left eye fundus (photo)', 'صورة قاع عين يسرى؛ القرص إلى اليسار والنقرة إلى اليمين', 'Left-eye fundus photograph; disc on the left, macula on the right',
    'fundus-photo-os', 1254, 1254, [485, 610, 40], [655, 628, 32], [330, 520], [780, 540], 'e', 's'),
  fundus('fundus-illustration-od', 'قاع العين اليمنى (رسم)', 'Right eye fundus (illustration)', 'رسم توضيحي لقاع عين يمنى', 'Illustrated right-eye fundus',
    'fundus-illustration-od', 1536, 1024, [960, 500, 80], [590, 495, 45], [1110, 360], [520, 380], 's', 'e'),
  fundus('fundus-illustration-os', 'قاع العين اليسرى (رسم)', 'Left eye fundus (illustration)', 'رسم توضيحي لقاع عين يسرى', 'Illustrated left-eye fundus',
    'fundus-illustration-os', 1536, 1024, [575, 505, 80], [930, 495, 45], [440, 360], [1010, 380], 'e', 's'),
  plate('extraocular-muscles-od', 'العضلات خارج المقلة — العين اليمنى', 'Extraocular muscles — right eye', 'منظر أمامي للمقلة وعضلاتها', 'Front view of the globe and its muscles',
    'muscles-od', 1536, 1024, [
      hot('sr-od', ...mus('sr'), 775, 225, 85, 60, [775, 110], 'm'),
      hot('ir-od', ...mus('ir'), 770, 770, 85, 60, [770, 920], 'm'),
      hot('lr-od', ...mus('lr'), 470, 495, 70, 85, [300, 495], 'e'),
      hot('mr-od', ...mus('mr'), 1065, 500, 80, 85, [1230, 500], 's'),
      hot('trochlea-od', ...mus('tr'), 1025, 282, 34, 34, [1130, 170], 's')
    ]),
  plate('extraocular-muscles-os', 'العضلات خارج المقلة — العين اليسرى', 'Extraocular muscles — left eye', 'منظر أمامي للمقلة وعضلاتها', 'Front view of the globe and its muscles',
    'muscles-os', 1536, 1024, [
      hot('sr-os', ...mus('sr'), 770, 225, 85, 60, [770, 110], 'm'),
      hot('ir-os', ...mus('ir'), 765, 775, 85, 60, [765, 920], 'm'),
      hot('mr-os', ...mus('mr'), 480, 495, 70, 85, [330, 495], 'e'),
      hot('lr-os', ...mus('lr'), 1050, 495, 80, 85, [1210, 500], 's'),
      hot('trochlea-os', ...mus('tr'), 510, 282, 34, 34, [410, 170], 'e')
    ]),
  plate('anterior-segment-section', 'مقطع الجزء الأمامي للعين (رسم)', 'Anterior segment section (illustration)', 'القرنية والقزحية والعدسة والجسم الهدبي', 'Cornea, iris, lens and ciliary body',
    'anterior-segment-section', 1536, 1024, [
      hot('cornea-img', ...as('cornea'), 770, 115, 120, 50, [770, 40], 'm'),
      hot('chamber-img', ...as('chamber'), 770, 300, 300, 70, [770, 220], 'm'),
      hot('iris-img', ...as('iris'), 430, 470, 90, 55, [200, 400], 'e'),
      hot('angle-img', ...as('angle'), 1345, 525, 35, 35, [1440, 430], 'e'),
      hot('lens-img', ...as('lens'), 760, 800, 330, 160, [760, 990], 'm'),
      hot('zonules-img', ...as('zonules'), 1240, 690, 45, 45, [1440, 760], 'e'),
      hot('ciliary-img', ...as('ciliary'), 1330, 640, 50, 55, [1440, 620], 'e')
    ])
];
