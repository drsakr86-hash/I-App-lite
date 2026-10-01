import React from 'react';
import { latestExamByDateTime, ageLabel } from '../../modules/patient-file/model.js';
import { C } from '../../modules/theme/index.js';
import { SecHead } from '../../modules/ui/atoms.jsx';

// Patient file — "info" tab. Presentational port of the legacy PatientFile JSX;
// all state and handlers come from the legacy function through ctx.
export default function InfoDetails({ ctx }) {
  const { curPatient, exams, totalSpent, visits } = ctx;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 14 }}>
        <SecHead icon="📋" label="البيانات الأساسية"/>
        {[["رقم الملف", curPatient.patientCode || "—"], ["الاسم", curPatient.name], ["العمر", ageLabel(curPatient.age)], ["الجنس", curPatient.gender], ["فصيلة الدم", curPatient.bloodType || "-"], ["الهاتف", curPatient.phone], ["المهنة", curPatient.occupation || "-"], ["العنوان", curPatient.address]].map(([k, v]) => (
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
            <span style={{ color: C.text, fontSize: 12, fontWeight: 600, textAlign: "left" }}>{v}</span>
          </div>
        ))}
      </div>
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 14 }}>
        <SecHead icon="🏥" label="الحالة الطبية" color={C.gold}/>
        {[["التشخيص", curPatient.condition], ["الحالة", curPatient.status], ["التاريخ المرضي", curPatient.history || "-"], ["الحساسية", curPatient.allergies || "-"]].map(([k, v]) => (
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
            <span style={{ color: C.text, fontSize: 12, fontWeight: 600, textAlign: "left" }}>{v}</span>
          </div>
        ))}
      </div>
      {exams.length > 0 && (() => {
        const latest = latestExamByDateTime(exams);
        return (
          <div style={{ background: C.accent + "0d", border: `1px solid ${C.accent}33`, borderRadius: 12, padding: 12 }}>
            <SecHead icon="🩺" label="Latest Examination" color={C.accent}/>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div style={{ background: C.card, borderRadius: 9, padding: 9 }}>
                <div style={{ color: C.muted, fontSize: 10 }}>التاريخ</div>
                <div style={{ color: C.text, fontWeight: 700, fontSize: 12 }}>{latest.date || "—"}</div>
              </div>
              <div style={{ background: C.card, borderRadius: 9, padding: 9 }}>
                <div style={{ color: C.muted, fontSize: 10 }}>التشخيص</div>
                <div style={{ color: C.gold, fontWeight: 700, fontSize: 12 }}>{latest.diagnosis || "—"}</div>
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
          <SecHead icon="🆘" label="جهة الطوارئ" color={C.danger}/>
          <div style={{ color: C.text, fontSize: 13 }}>{curPatient.emergencyContact}</div>
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
        {[["🩺", exams.length, "Examination"], ["🗓", visits.length, "زيارة"], ["💰", totalSpent.toLocaleString(), "ج.م"]].map(([ico, val, lbl], i) => (
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
