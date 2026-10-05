// Arabic -> English pairs for stored/offered data values (complaints, options, statuses...) owned by group g7.
// Covers the seed data (src/modules/constants/seed.js) and the print-document categories so tv() shows English.
export const pairs = [
  // patient conditions / status
  ['قصر نظر', 'Myopia'], ['ماء زرق', 'Glaucoma'], ['ماء أبيض', 'Cataract'], ['بُعد نظر', 'Hyperopia'], ['شبكية العين', 'Retina'],
  ['مكتمل', 'Completed'], ['متابعة', 'Follow-up'], ['طارئ', 'Emergency'],
  // history / allergies / occupation / address
  ['ضغط دم مرتفع', 'Hypertension'], ['لا يوجد', 'None'], ['سكري', 'Diabetes'], ['سكري - ضغط', 'Diabetes - hypertension'],
  ['بنسلين', 'Penicillin'], ['سلفا', 'Sulfa'],
  ['مهندس', 'Engineer'], ['معلمة', 'Teacher'], ['متقاعد', 'Retired'], ['طالبة', 'Student'], ['تاجر', 'Merchant'],
  ['القاهرة', 'Cairo'], ['الجيزة', 'Giza'], ['الإسكندرية', 'Alexandria'], ['المنصورة', 'Mansoura'], ['أسيوط', 'Asyut'],
  ['زوجته - 0501234568', 'Wife - 0501234568'], ['زوجها - 0559876544', 'Husband - 0559876544'], ['ابنه - 0534567891', 'Son - 0534567891'],
  ['والدها - 0521112234', 'Father - 0521112234'], ['زوجته - 0567894322', 'Wife - 0567894322'],
  // seed patient / appointment names
  ['أحمد محمد العمري', 'Ahmed Mohamed Al-Omari'], ['فاطمة علي الزهراني', 'Fatima Ali Al-Zahrani'], ['خالد سعد القحطاني', 'Khaled Saad Al-Qahtani'],
  ['نورة عبدالله الشمري', 'Noura Abdullah Al-Shammari'], ['عمر إبراهيم الدوسري', 'Omar Ibrahim Al-Dosari'],
  ['أحمد محمد', 'Ahmed Mohamed'], ['ريم خالد', 'Reem Khaled'], ['بدر عبدالرحمن', 'Badr Abdelrahman'], ['سارة أحمد', 'Sara Ahmed'], ['ماجد الحربي', 'Majed Al-Harbi'],
  // appointment types
  ['فحص روتيني', 'Routine examination'], ['متابعة ماء أبيض', 'Cataract follow-up'], ['قياس النظر', 'Vision measurement'], ['فحص شبكية', 'Retina examination'], ['عملية ليزك', 'LASIK surgery'],
  // doctors / clinics
  ['د. سلمى', 'Dr. Salma'], ['د. ليلى', 'Dr. Laila'], ['د. عبدالستار', 'Dr. Abdelsattar'], ['د. عبدالستار صقر', 'Dr. Abdelsattar Sakr'],
  ['استشاري طب وجراحة العيون والليزر', 'Consultant Ophthalmologist, Eye Surgeon & Laser'],
  ['دمنهور', 'Damanhour'], ['الرحمانية', 'El-Rahmaniya'], ['مركز دمنهور للعيون', 'Damanhour Eye Center'],
  // prescription / glasses
  ['قطرة Timolol 0.5% مرتين يومياً', 'Timolol 0.5% drops twice daily'], ['مراجعة بعد شهر', 'Review after one month'],
  // exam
  ['ضعف الرؤية عن بُعد', 'Blurred distance vision'], ['القرنية سليمة - العدسة شفافة', 'Cornea intact - lens clear'],
  ['القرص البصري طبيعي - الشبكية سليمة', 'Optic disc normal - retina intact'], ['قصر نظر بسيط في كلتا العينين', 'Mild myopia in both eyes'],
  ['نظارة طبية\nمراجعة بعد 6 أشهر', 'Prescription glasses\nReview after 6 months'], ['تقليل وقت الشاشات', 'Reduce screen time'],
  // visit
  ['ضعف الرؤية', 'Reduced vision'], ['قصر نظر بسيط', 'Mild myopia'],
  // price list
  ['كشف روتيني', 'Routine consultation'], ['استشارة', 'Consultation'], ['قياس نظر', 'Vision measurement (refraction)'], ['فحص ضغط العين', 'Intraocular pressure check'],
  ['عملية ماء أبيض', 'Cataract surgery'], ['حقن داخل العين', 'Intravitreal injection'], ['كشف', 'Consultation'],
  // expenses
  ['مستلزمات طبية', 'Medical supplies'], ['قطرات ومستلزمات فحص', 'Drops and examination supplies'], ['إيجار', 'Rent'], ['صيانة', 'Maintenance'],
  // seed clinic settings
  ['دمنهور - برج المنتزه بجوار حديقة الجمهورية | الرحمانية - ش أحمد محمود بجوار فرع we', 'Damanhour - Al-Montaza Tower, next to Al-Gomhoria Garden | El-Rahmaniya - Ahmed Mahmoud St., next to the WE branch'],
  ['دمنهور: 0453333313 | الرحمانية: 01111480137', 'Damanhour: 0453333313 | El-Rahmaniya: 01111480137'],
  // imaging / test categories used on the investigation request print
  ['أشعة', 'Radiology'], ['معمل', 'Laboratory'], ['شبكية', 'Retina'], ['جلوكوما', 'Glaucoma'], ['قرنية', 'Cornea'], ['جراحة', 'Surgery'], ['أخرى', 'Other']
];
