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
import EyeReportModal from './patient-file/EyeReportModal.jsx';
import { t, useLang, dirOf } from '../modules/i18n/index.js';
import { tv } from '../modules/i18n/tv.js';
import { LangToggle } from '../components/common.jsx';
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
  const lang = useLang();
  const tabIds = TABS.map(x => x.id);
  const onTabKey = e => {
    const i = tabIds.indexOf(tab);
    let n = -1;
    // RTL: the visual "next" tab is to the left, so ArrowLeft advances and ArrowRight goes back.
    const fwd = dirOf(lang) === 'rtl' ? 'ArrowLeft' : 'ArrowRight';
    const back = dirOf(lang) === 'rtl' ? 'ArrowRight' : 'ArrowLeft';
    if (e.key === fwd || e.key === 'ArrowDown') n = (i + 1) % tabIds.length;
    else if (e.key === back || e.key === 'ArrowUp') n = (i - 1 + tabIds.length) % tabIds.length;
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
        direction: dirOf(lang),
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
              <span className="ds-badge ds-badge--info" style={{ marginInlineEnd: 8 }}>{curPatient.patientCode || t("common.notRecorded", lang)}</span>
              {ageLabel(curPatient.age)}{" · "}{tv(curPatient.gender) || t("common.notRecorded", lang)}{curPatient.phone ? " · " + curPatient.phone : ""}
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            <Tag label={tv(curPatient.status)} color={SC[curPatient.status] || C.muted}/>
            <LangToggle />
            <button type="button" className="ds-btn" onClick={() => setModal("eyeReport")}>📄 {t("report.button", lang)}</button>
            <button type="button" className="ds-btn" onClick={() => setModal("editPatient")}>✏ {t("common.editFile", lang)}</button>
            <button
              type="button"
              className="ds-btn"
              onClick={() => printDoc(getPatientFileHTML(curPatient, visits, patientRecords, rxList, primaryDoctor, clinic))}
            >
              🖨️ {t("common.print", lang)}
            </button>
          </div>
        </header>
        <StatusBar ctx={ctx} />
        <div className="pf-grid" style={{ marginTop: 10 }}>
          <nav className="pf-nav" aria-label={t("tabs.aria", lang)}>
            <div className="ds-tabs" role="tablist" aria-label={t("tabs.aria", lang)} aria-orientation="horizontal" onKeyDown={onTabKey}>
              {TABS.map(tb => (
                <button
                  type="button"
                  role="tab"
                  id={"pf-tab-" + tb.id}
                  aria-selected={tab === tb.id}
                  aria-controls="pf-panel"
                  tabIndex={tab === tb.id ? 0 : -1}
                  className="ds-tab"
                  key={tb.id}
                  onClick={() => setTab(tb.id)}
                >
                  <span aria-hidden="true" style={{ marginInlineEnd: 6 }}>
                    {tb.icon === "oct" ? (
                      <img src={XRAY_ICON} alt="" style={{ width: 16, height: 16, verticalAlign: "middle", filter: tab === tb.id ? "brightness(0) invert(1)" : "brightness(0.8)" }} />
                    ) : tb.icon}
                  </span>
                  {t('tab.' + tb.id, lang)}
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
          <aside className="pf-side" aria-label={t("g1.pf.sideAria", lang)}>
            {tab !== "info" && summary && (
              <div className="ds-card" style={{ marginBottom: 12 }}>
                <h2 className="ds-h">{t("g1.pf.statusNow", lang)}</h2>
                <div className="ds-sub">{t("g1.pf.diagnosis", lang)}</div>
                <div style={{ color: C.text, fontSize: 13, marginBottom: 6 }} dir="auto">{summary.diagnosis.primary ? tv(summary.diagnosis.primary.text) : t("common.notRecorded", lang)}</div>
                <div className="ds-sub">{t("sum.nextVisit", lang)}</div>
                <div style={{ color: C.text, fontSize: 13 }}>{summary.followUp ? summary.followUp.date + (summary.followUp.overdue ? " (" + t("sum.overdue", lang) + ")" : "") : t("common.notRecorded", lang)}</div>
                {summary.alerts.length > 0 && <div className="ds-alert ds-alert--warn" style={{ marginTop: 8 }}>{t("g1.pf.alertsReview", lang, { n: summary.alerts.length })}</div>}
              </div>
            )}
            <div className="ds-card">
              <h2 className="ds-h">{t("g1.pf.recentEvents", lang)}</h2>
              {recent.length === 0 ? <div className="ds-sub">{t("g1.pf.noEvents", lang)}</div> : (
                <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
                  {recent.map(e => (
                    <li key={e.key} style={{ fontSize: 12, color: C.text }}>
                      <span aria-hidden="true">{e.icon} </span>{tv(e.title)}
                      <div className="ds-sub">{e.date || t("g1.cs.noDate", lang)}</div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </aside>
        </div>
      </div>
      {viewImg && <ImageViewer ctx={ctx} />}
      {modal === "eyeReport" && <EyeReportModal ctx={ctx} onClose={() => setModal(null)} />}
      {modal === "editPatient" && (
        <Modal title={t("g1.pf.editFileTitle", lang)} onClose={() => setModal(null)}><Dirty onDirty={ctx.markModalDirty}>
          <PatientEditForm patient={curPatient} onSave={handlePatientSave} onClose={() => setModal(null)}/>
        </Dirty></Modal>
      )}
      {modal === "addRx" && (
        <Modal title={t("g1.pf.newRx", lang)} onClose={() => setModal(null)}><Dirty onDirty={ctx.markModalDirty}>
          <RxForm
            patients={[curPatient]}
            doctorNames={doctorNames}
            onSave={onAddRxSave}
            onClose={() => setModal(null)}
          />
        </Dirty></Modal>
      )}
      {modal && modal.editRx && (
        <Modal title={t("g1.pf.editRx", lang)} onClose={() => setModal(null)}><Dirty onDirty={ctx.markModalDirty}>
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
        <Modal title={t("g1.pf.newVisit", lang)} onClose={() => setModal(null)}><Dirty onDirty={ctx.markModalDirty}>
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
        <Modal title={t("g1.pf.editVisit", lang)} onClose={() => setModal(null)}><Dirty onDirty={ctx.markModalDirty}>
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
        <Modal title={t("g1.pf.newExam", lang)} onClose={() => setModal(null)}><Dirty onDirty={ctx.markModalDirty}>
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
        <Modal title={t("g1.pf.editExam", lang)} onClose={() => setModal(null)}><Dirty onDirty={ctx.markModalDirty}>
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
          msg={t(delTarget.type === "visit" ? "g1.pf.delRecord" : "g1.pf.delExam", lang)}
          onOk={onConfirmDelete}
          onNo={() => setDelTarget(null)}
        />
      )}
    </div>
  );
}
