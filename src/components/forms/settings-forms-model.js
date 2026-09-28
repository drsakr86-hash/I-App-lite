// Pure logic for the Settings screen forms: PriceForm, DoctorForm and
// UserForm (src/components/forms/*.jsx). Every value and expression mirrors
// the legacy runtime's forms exactly (public/legacy/app-runtime.js).
// Duplicate-email / last-admin checks are NOT here: they run in the Settings
// screen's onSave handlers (src/modules/settings/model.js).

// ---- PriceForm -------------------------------------------------------------

export const PRICE_ICONS = ['👁', '💬', '🔍', '👓', '🔵', '⚡', '🏥', '💉', '📋', '🩺', '💊', '🔬', '🧪', '📊', '🩻'];

export const blankPrice = () => ({ name: '', price: '', icon: '👁' });
export const initialPriceState = initial => (initial ? { ...initial } : blankPrice());
// Name and price both required (non-empty strings; "0" passes, a price of
// number 0 from stored data does not). Legacy short-circuit value.
export const canSavePrice = f => f.name && f.price;

// ---- DoctorForm ------------------------------------------------------------

export const blankDoctor = () => ({ name: '', short: '', title: 'طبيب عيون', initial: '', isPrimary: false });
export const initialDoctorState = initial => (initial ? { ...initial } : blankDoctor());

// Suggested avatar letter and short name for a typed full name.
export const deriveDoctorNameFields = name => {
  const parts = name.replace('د.', '').trim().split(' ');
  const ini = parts[0] && parts[0][0] || '';
  const short = name.includes('د.') ? name.split(' ').slice(0, 2).join(' ') : 'د. ' + parts[0];
  return { ini, short };
};

// Typing the name fills initial/short only while they are still empty, so
// they latch onto whatever the name was at the first keystroke.
export const withDoctorName = (v, name, derived) => ({
  ...v,
  name,
  initial: v.initial || derived.ini,
  short: v.short || derived.short
});

export const togglePrimary = v => ({ ...v, isPrimary: !v.isPrimary });

// Name and short name required. Legacy short-circuit value.
export const canSaveDoctor = f => f.name && f.short;

// ---- UserForm --------------------------------------------------------------

export const USER_ROLE_OPTIONS = [
  { v: 'admin', l: 'مدير — صلاحية كاملة (يشمل المحاسبة)' },
  { v: 'doctor', l: 'طبيب — واجهة الطبيب بدون إدارة المستخدمين' },
  { v: 'secretary', l: 'سكرتارية — إدارة المواعيد والانتظار والتحصيل' },
  { v: 'employee', l: 'موظف — واجهة السكرتارية' }
];
export const USER_PASSWORD_NOTE = 'كلمة المرور تُنشأ من Supabase ← Authentication ← Users. هنا تحدد الصلاحية فقط.';

export const blankUser = () => ({ email: '', name: '', role: 'employee' });
// Edit mode: an old username-only account shows its username as the email.
export const initialUserState = initial =>
  initial ? { ...initial, email: initial.email || initial.username || '' } : blankUser();

// Email must contain "@", name must be non-blank, and no save in flight.
// Legacy short-circuit value (f.name must be a string).
export const isUserFormValid = (f, saving) => String(f.email || '').includes('@') && f.name.trim() && !saving;

export const buildUserPayload = (f, now) => ({ ...f, id: f.id || now });

export const userSaveLabel = (saving, isEdit) => (saving ? '⏳ جاري الحفظ...' : isEdit ? '✓ حفظ التعديل' : '✓ إضافة مستخدم');
