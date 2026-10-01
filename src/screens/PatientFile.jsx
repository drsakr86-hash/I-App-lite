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
export default function PatientFile({ ctx }) {
  const {
    TABS, tab, setTab, modal, setModal, delTarget, setDelTarget, viewImg, curPatient, visits, patientRecords, rxList,
    clinic, doctorNames, prices, primaryDoctor, onClose, onSaveExam, onSaveVisit, handlePatientSave,
    onAddRxSave, onEditRxSave, onConfirmDelete
  } = ctx;
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: C.bg,
        zIndex: 300,
        overflowY: "auto",
        direction: "rtl",
        fontFamily: "'Segoe UI','Tahoma',Arial,sans-serif",
        maxWidth: 480,
        margin: "0 auto"
      }}
    >
      <TopBar backLabel={curPatient.name} onBack={onClose}/>
      <div
        style={{
          background: `linear-gradient(135deg,${C.accent}22,${C.teal}11)`,
          border: `1px solid ${C.accent}33`,
          margin: "12px 16px",
          borderRadius: 16,
          padding: "14px 16px",
          display: "flex",
          alignItems: "center",
          gap: 14
        }}
      >
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: "50%",
            background: `linear-gradient(135deg,${C.accent},${C.teal})`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: C.bg,
            fontWeight: 800,
            fontSize: 22
          }}
        >
          {(curPatient.name || "?")[0]}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ color: C.text, fontWeight: 700, fontSize: 16 }}>{curPatient.name}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
            <span
              style={{
                background: C.accent + "33",
                color: C.accent,
                borderRadius: 8,
                padding: "2px 10px",
                fontSize: 12,
                fontWeight: 800,
                letterSpacing: 1
              }}
            >
              {curPatient.patientCode || "—"}
            </span>
          </div>
          <div style={{ color: C.muted, fontSize: 12 }}>
            {ageLabel(curPatient.age)}
            {" · "}
            {curPatient.gender}
            {" · "}
            {curPatient.phone}
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 4, alignItems: "center" }}>
            <Tag label={curPatient.status} color={SC[curPatient.status] || C.muted}/>
            <span
              onClick={() => setModal("editPatient")}
              style={{
                color: C.accent,
                fontSize: 11,
                cursor: "pointer",
                background: C.accent + "22",
                borderRadius: 8,
                padding: "2px 8px"
              }}
            >
              ✏ تعديل الملف
            </span>
            <span
              onClick={() => printDoc(getPatientFileHTML(curPatient, visits, patientRecords, rxList, primaryDoctor, clinic))}
              style={{
                color: C.purple,
                fontSize: 11,
                cursor: "pointer",
                background: C.purple + "22",
                borderRadius: 8,
                padding: "2px 8px"
              }}
            >
              🖨️ طباعة
            </span>
          </div>
        </div>
      </div>
      <div
        style={{
          display: "flex",
          margin: "0 16px 14px",
          background: C.card,
          borderRadius: 12,
          padding: 4,
          overflowX: "auto"
        }}
      >
        {TABS.map(t => (
          <div
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              flex: "0 0 auto",
              textAlign: "center",
              padding: "8px 10px",
              background: tab === t.id ? `linear-gradient(135deg,${C.accent},${C.teal})` : "transparent",
              borderRadius: 9,
              cursor: "pointer",
              color: tab === t.id ? C.bg : C.muted,
              fontSize: 10,
              fontWeight: 700,
              minWidth: 54
            }}
          >
            <div style={{ fontSize: 13, display: "flex", justifyContent: "center", alignItems: "center", height: 18 }}>
              {t.icon === "oct" ? (
                <img
                  src={XRAY_ICON}
                  style={{
                    width: 18,
                    height: 18,
                    display: "block",
                    filter: tab === t.id ? "brightness(0) invert(1)" : "brightness(0.8)"
                  }}
                />
              ) : t.icon}
            </div>
            {t.label}
          </div>
        ))}
      </div>
      <div style={{ padding: "0 16px 100px" }}>
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
      </div>
      {viewImg && <ImageViewer ctx={ctx} />}
      {modal === "editPatient" && (
        <Modal title="تعديل الملف الطبي" onClose={() => setModal(null)}>
          <PatientEditForm patient={curPatient} onSave={handlePatientSave} onClose={() => setModal(null)}/>
        </Modal>
      )}
      {modal === "addRx" && (
        <Modal title="وصفة جديدة" onClose={() => setModal(null)}>
          <RxForm
            patients={[curPatient]}
            doctorNames={doctorNames}
            onSave={onAddRxSave}
            onClose={() => setModal(null)}
          />
        </Modal>
      )}
      {modal && modal.editRx && (
        <Modal title="تعديل الوصفة" onClose={() => setModal(null)}>
          <RxForm
            patients={[curPatient]}
            doctorNames={doctorNames}
            initial={modal.editRx}
            onSave={onEditRxSave}
            onClose={() => setModal(null)}
          />
        </Modal>
      )}
      {modal === "addVisit" && (
        <Modal title="زيارة جديدة" onClose={() => setModal(null)}>
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
        </Modal>
      )}
      {modal && modal.editVisit && (
        <Modal title="تعديل الزيارة" onClose={() => setModal(null)}>
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
        </Modal>
      )}
      {modal === "addExam" && (
        <Modal title="فحص جديد" onClose={() => setModal(null)}>
          <ExamForm
            doctorNames={doctorNames}
            patientId={curPatient.id}
            onSave={e => {
              onSaveExam(e);
              setModal(null);
            }}
            onClose={() => setModal(null)}
          />
        </Modal>
      )}
      {modal && modal.editExam && (
        <Modal title="تعديل الفحص" onClose={() => setModal(null)}>
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
        </Modal>
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
