// Pure logic for the Settings screen (no DOM / React / Supabase / localStorage).
// The screen component keeps every side effect (getUsers(), setUsers, logAudit,
// alert, network calls) and only asks these helpers "is this allowed?" and
// "what should the new record / list look like?".

import { t } from '../i18n/index.js';

// Canonical (Arabic) texts, kept as constants for callers/tests; the functions below return the CURRENT-language text.
export const DUPLICATE_EMAIL_ERR = t('g4.settings.errDupEmail', 'ar');
export const USER_NOT_FOUND_ERR = t('g4.settings.errUserNotFound', 'ar');
export const LAST_ADMIN_ROLE_ERR = t('g4.settings.errLastAdminRole', 'ar');
export const LAST_ADMIN_DELETE_ALERT = t('g4.settings.errLastAdminDelete', 'ar');
export const lastAdminDeleteAlert = () => t('g4.settings.errLastAdminDelete');

// Case/whitespace-insensitive name comparison.
export const sameName = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();

export const adminCount = list => list.filter(u => u.role === 'admin').length;

// ---- Users ---------------------------------------------------------------

// addUser: an email is taken if any user has that email, or a username equal to it.
// `emailKey` is the legacy normalizer (passed in so behaviour stays identical).
export function addUserError(cur, mail, emailKey) {
  if (cur.some(u => emailKey(u.email) === mail || sameName(u.username, mail))) return t('g4.settings.errDupEmail');
  return null;
}

export function buildNewUserRecord(f, mail, id) {
  return {
    id,
    email: mail,
    username: mail,
    name: f.name.trim(),
    role: f.role
  };
}

// Demoting the only remaining admin is not allowed.
export function canRemoveAdminRole(prev, nextRole, cur) {
  return !(prev.role === 'admin' && nextRole !== 'admin' && adminCount(cur) <= 1);
}

// editUser checks, in the legacy order: duplicate email (email only, other ids),
// user not found, last-admin demotion. Returns the error string or null.
export function editUserError(cur, f, mail, emailKey) {
  if (cur.some(u => u.id !== f.id && emailKey(u.email) === mail)) return t('g4.settings.errDupEmail');
  const prev = cur.find(u => u.id === f.id);
  if (!prev) return t('g4.settings.errUserNotFound');
  if (!canRemoveAdminRole(prev, f.role, cur)) return t('g4.settings.errLastAdminRole');
  return null;
}

// Edited record keeps the previous fields but never carries password material.
export function buildEditedUserRecord(prev, f, mail) {
  const rec = {
    ...prev,
    email: mail,
    username: mail,
    name: f.name.trim(),
    role: f.role
  };
  delete rec.pw;
  delete rec.password;
  delete rec.mustChange;
  return rec;
}

export const replaceUser = (list, id, rec) => list.map(u => (u.id === id ? rec : u));

// delUserFn decision:
//  'ignore'  -> unknown user or the current session's own account (silently no-op)
//  'blocked' -> would delete the last admin (legacy shows an alert)
//  'delete'  -> allowed; `next` is the list without that user
export function canDeleteUser(cur, id, sessionId) {
  const target = cur.find(u => u.id === id);
  if (!target || id === sessionId) return { action: 'ignore' };
  if (target.role === 'admin' && adminCount(cur) <= 1) return { action: 'blocked' };
  return { action: 'delete', next: cur.filter(u => u.id !== id) };
}

export const userAuditDetail = (mail, role, roleLabels) => mail + ' · ' + (roleLabels[role] || role);

// ---- Doctors / prices (same array shapes) -------------------------------

export const withAdded = (list, f, id) => [...list, { ...f, id }];
export const withUpdated = (list, f) => list.map(x => (x.id === f.id ? f : x));
export const withoutId = (list, id) => list.filter(x => x.id !== id);
export const withPrimaryDoctor = (doctors, id) => doctors.map(d => ({ ...d, isPrimary: d.id === id }));
export const primaryDoctor = doctors => doctors.find(d => d.isPrimary) || doctors[0] || {};

// ---- Password form -------------------------------------------------------

// Local checks done before any network call; returns the error text or null.
export function passwordFormError(pwForm, minLen) {
  if (pwForm.new1.length < minLen) return t('g4.settings.pwTooShort', { min: minLen });
  if (pwForm.new1 !== pwForm.new2) return t('g4.settings.pwMismatch');
  return null;
}

// ---- Summary / info rows -------------------------------------------------

export const computeTotalRevenue = visits => visits.reduce((s, v) => s + (v.paid ? Number(v.cost || 0) : 0), 0);

export function buildDatabaseSummaryRows({ patients, appointments, visits, prescriptions, exams }) {
  const totalRev = computeTotalRevenue(visits);
  return [
    [t('g4.settings.sumPatients'), patients.length],
    [t('g4.settings.sumAppointments'), appointments.length],
    [t('g4.settings.sumVisits'), visits.length],
    [t('g4.settings.sumPrescriptions'), prescriptions.length],
    [t('g4.settings.sumExams'), exams.length],
    [t('g4.settings.sumRevenue'), totalRev.toLocaleString() + ' ' + t('g4.common.currency')]
  ];
}

// Function so the labels follow the current language; STATIC_INFO_ROWS is a load-time snapshot kept for callers/tests.
export const staticInfoRows = () => [
  ['🏥', t('g4.settings.infoClinicName'), t('g4.settings.infoClinicSub')],
  ['🕐', t('g4.settings.infoHours'), t('g4.settings.infoHoursVal')],
  ['💾', t('g4.settings.infoBackup'), t('g4.settings.infoBackupVal')]
];
export const STATIC_INFO_ROWS = staticInfoRows();
