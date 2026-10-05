// Pure helpers for the prescriptions list screen.
import { t } from '../i18n/index.js';

export function findPatientForRx(patients, rx) {
  return (patients || []).find(p => p.id === rx.patientId || p.name === rx.patient) || null;
}

// Both eye rows for the "view" modal, in a fixed order.
export function eyeRows(rx) {
  return [
    { eye: t('common.right'), sph: rx.sphR, cyl: rx.cylR, axis: rx.axisR },
    { eye: t('common.left'), sph: rx.sphL, cyl: rx.cylL, axis: rx.axisL }
  ];
}
