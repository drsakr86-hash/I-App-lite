// Pure helpers for the prescriptions list screen.

export function findPatientForRx(patients, rx) {
  return (patients || []).find(p => p.id === rx.patientId || p.name === rx.patient) || null;
}

// Both eye rows for the "view" modal, in a fixed order.
export function eyeRows(rx) {
  return [
    { eye: 'اليمنى', sph: rx.sphR, cyl: rx.cylR, axis: rx.axisR },
    { eye: 'اليسرى', sph: rx.sphL, cyl: rx.cylL, axis: rx.axisL }
  ];
}
