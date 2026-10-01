import React from 'react';
import PatientFile from './PatientFile.jsx';
import { usePatientFile } from '../modules/patient-file/use-patient-file.js';

// Wires the live PatientFile data layer (src/modules/patient-file/
// use-patient-file.js) to the presentational screen. Exact port of what the
// legacy runtime's Patients() did inline: `if (openFile) return
// React.createElement(PatientFile, {...})` followed by PatientFile's own
// `ctx` assembly -- split here into a hook + this thin wrapper only because
// PatientFile.jsx already expects a single `ctx` prop.
export default function PatientFileContainer(props) {
  const ctx = usePatientFile(props);
  return <PatientFile ctx={ctx} />;
}
