import React from 'react';
import { ageLabel } from '../modules/patient-file/model.js';
import InfoSummary from './patient-file/InfoSummary.jsx';
import InfoDetails from './patient-file/InfoDetails.jsx';
import TimelineTab from './patient-file/TimelineTab.jsx';
import VisitsTab from './patient-file/VisitsTab.jsx';
import CompareTab from './patient-file/CompareTab.jsx';
import ExamsTab from './patient-file/ExamsTab.jsx';
import RequestsTab from './patient-file/RequestsTab.jsx';
import TreatmentTab from './patient-file/TreatmentTab.jsx';
import RxTab from './patient-file/RxTab.jsx';
import ImagesTab from './patient-file/ImagesTab.jsx';
import ImageViewer from './patient-file/ImageViewer.jsx';
import StatusBar from './patient-file/StatusBar.jsx';
import { Modal, Confirm } from '../components/common.jsx';
import { PatientEditForm, RxForm, VisitForm, ExamForm } from '../components/forms/index.js';
import { PrintModal } from '../components/modals/index.js';
import { C } from '../modules/theme/index.js';
import { SC, Tag, XRAY_ICON } from '../modules/ui/atoms.jsx';
import TopBar from '../components/TopBar.jsx';
import { getPatientFileHTML, printDoc } from '../modules/print/index.js';

// Patient file (full-screen). Presentational only: every useState/useEffect,
// the Core 360 load, uploads, saves and deletes live in the data layer
// (src/modules/patient-file/use-patient-file.js), which passes its values
// and handlers in `ctx`. Child forms (VisitForm, ExamForm, RxForm,
// PatientEditForm) come from src/components/forms and PrintModal from
// src/components/modals.
// Marks the open form as edited (input/change events bubble from every field), so
// closing the sheet by the backdrop, the x or Cancel asks before discarding.
function Dirty({ onDirty, children }) {
  return <div onInputCapture={onDirty} onChangeCapture={onDirty}>{children}</div>;
}

