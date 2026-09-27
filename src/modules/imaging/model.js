// Pure logic for the Imaging Center screen (no DOM / React / Supabase / fetch).
// Each function reproduces an expression that used to live inline in the
// legacy ImagingCenter component, so results must stay identical to that code.
// The async save/delete/load orchestration (Supabase writes, Core RPCs and the
// pending-Core-order retry guard) stays in the screen component unchanged.

// Patient search dropdown: case-insensitive on name / file code, raw on phone, max 8.
export function filterImagingPatients(patients, patientSearch) {
  return patients.filter(p => {
    const q = patientSearch.trim().toLowerCase();
    if (!q) return true;
    return String(p.name || "").toLowerCase().includes(q) || String(p.patientCode || "").toLowerCase().includes(q) || String(p.phone || "").includes(q);
  }).slice(0, 8);
}

// Studies list: type filter ("all" = any) + patient name/code search, newest first.
export function filterStudies(studies, { filter, search }) {
  return studies.filter(x => (filter === "all" || x.type === filter) && (!search || String(x.patient || "").includes(search) || String(x.patientCode || "").includes(search))).sort((a, b) => String(b.date + b.time).localeCompare(String(a.date + a.time)));
}

// Open (not reported / cancelled) imaging orders for one patient.
export function pendingOrdersForPatient(orders, patientId) {
  return orders.filter(o => o.patientId === patientId && !['reported', 'cancelled'].includes(o.status));
}

// Imaging type matching an order test by name or id (undefined when none).
export function findImagingType(imagingTypes, test) {
  return imagingTypes.find(x => x.name === test.name || x.id === test.id);
}

// Filter chips for the studies list: "الكل" followed by every imaging type.
export function buildTypeFilters(imagingTypes) {
  return [{
    id: "all",
    l: "الكل"
  }, ...imagingTypes.map(t => ({
    id: t.id,
    l: t.name
  }))];
}

// Which test is being saved, and the type/eye that result from it.
// With a selected order the chosen order test wins over the manual type/eye.
export function resolveStudyTarget({ selectedOrder, selectedOrderTest, type, eye, imagingTypes }) {
  const chosenTest = selectedOrder?.tests?.find(t => t.id === selectedOrderTest) || selectedOrder?.tests?.[0] || null;
  const finalType = chosenTest ? imagingTypes.find(x => x.name === chosenTest.name || x.id === chosenTest.id)?.id || type : type;
  const finalEye = chosenTest?.eye || eye;
  return { chosenTest, finalType, finalEye };
}

// Local study record saved to iapp_imaging_studies / iapp_imaging.
export function buildStudyRecord({ id, selectedPatient, now, primary, finalType, typeName, finalEye, uploaded, notes, report, selectedOrder, chosenTest, coreVisitId, coreWorkflow, coreStudyId, coreSyncError, createdAt }) {
  return {
    id,
    patientId: selectedPatient.id,
    patient: selectedPatient.name,
    patientCode: selectedPatient.patientCode || "",
    date: now.date,
    time: now.time,
    doctor: primary && primary.name || "",
    type: finalType,
    typeName,
    eye: finalEye,
    files: uploaded,
    notes: notes.trim(),
    report: report.trim(),
    status: report.trim() ? "reported" : "completed",
    orderId: selectedOrder?.id || null,
    orderTestId: chosenTest?.id || null,
    coreVisitId,
    coreInvestigationOrderId: coreWorkflow?.investigation_order_id || selectedOrder?.coreInvestigationOrderId || null,
    coreImagingOrderId: coreWorkflow?.imaging_order_id || selectedOrder?.coreImagingOrderId || null,
    coreImagingStudyId: coreStudyId,
    coreSyncError,
    createdAt
  };
}

// Per-patient image metadata entries (iapp_imgmeta_<patientId>) for uploaded files.
export function buildImageMeta({ uploaded, now, notes, typeName, finalEye, examId }) {
  return uploaded.map(f => ({
    id: f.id,
    public_id: f.public_id,
    name: f.name,
    date: now.date,
    time: now.time,
    src: f.src,
    notes: notes.trim(),
    type: typeName,
    eye: finalEye,
    examId
  }));
}

// Exam record added to iapp_exams so the study shows in the patient file.
export function buildImagingExamRecord({ id, selectedPatient, now, primary, typeName, finalEye, report, notes, selectedOrder, uploaded }) {
  return {
    id: "EX-" + id,
    patientId: selectedPatient.id,
    date: now.date,
    time: now.time,
    doctor: primary && primary.name || "",
    testType: typeName,
    eye: finalEye,
    report: report.trim(),
    notes: notes.trim(),
    status: "completed",
    imagingStudyId: id,
    imagingOrderId: selectedOrder?.id || null,
    files: uploaded
  };
}
