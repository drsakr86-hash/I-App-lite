import React from 'react';
import { latestExamByDateTime, ageLabel } from '../../modules/patient-file/model.js';
import { C } from '../../modules/theme/index.js';
import { SecHead } from '../../modules/ui/atoms.jsx';
import { t, useLang } from '../../modules/i18n/index.js';
import { tv } from '../../modules/i18n/tv.js';

// Patient file — "info" tab. Presentational port of the legacy PatientFile JSX;
// all state and handlers come from the legacy function through ctx.
export default function InfoDetails({ ctx }) {
  const { curPatient, exams, totalSpent, visits } = ctx;
  const lang = useLang();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 14 }}>
        <SecHead icon="📋" label={t("g1.info.basic", lang)}/>
        {[[t("g1.info.fileNo", lang), curPatient.patientCode || "—"], [t("g1.info.name", lang), curPatient.name], [t("g1.info.age", lang), ageLabel(curPatient.age)], [t("g1.info.gender", lang), tv(curPatient.gender)], [t("g1.info.bloodType", lang), curPatient.bloodType || "-"], [t("g1.info.phone", lang), curPatient.phone], [t("g1.info.occupation", lang), tv(curPatient.occupation) || "-"], [t("g1.info.address", lang), tv(curPatient.address)]].map(([k, v]) => (
          <div
            key={k}
            style={{
              display: "flex",
              justifyContent: "space-between",
              paddingBottom: 8,
              marginBottom: 8,
              borderBottom: `1px solid ${C.border}33`
            }}
          >
            <span style={{ color: C.muted, fontSize: 12 }}>{k}</span>
            <span style={{ color: C.text, fontSize: 12, fontWeight: 600, textAlign: "end" }}>{v}</span>
          </div>
        ))}
      </div>
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 14 }}>
        <SecHead icon="🏥" label={t("g1.info.medical", lang)} color={C.gold}/>
        {[[t("g1.pf.diagnosis", lang), tv(curPatient.condition)], [t("g1.info.status", lang), tv(curPatient.status)], [t("g1.info.history", lang), tv(curPatient.history) || "-"], [t("g1.info.allergies", lang), tv(curPatient.allergies) || "-"]].map(([k, v]) => (
          <div
            key={k}
            style={{
              display: "flex",
              justifyContent: "space-between",
              paddingBottom: 8,
              marginBottom: 8,
              borderBottom: `1px solid ${C.border}33`
            }}
          >
            <span style={{ color: C.muted, fontSize: 12 }}>{k}</span>
            <span style={{ color: C.text, fontSize: 12, fontWeight: 600, textAlign: "end" }}>{v}</span>
          </div>
        ))}
      </div>
      {exams.length > 0 && (() => {
        const latest = latestExamByDateTime(exams);
        return (
          <div style={{ background: C.accent + "0d", border: `1px solid ${C.accent}33`, borderRadius: 12, padding: 12 }}>
            <SecHead icon="🩺" label={t("g1.info.latestExam", lang)} color={C.accent}/>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div style={{ background: C.card, borderRadius: 9, padding: 9 }}>
                <div style={{ color: C.muted, fontSize: 10 }}>{t("common.date", lang)}</div>
                <div style={{ color: C.text, fontWeight: 700, fontSize: 12 }}>{latest.date || "—"}</div>
              </div>
              <div style={{ background: C.card, borderRadius: 9, padding: 9 }}>
                <div style={{ color: C.muted, fontSize: 10 }}>{t("g1.pf.diagnosis", lang)}</div>
                <div style={{ color: C.gold, fontWeight: 700, fontSize: 12 }}>{tv(latest.diagnosis) || "—"}</div>
              </div>
              <div style={{ background: C.card, borderRadius: 9, padding: 9 }}>
                <div style={{ color: C.muted, fontSize: 10 }}>VA</div>
                <div style={{ color: C.teal, fontWeight: 700, fontSize: 12 }}>
                  {"OD: "}
                  {latest.visualAcuityR || "—"}
                  {" · OS: "}
                  {latest.visualAcuityL || "—"}
                </div>
              </div>
              <div style={{ background: C.card, borderRadius: 9, padding: 9 }}>
                <div style={{ color: C.muted, fontSize: 10 }}>IOP</div>
                <div style={{ color: C.teal, fontWeight: 700, fontSize: 12 }}>
                  {"OD: "}
                  {latest.iopR || "—"}
                  {" · OS: "}
                  {latest.iopL || "—"}
                </div>
              </div>
            </div>
          </div>
        );
      })()}
      {curPatient.emergencyContact && (
        <div style={{ background: C.danger + "11", border: `1px solid ${C.danger}33`, borderRadius: 12, padding: 12 }}>
          <SecHead icon="🆘" label={t("g1.info.emergency", lang)} color={C.danger}/>
          <div style={{ color: C.text, fontSize: 13 }}>{tv(curPatient.emergencyContact)}</div>
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
        {[["🩺", exams.length, t("g1.evt.exam", lang)], ["🗓", visits.length, t("g1.evt.visit", lang)], ["💰", totalSpent.toLocaleString(), t("g1.unit.egp", lang)]].map(([ico, val, lbl], i) => (
          <div
            key={i}
            style={{
              background: C.card,
              border: `1px solid ${C.border}`,
              borderRadius: 12,
              padding: "12px 8px",
              textAlign: "center"
            }}
          >
            <div style={{ fontSize: 16, marginBottom: 4 }}>{ico}</div>
            <div style={{ color: C.accent, fontSize: 18, fontWeight: 800 }}>{val}</div>
            <div style={{ color: C.muted, fontSize: 10 }}>{lbl}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