export default function PatientFile({ ctx }) {
  const {
    TABS, tab, setTab, modal, setModal, delTarget, setDelTarget, viewImg, curPatient, visits, patientRecords, rxList,
    clinic, doctorNames, prices, primaryDoctor, onClose, onSaveExam, onSaveVisit, handlePatientSave,
    onAddRxSave, onEditRxSave, onConfirmDelete
  } = ctx;
  const tabIds = TABS.map(t => t.id);
  const onTabKey = e => {
    const i = tabIds.indexOf(tab);
    let n = -1;
    // RTL: the visual "next" tab is to the left, so ArrowLeft advances and ArrowRight goes back.
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') n = (i + 1) % tabIds.length;
    else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') n = (i - 1 + tabIds.length) % tabIds.length;
    else if (e.key === 'Home') n = 0;
    else if (e.key === 'End') n = tabIds.length - 1;
    if (n < 0) return;
    e.preventDefault();
    setTab(tabIds[n]);
    const el = document.getElementById('pf-tab-' + tabIds[n]);
    if (el) el.focus();
  };
  const recent = (ctx.timelineEvents || []).slice(0, 5);
  const summary = ctx.summary;
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: C.bg,
        zIndex: 300,
        overflowY: "auto",
        direction: "rtl",
        fontFamily: "'Segoe UI','Tahoma',Arial,sans-serif"
      }}
    >
      <TopBar backLabel={curPatient.name} onBack={onClose}/>
      <div className="pf-shell">
        <header className="ds-card" style={{ margin: "12px 0", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <div
            aria-hidden="true"
            style={{
              width: 48, height: 48, borderRadius: "50%", background: C.accent, display: "flex",
              alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 20, flex: "0 0 auto"
            }}
          >
            {(curPatient.name || "?")[0]}
          </div>
          <div style={{ flex: 1, minWidth: 180 }}>
            <h1 style={{ color: C.text, fontWeight: 700, fontSize: 17, margin: 0 }}>{curPatient.name}</h1>
            <div style={{ color: C.muted, fontSize: 12, marginTop: 2 }}>
              <span className="ds-badge ds-badge--info" style={{ marginInlineEnd: 8 }}>{curPatient.patientCode || "غير مسجل"}</span>
              {ageLabel(curPatient.age)}{" · "}{curPatient.gender || "غير مسجل"}{curPatient.phone ? " · " + curPatient.phone : ""}
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            <Tag label={curPatient.status} color={SC[curPatient.status] || C.muted}/>
            <button type="button" className="ds-btn" onClick={() => setModal("editPatient")}>✏ تعديل الملف</button>
            <button
              type="button"
              className="ds-btn"
              onClick={() => printDoc(getPatientFileHTML(curPatient, visits, patientRecords, rxList, primaryDoctor, clinic))}
            >
              🖨️ طباعة
            </button>
          </div>
        </header>
        <StatusBar ctx={ctx} />
        <div className="pf-grid" style={{ marginTop: 10 }}>
          <nav className="pf-nav" aria-label="أقسام ملف المريض">
            <div className="ds-tabs" role="tablist" aria-label="أقسام ملف المريض" aria-orientation="horizontal" onKeyDown={onTabKey}>
              {TABS.map(t => (
                <button
                  type="button"
                  role="tab"
                  id={"pf-tab-" + t.id}
                  aria-selected={tab === t.id}
                  aria-controls="pf-panel"
                  tabIndex={tab === t.id ? 0 : -1}
                  className="ds-tab"
                  key={t.id}
                  onClick={() => setTab(t.id)}
                >
                  <span aria-hidden="true" style={{ marginInlineEnd: 6 }}>
                    {t.icon === "oct" ? (
                      <img src={XRAY_ICON} alt="" style={{ width: 16, height: 16, verticalAlign: "middle", filter: tab === t.id ? "brightness(0) invert(1)" : "brightness(0.8)" }} />
                    ) : t.icon}
                  </span>
                  {t.label}
                </button>
              ))}
            </div>
          </nav>
          <main className="pf-main" id="pf-panel" role="tabpanel" aria-labelledby={"pf-tab-" + tab} tabIndex={-1} style={{ minWidth: 0 }}>
            {tab === "info" && <InfoSummary ctx={ctx} />}
            {tab === "timeline" && <TimelineTab ctx={ctx} />}
            {tab === "info" && <InfoDetails ctx={ctx} />}
            {tab === "visits" && <VisitsTab ctx={ctx} />}
            {tab === "compare" && <CompareTab ctx={ctx} />}
            {tab === "exams" && <ExamsTab ctx={ctx} />}
            {tab === "requests" && <RequestsTab ctx={ctx} />}
            {tab === "treatment" && <TreatmentTab ctx={ctx} />}
            {tab === "rx" && <RxTab ctx={ctx} />}
            {tab === "images" && <ImagesTab ctx={ctx} />}
          </main>
          <aside className="pf-side" aria-label="ملخص جانبي">
            {tab !== "info" && summary && (
              <div className="ds-card" style={{ marginBottom: 12 }}>
                <h2 className="ds-h">الحالة الآن</h2>
                <div className="ds-sub">التشخيص</div>
                <div style={{ color: C.text, fontSize: 13, marginBottom: 6 }} dir="auto">{summary.diagnosis.primary ? summary.diagnosis.primary.text : "غير مسجل"}</div>
                <div className="ds-sub">الموعد القادم</div>
                <div style={{ color: C.text, fontSize: 13 }}>{summary.followUp ? summary.followUp.date + (summary.followUp.overdue ? " (متأخر)" : "") : "غير مسجل"}</div>
                {summary.alerts.length > 0 && <div className="ds-alert ds-alert--warn" style={{ marginTop: 8 }}>{summary.alerts.length} تنبيه — راجع الملخص</div>}
              </div>
            )}
            <div className="ds-card">
              <h2 className="ds-h">آخر الأحداث</h2>
              {recent.length === 0 ? <div className="ds-sub">لا توجد أحداث مسجلة</div> : (
                <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
                  {recent.map(e => (
                    <li key={e.key} style={{ fontSize: 12, color: C.text }}>
                      <span aria-hidden="true">{e.icon} </span>{e.title}
                      <div className="ds-sub">{e.date || "بدون تاريخ"}</div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </aside>
        </div>
      </div>
      {viewImg && <ImageViewer ctx={ctx} />}
      {modal === "editPatient" && (
        <Modal title="تعديل الملف الطبي" onClose={() => setModal(null)}><Dirty onDirty={ctx.markModalDirty}>
          <PatientEditForm patient={curPatient} onSave={handlePatientSave} onClose={() => setModal(null)}/>
        </Dirty></Modal>
      )}
      {modal === "addRx" && (
        <Modal title="وصفة جديدة" onClose={() => setModal(null)}><Dirty onDirty={ctx.markModalDirty}>
          <RxForm
            patients={[curPatient]}
            doctorNames={doctorNames}
            onSave={onAddRxSave}
            onClose={() => setModal(null)}
          />
        </Dirty></Modal>
      )}
      {modal && modal.editRx && (
        <Modal title="تعديل الوصفة" onClose={() => setModal(null)}><Dirty onDirty={ctx.markModalDirty}>
          <RxForm
            patients={[curPatient]}
            doctorNames={doctorNames}
            initial={modal.editRx}
            onSave={onEditRxSave}
            onClose={() => setModal(null)}
          />
        </Dirty></Modal>
      )}
      {modal === "addVisit" && (
        <Modal title="زيارة جديدة" onClose={() => setModal(null)}><Dirty onDirty={ctx.markModalDirty}>
          <VisitForm
            doctorNames={doctorNames}
            prices={prices}
            patientId={curPatient.id}
            onSave={v => {
              onSaveVisit(v);
              setModal(null);
            }}
            onClose={() => setModal(null)}
          />
        </Dirty></Modal>
      )}
      {modal && modal.editVisit && (
        <Modal title="تعديل الزيارة" onClose={() => setModal(null)}><Dirty onDirty={ctx.markModalDirty}>
          <VisitForm
            doctorNames={doctorNames}
            prices={prices}
            initial={modal.editVisit}
            patientId={curPatient.id}
            onSave={v => {
              onSaveVisit(v);
              setModal(null);
            }}
            onClose={() => setModal(null)}
          />
        </Dirty></Modal>
      )}
      {modal === "addExam" && (
        <Modal title="فحص جديد" onClose={() => setModal(null)}><Dirty onDirty={ctx.markModalDirty}>
          <ExamForm
            doctorNames={doctorNames}
            patientId={curPatient.id}
            onSave={e => {
              onSaveExam(e);
              setModal(null);
            }}
            onClose={() => setModal(null)}
          />
        </Dirty></Modal>
      )}
      {modal && modal.editExam && (
        <Modal title="تعديل الفحص" onClose={() => setModal(null)}><Dirty onDirty={ctx.markModalDirty}>
          <ExamForm
            doctorNames={doctorNames}
            initial={modal.editExam}
            patientId={curPatient.id}
            onSave={e => {
              onSaveExam(e);
              setModal(null);
            }}
            onClose={() => setModal(null)}
          />
        </Dirty></Modal>
      )}
      {modal && modal.printRx && (
        <PrintModal
          rx={modal.printRx}
          patient={curPatient}
          primaryDoctor={primaryDoctor}
          clinic={clinic}
          onClose={() => setModal(null)}
        />
      )}
      {delTarget && (
        <Confirm
          msg={`هل تريد حذف هذا ${delTarget.type === "visit" ? "السجل" : "الفحص"} نهائياً؟`}
          onOk={onConfirmDelete}
          onNo={() => setDelTarget(null)}
        />
      )}
    </div>
  );
}
