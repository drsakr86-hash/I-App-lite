// Arabic -> English pairs for stored/offered data values owned by group g4: clinics, expense categories,
// staff roles, audit-log actions, backup reasons. Stored values stay Arabic; only DISPLAY goes through tv().
import { ar, en } from '../dict/g4.js';

// Strings the app writes to the database in Arabic (audit actions, backup reasons, notes) -- derived from the
// UI dictionary so the stored text and its English display can never drift apart.
const STORED_KEYS = [
  'g4.audit.addUser', 'g4.audit.editUser', 'g4.audit.deleteUser', 'g4.audit.changeOwnPw', 'g4.audit.deleteAll',
  'g4.audit.trashDrop', 'g4.audit.mergeFiles', 'g4.audit.trashRestore', 'g4.audit.restoreBackup', 'g4.audit.mergedPatient',
  'g4.backup.manual', 'g4.backup.auto', 'g4.backup.daily', 'g4.backup.beforeRestore', 'g4.backup.beforeDeleteAll',
  'g4.acc.recurringNote'
];

export const pairs = [
  ...STORED_KEYS.map(k => [ar[k], en[k]]),
  // clinics
  ['دمنهور', 'Damanhour'], ['الرحمانية', 'El-Rahmaniya'],
  ['عيادة دمنهور', 'Damanhour Clinic'], ['عيادة الرحمانية', 'El-Rahmaniya Clinic'], ['مركز دمنهور للعيون', 'Damanhour Eye Center'],
  ['كل العيادات', 'All clinics'],
  ['برج المنتزه بجوار حديقة الجمهورية', 'Al-Montaza Tower, next to Al-Gomhoreya Garden'],
  ['ش أحمد محمود بجوار فرع we', 'Ahmed Mahmoud St., next to the WE branch'],
  // weekdays (clinic opening days)
  ['الأحد', 'Sunday'], ['الاثنين', 'Monday'], ['الثلاثاء', 'Tuesday'], ['الأربعاء', 'Wednesday'], ['الخميس', 'Thursday'], ['السبت', 'Saturday'],
  // expense categories
  ['رواتب', 'Salaries'], ['إيجار', 'Rent'], ['مستلزمات طبية', 'Medical supplies'], ['فواتير وخدمات', 'Bills and utilities'],
  ['صيانة', 'Maintenance'], ['تسويق', 'Marketing'], ['أخرى', 'Other'],
  // audit-log actions and trash labels the screens write in Arabic (shown through tv() in the data tools)
  ['موعد', 'Appointment'], ['روشتة', 'Prescription'], ['زيارة', 'Visit'], ['مريض', 'Patient'], ['فحص/طلب أشعة', 'Exam / radiology request'],
  ['حقنة', 'Injection'], ['فحص صور', 'Imaging study'],
  ['حذف مريض', 'Patient deleted'], ['حذف فحص', 'Exam deleted'], ['حذف زيارة', 'Visit deleted'], ['حذف روشتة', 'Prescription deleted'],
  ['حذف موعد', 'Appointment deleted'], ['حذف حقنة', 'Injection deleted'], ['حذف فحص صور', 'Imaging study deleted'],
  ['حفظ قالب روشتة', 'Prescription template saved'], ['تسجيل حقنة', 'Injection recorded'], ['تسجيل دخول', 'Login'],
  ['قبول طلب حجز', 'Booking request accepted'], ['قبول طلب حجز (الحالة لم تُحدَّث)', 'Booking request accepted (status not updated)'],
  ['رفض طلب حجز', 'Booking request rejected'], ['تحصيل مبلغ', 'Payment collected'], ['تسجيل قيمة كشف', 'Visit fee recorded'],
  // staff roles
  ['مدير', 'Admin'], ['طبيب', 'Doctor'], ['سكرتارية', 'Secretary'], ['موظف', 'Staff']
];
