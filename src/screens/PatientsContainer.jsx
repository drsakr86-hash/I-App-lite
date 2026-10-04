import React, { lazy, Suspense } from 'react';
import Patients from './Patients.jsx';
import LazyFallback from '../components/LazyFallback.jsx';

const PatientFileContainer = lazy(() => import('./PatientFileContainer.jsx'));
import { usePatientsOrchestration } from '../modules/patients/patients-orchestration.js';

// Wires the live Patients list + patient-file data layer
// (src/modules/patients/patients-orchestration.js) to the presentational
// screens. Exact port of the legacy runtime's Patients() orchestrator: same
// list/file split (openFile picks the patient-file view), same props to
// each screen.
export default function PatientsContainer({
  patients, setPatients, initOpenId, initNewName, onInitDone,
  exams, setExams, prescriptions, setRx, visits, setVisits,
  doctorNames, primaryDoctor, prices, clinic, session, customTests
}) {
  const {
    search, setSearch, openFile, setOpenFile, updP, addP, delP,
    saveExam, saveRadiologyRequest, delExam, saveVisit, saveRx, delVisit
  } = usePatientsOrchestration({
    patients, setPatients, exams, setExams, prescriptions, setRx, visits, setVisits,
    doctorNames, primaryDoctor, prices, clinic, initOpenId, initNewName, onInitDone, customTests
  });

  if (openFile) {
    const p = patients.find(x => x.id === openFile);
    if (!p) {
      setOpenFile(null);
      return null;
    }
    return (
      <Suspense fallback={<LazyFallback />}>
      <PatientFileContainer
        key={p.id}
        patient={p}
        allExams={exams}
        allRx={prescriptions}
        allVisits={visits}
        onClose={() => setOpenFile(null)}
        onUpdatePatient={updP}
        onSaveExam={saveExam}
        onDelExam={delExam}
        onSaveVisit={saveVisit}
        onDelVisit={delVisit}
        onSaveRx={saveRx}
        onSaveRadiologyRequest={saveRadiologyRequest}
        doctorNames={doctorNames}
        primaryDoctor={primaryDoctor}
        prices={prices}
        clinic={clinic}
        customTests={customTests}
      />
      </Suspense>
    );
  }

  return (
    <Patients
      patients={patients}
      search={search}
      setSearch={setSearch}
      addP={addP}
      updP={updP}
      delP={delP}
      onOpenFile={setOpenFile}
      session={session}
      initNewName={initNewName}
      onInitDone={onInitDone}
    />
  );
}
