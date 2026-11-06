// Plate 6 -- Anterior segment and angle: overview + magnified angle (schematic, not to scale).
// Original vector artwork drawn for this project; see docs/ATLAS.md. Content status: draft until a doctor approves it.
// (Coordinates generated from the General-eye plate geometry, scaled 1.75x, then hand-tuned.)
export default {
 "id": "anterior-segment-angle",
 "title": {
  "ar": "القطعة الأمامية وزاوية الغرفة",
  "en": "Anterior segment and angle"
 },
 "subtitle": {
  "ar": "نظرة عامة ومنظر مكبّر للزاوية (تخطيطي)",
  "en": "Overview with a magnified view of the angle (schematic)"
 },
 "viewBox": [
  0,
  0,
  820,
  420
 ],
 "status": "draft",
 "source": {
  "type": "original",
  "author": "Sakr Eye Clinic / I-App-lite",
  "license": "Original project artwork (all rights reserved by the clinic)"
 },
 "references": [
  "AAO BCSC Section 10: Glaucoma (angle anatomy and gonioscopy)",
  "AAO BCSC Section 8: External Disease and Cornea (anatomy)"
 ],
 "decor": [
  {
   "t": "rect",
   "x": 380,
   "y": 80,
   "width": 260,
   "height": 270,
   "f": "#ffffff",
   "o": 0.5,
   "s": "#888",
   "sw": 1.2
  },
  {
   "t": "text",
   "x": 510,
   "y": 70,
   "text": {
    "ar": "الزاوية مكبّرة",
    "en": "Angle (magnified)"
   },
   "size": 12,
   "anchor": "middle",
   "f": "#555"
  },
  {
   "t": "circle",
   "cx": 228.4,
   "cy": 130.4,
   "r": 14,
   "f": "none",
   "s": "#c0392b",
   "sw": 1.5
  },
  {
   "t": "line",
   "x1": 238.4,
   "y1": 120.4,
   "x2": 380,
   "y2": 80,
   "s": "#c0392b",
   "sw": 1,
   "dash": "3 3"
  },
  {
   "t": "line",
   "x1": 238.4,
   "y1": 140.4,
   "x2": 380,
   "y2": 350,
   "s": "#c0392b",
   "sw": 1,
   "dash": "3 3"
  },
  {
   "t": "rect",
   "x": 380,
   "y": 80,
   "width": 260,
   "height": 270,
   "f": "none",
   "s": "#888",
   "sw": 1.2
  }
 ],
 "parts": [
  {
   "id": "sclera",
   "z": 1,
   "name": {
    "ar": "الصلبة (عند الليمبس)",
    "en": "Sclera (limbal region)"
   },
   "short": {
    "ar": "الصلبة",
    "en": "Sclera"
   },
   "desc": {
    "ar": "النسيج الأبيض المتين المتصل بالقرنية عند الليمبس؛ تلتصق به الملتحمة وتندغم فيه العضلات الخارجية.",
    "en": "Dense white collagenous tissue continuous with the cornea at the limbus; the conjunctiva attaches to it and the extraocular muscles insert into it."
   },
   "shapes": [
    {
     "t": "polygon",
     "points": "220,115 245.2,80 276,52 297,38 297,57.6 276,73 250.8,99.6 227,137.4",
     "f": "#efe8d8",
     "s": "#8d8570",
     "sw": 1.5
    },
    {
     "t": "polygon",
     "points": "220,325 245.2,360 276,388 297,402 297,382.4 276,367 250.8,340.4 227,302.6",
     "f": "#efe8d8",
     "s": "#8d8570",
     "sw": 1.5
    }
   ],
   "anchor": [
    276.0,
    54.8
   ],
   "label": [
    320,
    24,
    "m"
   ]
  },
  {
   "id": "cornea",
   "z": 2,
   "name": {
    "ar": "القرنية",
    "en": "Cornea"
   },
   "short": {
    "ar": "القرنية",
    "en": "Cornea"
   },
   "desc": {
    "ar": "شفافة وعديمة الأوعية؛ سمكها المركزي ≈0.5 مم. تغذَّى من الدموع والخلط المائي والأوعية الحوفية، وتعصَّب بكثافة بالفرع العيني للعصب الثلاثي التوائم.",
    "en": "Transparent and avascular; central thickness about 0.5 mm. Nourished by tears, aqueous and the limbal vessels, and densely innervated by the ophthalmic division of the trigeminal nerve."
   },
   "shapes": [
    {
     "t": "path",
     "d": "M220,115 C136,143 136,297 220,325 C157,297 157,143 220,115 Z",
     "f": "#cfe9f2",
     "o": 0.9,
     "s": "#6fa3b8",
     "sw": 2,
     "hit": 8
    }
   ],
   "anchor": [
    161.2,
    178.0
   ],
   "label": [
    135,
    100,
    "e"
   ]
  },
  {
   "id": "anterior-chamber",
   "z": 6,
   "name": {
    "ar": "الغرفة الأمامية",
    "en": "Anterior chamber"
   },
   "short": {
    "ar": "الغرفة الأمامية",
    "en": "Ant. chamber"
   },
   "desc": {
    "ar": "الحيّز بين بطانة القرنية والقزحية؛ مملوء بالخلط المائي (عمق ≈3 مم). ضحالتها أو انسداد زاويتها يهيئان للجلوكوما بإغلاق الزاوية.",
    "en": "The space between the corneal endothelium and the iris, filled with aqueous (about 3 mm deep). A shallow chamber or closed angle predisposes to angle-closure glaucoma."
   },
   "shapes": [
    {
     "t": "path",
     "d": "M220,325 C157,297 157,143 220,115 L224.2,130.4 L224.2,187.8 L234,200.4 L234,239.6 L224.2,252.2 L224.2,309.6 Z",
     "f": "#dff0f8",
     "s": "none"
    }
   ],
   "anchor": [
    197.6,
    222.8
   ],
   "label": [
    135,
    200,
    "e"
   ]
  },
  {
   "id": "limbus",
   "z": 7,
   "name": {
    "ar": "الليمبس (الحافة القرنية الصلبية)",
    "en": "Limbus (corneoscleral junction)"
   },
   "short": {
    "ar": "الليمبس",
    "en": "Limbus"
   },
   "desc": {
    "ar": "منطقة انتقال بعرض 1–1.5 مم بين القرنية والصلبة؛ تضم الخلايا الجذعية الحوفية في نتوءات فوغت (palisades of Vogt) وهي موضع الشقوق الجراحية.",
    "en": "A transition zone about 1–1.5 mm wide between cornea and sclera; it houses the limbal stem cells (palisades of Vogt) and is the site of surgical incisions."
   },
   "shapes": [
    {
     "t": "circle",
     "cx": 224.2,
     "cy": 113.6,
     "r": 9,
     "f": "#ffffff",
     "o": 0.35,
     "s": "#c47a1c",
     "sw": 1.5,
     "dash": "3 2"
    },
    {
     "t": "circle",
     "cx": 224.2,
     "cy": 326.4,
     "r": 9,
     "f": "#ffffff",
     "o": 0.35,
     "s": "#c47a1c",
     "sw": 1.5,
     "dash": "3 2"
    }
   ],
   "anchor": [
    224.2,
    113.6
   ],
   "label": [
    135,
    52,
    "e"
   ]
  },
  {
   "id": "iris",
   "z": 7,
   "name": {
    "ar": "القزحية",
    "en": "Iris"
   },
   "short": {
    "ar": "القزحية",
    "en": "Iris"
   },
   "desc": {
    "ar": "حجاب صباغي يتحكم بحجم الحدقة: العضلة المصرّة (نظيرة ودية، العصب الثالث) والعضلة الموسِّعة (ودية). أرقّ جزء فيها عند الجذر.",
    "en": "A pigmented diaphragm that controls the pupil: sphincter muscle (parasympathetic, CN III) and dilator muscle (sympathetic). Its thinnest part is the root."
   },
   "shapes": [
    {
     "t": "polygon",
     "points": "224.2,127.6 246.6,133.2 239.6,152.8 236.8,187.8 225.6,187.8",
     "f": "#6f8fa8",
     "s": "#41607a",
     "sw": 1.5
    },
    {
     "t": "polygon",
     "points": "224.2,312.4 246.6,306.8 239.6,287.2 236.8,252.2 225.6,252.2",
     "f": "#6f8fa8",
     "s": "#41607a",
     "sw": 1.5
    }
   ],
   "anchor": [
    231.2,
    292.8
   ],
   "label": [
    135,
    330,
    "e"
   ]
  },
  {
   "id": "pupil",
   "z": 9,
   "name": {
    "ar": "الحدقة",
    "en": "Pupil"
   },
   "short": {
    "ar": "الحدقة",
    "en": "Pupil"
   },
   "desc": {
    "ar": "الفتحة المركزية للقزحية: ≈2–4 مم في الضوء و4–8 مم في العتمة. تتضيق (miosis) بالمصرّة وتتسع (mydriasis) بالموسِّعة.",
    "en": "The central opening of the iris: about 2–4 mm in light and 4–8 mm in the dark. It constricts (miosis) through the sphincter and dilates (mydriasis) through the dilator."
   },
   "shapes": [
    {
     "t": "polygon",
     "points": "224.2,187.8 238.2,187.8 238.2,252.2 224.2,252.2",
     "f": "#ffffff",
     "o": 0.02,
     "s": "#c47a1c",
     "sw": 1.2,
     "dash": "3 2"
    }
   ],
   "anchor": [
    229.8,
    220.0
   ],
   "label": [
    135,
    262,
    "e"
   ]
  },
  {
   "id": "lens",
   "z": 8,
   "name": {
    "ar": "العدسة",
    "en": "Lens"
   },
   "short": {
    "ar": "العدسة",
    "en": "Lens"
   },
   "desc": {
    "ar": "محدّبة الوجهين وشفافة، معلّقة بالأربطة؛ تغيّر تحدّبها في التكيّف. الغرفة الخلفية تقع أمامها والزجاجي خلفها.",
    "en": "Transparent and biconvex, held by the zonules; it changes curvature during accommodation. The posterior chamber lies in front of it and the vitreous behind."
   },
   "shapes": [
    {
     "t": "ellipse",
     "cx": 269.0,
     "cy": 220.0,
     "rx": 35.0,
     "ry": 82.6,
     "f": "#f6edc0",
     "s": "#c5b25b",
     "sw": 1.8
    }
   ],
   "anchor": [
    273.2,
    225.6
   ],
   "label": [
    330,
    412,
    "m"
   ]
  },
  {
   "id": "zonules",
   "z": 8,
   "name": {
    "ar": "الأربطة المعلِّقة",
    "en": "Zonular fibres"
   },
   "short": {
    "ar": "الأربطة المعلِّقة",
    "en": "Zonules"
   },
   "desc": {
    "ar": "ألياف دقيقة بين النتوءات الهدبية ومحفظة العدسة. ضعفها (متلازمة مارفان، التقشّر الكاذب) يسبب خلع العدسة.",
    "en": "Fine fibres between the ciliary processes and the lens capsule. Their weakness (Marfan syndrome, pseudoexfoliation) leads to lens subluxation."
   },
   "shapes": [
    {
     "t": "line",
     "x1": 253.6,
     "y1": 123.4,
     "x2": 246.6,
     "y2": 158.4,
     "s": "#8a8a8a",
     "sw": 1.4,
     "hit": 9
    },
    {
     "t": "line",
     "x1": 264.8,
     "y1": 119.2,
     "x2": 269.0,
     "y2": 138.8,
     "s": "#8a8a8a",
     "sw": 1.4,
     "hit": 9
    },
    {
     "t": "line",
     "x1": 276.0,
     "y1": 113.6,
     "x2": 288.6,
     "y2": 152.8,
     "s": "#8a8a8a",
     "sw": 1.4,
     "hit": 9
    },
    {
     "t": "line",
     "x1": 253.6,
     "y1": 316.6,
     "x2": 246.6,
     "y2": 281.6,
     "s": "#8a8a8a",
     "sw": 1.4,
     "hit": 9
    },
    {
     "t": "line",
     "x1": 264.8,
     "y1": 320.8,
     "x2": 269.0,
     "y2": 301.2,
     "s": "#8a8a8a",
     "sw": 1.4,
     "hit": 9
    },
    {
     "t": "line",
     "x1": 276.0,
     "y1": 326.4,
     "x2": 288.6,
     "y2": 287.2,
     "s": "#8a8a8a",
     "sw": 1.4,
     "hit": 9
    }
   ],
   "anchor": [
    266.2,
    130.4
   ],
   "label": [
    135,
    380,
    "e"
   ]
  },
  {
   "id": "ciliary-body",
   "z": 5,
   "name": {
    "ar": "الجسم الهدبي",
    "en": "Ciliary body"
   },
   "short": {
    "ar": "الجسم الهدبي",
    "en": "Ciliary body"
   },
   "desc": {
    "ar": "يفرز الخلط المائي (النتوءات الهدبية، حاجز الظهارة غير الصباغية) وتتحكم عضلته بالتكيّف (العصب الثالث نظير الودي).",
    "en": "Secretes aqueous (ciliary processes, non-pigmented epithelium) and its muscle drives accommodation (parasympathetic CN III)."
   },
   "shapes": [
    {
     "t": "polygon",
     "points": "227,137.4 250.8,99.6 276,73 280.2,96.8 259.2,123.4 241,150",
     "f": "#c98f6b",
     "s": "#8b5a3c",
     "sw": 1.4
    },
    {
     "t": "polygon",
     "points": "227,302.6 250.8,340.4 276,367 280.2,343.2 259.2,316.6 241,290",
     "f": "#c98f6b",
     "s": "#8b5a3c",
     "sw": 1.4
    }
   ],
   "anchor": [
    256.4,
    95.4
   ],
   "label": [
    262,
    30,
    "e"
   ]
  },
  {
   "id": "posterior-chamber",
   "z": 7,
   "name": {
    "ar": "الغرفة الخلفية",
    "en": "Posterior chamber"
   },
   "short": {
    "ar": "الغرفة الخلفية",
    "en": "Post. chamber"
   },
   "desc": {
    "ar": "حيّز صغير بين خلف القزحية وأمام العدسة والأربطة، يُفرَز فيه الخلط المائي ثم يمر عبر الحدقة إلى الغرفة الأمامية. الكتلة الحدقية تنشأ عند انسداده.",
    "en": "A small space behind the iris and in front of the lens and zonules where aqueous is secreted before it passes through the pupil. Pupillary block arises when this flow is obstructed."
   },
   "shapes": [
    {
     "t": "polygon",
     "points": "239.6,152.8 241,150 259.2,123.4 269,136 253.6,157 243.8,166.8 236.8,187.8",
     "f": "#bcdcec",
     "s": "#6fa3b8",
     "sw": 0.8
    },
    {
     "t": "polygon",
     "points": "239.6,287.2 241,290 259.2,316.6 269,304 253.6,283 243.8,273.2 236.8,252.2",
     "f": "#bcdcec",
     "s": "#6fa3b8",
     "sw": 0.8
    }
   ],
   "anchor": [
    250.8,
    150.0
   ],
   "label": [
    262,
    408,
    "e"
   ]
  },
  {
   "id": "angle-wall",
   "z": 10,
   "name": {
    "ar": "جدار القرنية والصلبة",
    "en": "Corneoscleral wall"
   },
   "short": {
    "ar": "جدار القرنية/الصلبة",
    "en": "Corneoscleral wall"
   },
   "desc": {
    "ar": "الجدار الخارجي للزاوية: سدى القرنية ثم الصلبة؛ تقع فيه قناة شليم.",
    "en": "The outer wall of the angle: corneal stroma continuing into sclera; Schlemm canal lies within it."
   },
   "shapes": [
    {
     "t": "polygon",
     "points": "380,90 475,90 475,160 380,140",
     "f": "#d7ecf4",
     "s": "#6fa3b8",
     "sw": 1
    },
    {
     "t": "polygon",
     "points": "475,90 640,90 640,205 560,205 548,200 478,177 475,160",
     "f": "#efe8d8",
     "s": "#8d8570",
     "sw": 1
    }
   ],
   "anchor": [
    430,
    112
   ],
   "label": [
    672,
    100,
    "s"
   ]
  },
  {
   "id": "descemet-endothelium",
   "z": 12,
   "name": {
    "ar": "غشاء ديسميه والبطانة",
    "en": "Descemet membrane and endothelium"
   },
   "short": {
    "ar": "ديسميه والبطانة",
    "en": "Descemet / endothelium"
   },
   "desc": {
    "ar": "البطانة طبقة واحدة تضخ السائل خارج السدى لتحافظ على شفافية القرنية؛ لا تتجدد (تناقص الخلايا يسبب الوذمة). ينتهي غشاء ديسميه عند خط شوالبي.",
    "en": "A single cell layer that pumps fluid out of the stroma to keep the cornea clear; it does not regenerate (cell loss leads to oedema). Descemet membrane ends at Schwalbe line."
   },
   "shapes": [
    {
     "t": "line",
     "x1": 380,
     "y1": 141,
     "x2": 478,
     "y2": 177,
     "s": "#2a6f97",
     "sw": 4,
     "hit": 10
    }
   ],
   "anchor": [
    430,
    159
   ],
   "label": [
    672,
    140,
    "s"
   ]
  },
  {
   "id": "schwalbe-line",
   "z": 14,
   "name": {
    "ar": "خط شوالبي",
    "en": "Schwalbe line"
   },
   "short": {
    "ar": "خط شوالبي",
    "en": "Schwalbe line"
   },
   "desc": {
    "ar": "الحدّ الأمامي للشبكة التربيقية حيث ينتهي غشاء ديسميه؛ يُرى كحافة في تنظير الزاوية (gonioscopy).",
    "en": "The anterior border of the trabecular meshwork where Descemet membrane ends; seen as a ridge on gonioscopy."
   },
   "shapes": [
    {
     "t": "circle",
     "cx": 478,
     "cy": 176,
     "r": 5,
     "f": "#2a6f97",
     "s": "#14425e",
     "sw": 1
    }
   ],
   "anchor": [
    478,
    176
   ],
   "label": [
    672,
    172,
    "s"
   ]
  },
  {
   "id": "trabecular-meshwork",
   "z": 13,
   "name": {
    "ar": "الشبكة التربيقية",
    "en": "Trabecular meshwork"
   },
   "short": {
    "ar": "الشبكة التربيقية",
    "en": "Trabecular meshwork"
   },
   "desc": {
    "ar": "نسيج مسامي (شبكة قزحية الأمامية، قرنية صلبية، وجنب قناة شليم) يصرّف أغلب الخلط المائي (المسار التقليدي)؛ المقاومة الكبرى في النسيج المجاور للقناة. تظهر كشريط مصطبغ في تنظير الزاوية.",
    "en": "Sieve-like tissue (uveal, corneoscleral and juxtacanalicular) that drains most of the aqueous (conventional outflow); the main resistance is in the juxtacanalicular tissue. Appears as a pigmented band on gonioscopy."
   },
   "shapes": [
    {
     "t": "polygon",
     "points": "478,177 548,203 548,188 480,163",
     "f": "#a98a6a",
     "s": "#6b5238",
     "sw": 1.2
    }
   ],
   "anchor": [
    514,
    185
   ],
   "label": [
    672,
    204,
    "s"
   ]
  },
  {
   "id": "schlemm-canal",
   "z": 14,
   "name": {
    "ar": "قناة شليم",
    "en": "Schlemm canal"
   },
   "short": {
    "ar": "قناة شليم",
    "en": "Schlemm canal"
   },
   "desc": {
    "ar": "قناة حلقية مبطّنة بالبطانة تستقبل الخلط المائي عبر فجوات عملاقة ثم تفرغ في قنوات التجميع والأوردة المائية فالأوردة الخارج صلبية. ضغط الأوردة الخارج صلبية يؤثر في ضغط العين.",
    "en": "A circumferential endothelium-lined channel that receives aqueous through giant vacuoles and drains via collector channels and aqueous veins to the episcleral veins. Episcleral venous pressure influences IOP."
   },
   "shapes": [
    {
     "t": "ellipse",
     "cx": 524,
     "cy": 171,
     "rx": 13,
     "ry": 5.5,
     "tf": "rotate(20 524 171)",
     "f": "#6fb5e0",
     "s": "#2a6f97",
     "sw": 1.2,
     "hit": 6
    }
   ],
   "anchor": [
    524,
    171
   ],
   "label": [
    672,
    236,
    "s"
   ]
  },
  {
   "id": "scleral-spur",
   "z": 14,
   "name": {
    "ar": "المهماز الصلب",
    "en": "Scleral spur"
   },
   "short": {
    "ar": "المهماز الصلب",
    "en": "Scleral spur"
   },
   "desc": {
    "ar": "النهاية الخلفية للشبكة التربيقية وموضع ارتكاز العضلة الهدبية الطولية؛ يظهر كخط أبيض في تنظير الزاوية.",
    "en": "The posterior end of the trabecular meshwork and the attachment of the longitudinal ciliary muscle; a white line on gonioscopy."
   },
   "shapes": [
    {
     "t": "polygon",
     "points": "548,203 560,209 556,191 548,188",
     "f": "#fffdf6",
     "s": "#8d8570",
     "sw": 1.3
    }
   ],
   "anchor": [
    554,
    200
   ],
   "label": [
    672,
    268,
    "s"
   ]
  },
  {
   "id": "angle-iris-root",
   "z": 11,
   "name": {
    "ar": "جذر القزحية",
    "en": "Iris root"
   },
   "short": {
    "ar": "جذر القزحية",
    "en": "Iris root"
   },
   "desc": {
    "ar": "أرقّ جزء في القزحية وموضع الاتصال بالجسم الهدبي؛ تنفصل عنده القزحية في تباعد القزحية (iridodialysis) بعد الرضح.",
    "en": "The thinnest part of the iris, where it joins the ciliary body; it is where the iris tears away in iridodialysis after trauma."
   },
   "shapes": [
    {
     "t": "polygon",
     "points": "380,264 556,212 566,214 566,262 380,300",
     "f": "#6f8fa8",
     "s": "#41607a",
     "sw": 1.3
    }
   ],
   "anchor": [
    470,
    254
   ],
   "label": [
    672,
    300,
    "s"
   ]
  },
  {
   "id": "ciliary-band",
   "z": 11,
   "name": {
    "ar": "العصابة الهدبية والجسم الهدبي",
    "en": "Ciliary body band"
   },
   "short": {
    "ar": "العصابة الهدبية",
    "en": "Ciliary body band"
   },
   "desc": {
    "ar": "تُرى كشريط داكن خلف المهماز الصلب في تنظير الزاوية؛ يتسع في ارتداد الزاوية بعد الرضح. تحتها العضلة الهدبية الطولية.",
    "en": "Seen as a darker band behind the scleral spur on gonioscopy; it is widened in angle recession after trauma. The longitudinal ciliary muscle lies beneath it."
   },
   "shapes": [
    {
     "t": "polygon",
     "points": "558,208 640,208 640,335 520,335 560,262 566,214",
     "f": "#c98f6b",
     "s": "#8b5a3c",
     "sw": 1.3
    }
   ],
   "anchor": [
    600,
    280
   ],
   "label": [
    672,
    332,
    "s"
   ],
   "overlay": [
    {
     "t": "line",
     "x1": 566,
     "y1": 222,
     "x2": 636,
     "y2": 220,
     "s": "#8b5a3c",
     "sw": 1.2
    },
    {
     "t": "line",
     "x1": 566,
     "y1": 238,
     "x2": 636,
     "y2": 237,
     "s": "#8b5a3c",
     "sw": 1.2
    },
    {
     "t": "line",
     "x1": 566,
     "y1": 254,
     "x2": 636,
     "y2": 254,
     "s": "#8b5a3c",
     "sw": 1.2
    },
    {
     "t": "line",
     "x1": 566,
     "y1": 270,
     "x2": 636,
     "y2": 271,
     "s": "#8b5a3c",
     "sw": 1.2
    },
    {
     "t": "line",
     "x1": 566,
     "y1": 286,
     "x2": 636,
     "y2": 288,
     "s": "#8b5a3c",
     "sw": 1.2
    },
    {
     "t": "line",
     "x1": 566,
     "y1": 302,
     "x2": 636,
     "y2": 305,
     "s": "#8b5a3c",
     "sw": 1.2
    }
   ]
  },
  {
   "id": "angle-aqueous",
   "z": 9,
   "name": {
    "ar": "الغرفة الأمامية والخلفية (الخلط المائي)",
    "en": "Aqueous spaces"
   },
   "short": {
    "ar": "الخلط المائي",
    "en": "Aqueous"
   },
   "desc": {
    "ar": "الخلط المائي يُفرَز في الغرفة الخلفية ثم يمر عبر الحدقة ويخرج في الزاوية: المسار التقليدي (التربيقي) ≈ الأغلب، والمسار الأوفيّ-صلبي (uveoscleral) الباقي.",
    "en": "Aqueous is secreted into the posterior chamber, passes through the pupil and leaves at the angle: the conventional (trabecular) route carries most of it and the uveoscleral route the remainder."
   },
   "shapes": [
    {
     "t": "polygon",
     "points": "380,140 556,206 556,212 380,264",
     "f": "#dff0f8",
     "s": "none"
    },
    {
     "t": "polygon",
     "points": "380,300 566,262 520,335 380,335",
     "f": "#bcdcec",
     "s": "none"
    }
   ],
   "anchor": [
    430,
    200
   ],
   "label": [
    672,
    372,
    "s"
   ]
  }
 ]
};
