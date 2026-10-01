// Demo seed data used as the initial value for every useDB() collection when
// localStorage/Supabase has nothing yet (Phase 8, final batch). Exact copy of
// the legacy runtime's SEED constant (public/legacy/app-runtime.js) -- pure
// static data, no behavior to preserve beyond the values themselves.
//
// One entry (an expense) calls localISO() inline, exactly as legacy did:
// evaluated once, at module-load time, not "today" on every read. Preserved
// exactly, quirk and all.
import { localISO } from './misc.js';

export const SEED = {
  patients: [{
    id: 1,
    patientCode: "P-0001",
    name: "أحمد محمد العمري",
    age: 45,
    phone: "0501234567",
    lastVisit: "2026-04-08",
    condition: "قصر نظر",
    status: "مكتمل",
    gender: "ذكر",
    bloodType: "A+",
    address: "القاهرة",
    history: "ضغط دم مرتفع",
    allergies: "لا يوجد",
    occupation: "مهندس",
    emergencyContact: "زوجته - 0501234568"
  }, {
    id: 2,
    patientCode: "P-0002",
    name: "فاطمة علي الزهراني",
    age: 32,
    phone: "0559876543",
    lastVisit: "2026-04-09",
    condition: "ماء زرق",
    status: "متابعة",
    gender: "أنثى",
    bloodType: "O+",
    address: "الجيزة",
    history: "لا يوجد",
    allergies: "بنسلين",
    occupation: "معلمة",
    emergencyContact: "زوجها - 0559876544"
  }, {
    id: 3,
    patientCode: "P-0003",
    name: "خالد سعد القحطاني",
    age: 58,
    phone: "0534567890",
    lastVisit: "2026-04-10",
    condition: "ماء أبيض",
    status: "طارئ",
    gender: "ذكر",
    bloodType: "B+",
    address: "الإسكندرية",
    history: "سكري",
    allergies: "لا يوجد",
    occupation: "متقاعد",
    emergencyContact: "ابنه - 0534567891"
  }, {
    id: 4,
    patientCode: "P-0004",
    name: "نورة عبدالله الشمري",
    age: 27,
    phone: "0521112233",
    lastVisit: "2026-04-07",
    condition: "بُعد نظر",
    status: "مكتمل",
    gender: "أنثى",
    bloodType: "AB+",
    address: "المنصورة",
    history: "لا يوجد",
    allergies: "لا يوجد",
    occupation: "طالبة",
    emergencyContact: "والدها - 0521112234"
  }, {
    id: 5,
    patientCode: "P-0005",
    name: "عمر إبراهيم الدوسري",
    age: 61,
    phone: "0567894321",
    lastVisit: "2026-04-05",
    condition: "شبكية العين",
    status: "متابعة",
    gender: "ذكر",
    bloodType: "O-",
    address: "أسيوط",
    history: "سكري - ضغط",
    allergies: "سلفا",
    occupation: "تاجر",
    emergencyContact: "زوجته - 0567894322"
  }],
  appointments: [{
    id: 1,
    patient: "أحمد محمد",
    time: "09:00",
    type: "فحص روتيني",
    doctor: "د. سلمى",
    clinic: "دمنهور"
  }, {
    id: 2,
    patient: "ريم خالد",
    time: "09:30",
    type: "متابعة ماء أبيض",
    doctor: "د. عبدالستار",
    clinic: "الرحمانية"
  }, {
    id: 3,
    patient: "بدر عبدالرحمن",
    time: "10:00",
    type: "قياس النظر",
    doctor: "د. سلمى",
    clinic: "دمنهور"
  }, {
    id: 4,
    patient: "سارة أحمد",
    time: "10:30",
    type: "فحص شبكية",
    doctor: "د. ليلى",
    clinic: "مركز دمنهور للعيون"
  }, {
    id: 5,
    patient: "ماجد الحربي",
    time: "11:00",
    type: "عملية ليزك",
    doctor: "د. عبدالستار",
    clinic: "الرحمانية"
  }],
  prescriptions: [{
    id: 1,
    patientId: 1,
    patient: "أحمد محمد العمري",
    date: "2026-04-08",
    eye: "كلتا العينين",
    sphR: "-2.00",
    cylR: "-0.50",
    axisR: "180",
    sphL: "-1.75",
    cylL: "-0.25",
    axisL: "175",
    add: "+1.00",
    medicines: "قطرة Timolol 0.5% مرتين يومياً",
    notes: "مراجعة بعد شهر"
  }],
  exams: [{
    id: 1,
    patientId: 1,
    date: "2026-04-08",
    doctor: "د. عبدالستار",
    chiefComplaint: "ضعف الرؤية عن بُعد",
    visualAcuityR: "6/12",
    visualAcuityL: "6/9",
    iopR: "14",
    iopL: "15",
    anteriorSegment: "القرنية سليمة - العدسة شفافة",
    posteriorSegment: "القرص البصري طبيعي - الشبكية سليمة",
    colorVision: "طبيعي",
    contrast: "طبيعي",
    coverTest: "طبيعي",
    diagnosis: "قصر نظر بسيط في كلتا العينين",
    treatmentPlan: "نظارة طبية\nمراجعة بعد 6 أشهر",
    followUp: "2026-10-08",
    notes: "تقليل وقت الشاشات"
  }],
  visits: [{
    id: 1,
    patientId: 1,
    date: "2026-04-08",
    type: "فحص روتيني",
    doctor: "د. عبدالستار",
    complaint: "ضعف الرؤية",
    result: "قصر نظر بسيط",
    cost: "350",
    paid: true,
    nextVisit: "2026-10-08",
    notes: ""
  }],
  doctors: [{
    id: 1,
    name: "د. عبدالستار صقر",
    short: "د. عبدالستار",
    title: "استشاري طب وجراحة العيون والليزر",
    initial: "ع",
    isPrimary: true
  }],
  prices: [{
    id: 1,
    name: "كشف روتيني",
    price: "200",
    icon: "👁"
  }, {
    id: 2,
    name: "استشارة",
    price: "100",
    icon: "💬"
  }, {
    id: 3,
    name: "فحص شبكية",
    price: "500",
    icon: "🔍"
  }, {
    id: 4,
    name: "قياس نظر",
    price: "200",
    icon: "👓"
  }, {
    id: 5,
    name: "فحص ضغط العين",
    price: "150",
    icon: "🔵"
  }, {
    id: 6,
    name: "عملية ليزك",
    price: "8000",
    icon: "⚡"
  }, {
    id: 7,
    name: "عملية ماء أبيض",
    price: "6000",
    icon: "🏥"
  }, {
    id: 8,
    name: "حقن داخل العين",
    price: "2500",
    icon: "💉"
  }],
  customTests: [],
  clinic: {
    address: "دمنهور - برج المنتزه بجوار حديقة الجمهورية | الرحمانية - ش أحمد محمود بجوار فرع we",
    phone: "دمنهور: 0453333313 | الرحمانية: 01111480137"
  },
  expenses: [{
    id: 1,
    date: localISO(),
    category: "مستلزمات طبية",
    amount: "500",
    notes: "قطرات ومستلزمات فحص",
    clinic: "",
    recurringId: null
  }],
  recurringExpenses: []
};
