import React from 'react';
import { latestExamByDateTime } from '../../modules/patient-file/model.js';

const L = () => globalThis.IAppLegacy;

// Patient file — "info" tab. Presentational port of the legacy PatientFile JSX;
// all state and handlers come from the legacy function through ctx.
export default function InfoSummary({ ctx }) {
  const { C, SecHead } = L();
  const { curPatient, exams, visits } = ctx;
  return (
    <div
      style={{
        background: `linear-gradient(135deg,${C.teal}12,${C.accent}0d)`,
        border: `1px solid ${C.teal}33`,
        borderRadius: 14,
        padding: 14,
        marginBottom: 12
      }}
    >
      <SecHead icon="🩺" label="Clinical Summary" color={C.teal}/>
      {(() => {
        const latest = latestExamByDateTime(exams);
        const latestVisit = [...visits][0];
        return (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
              <div style={{ background: C.card, borderRadius: 9, padding: 9 }}>
                <div style={{ color: C.muted, fontSize: 10 }}>آخر زيارة</div>
                <div style={{ color: C.text, fontWeight: 700, fontSize: 12 }}>{latestVisit?.date || "—"}</div>
              </div>
              <div style={{ background: C.card, borderRadius: 9, padding: 9 }}>
                <div style={{ color: C.muted, fontSize: 10 }}>Latest Examination</div>
                <div style={{ color: C.text, fontWeight: 700, fontSize: 12 }}>{latest?.date || "—"}</div>
              </div>
              <div style={{ background: C.card, borderRadius: 9, padding: 9 }}>
                <div style={{ color: C.muted, fontSize: 10 }}>VA</div>
                <div style={{ color: C.teal, fontWeight: 800, fontSize: 12 }}>
                  {"OD "}
                  {latest?.visualAcuityR || "—"}
                  {" · OS "}
                  {latest?.visualAcuityL || "—"}
                </div>
              </div>
              <div style={{ background: C.card, borderRadius: 9, padding: 9 }}>
                <div style={{ color: C.muted, fontSize: 10 }}>IOP</div>
                <div style={{ color: C.teal, fontWeight: 800, fontSize: 12 }}>
                  {"OD "}
                  {latest?.iopR || "—"}
                  {" · OS "}
                  {latest?.iopL || "—"}
                </div>
              </div>
            </div>
            <div style={{ background: C.card, borderRadius: 10, padding: 10 }}>
              <div style={{ color: C.muted, fontSize: 10, marginBottom: 4 }}>التشخيص الحالي</div>
              <div style={{ color: C.gold, fontWeight: 800, fontSize: 13 }}>
                {latest?.diagnosis || curPatient.condition || "لا يوجد تشخيص مسجل"}
              </div>
              {(latest?.treatmentPlan || latestVisit?.result) && (
                <div style={{ marginTop: 8, color: C.text, fontSize: 11, lineHeight: 1.7 }}>
                  {latest?.treatmentPlan || latestVisit?.result}
                </div>
              )}
            </div>
            {curPatient.allergies && (
              <div
                style={{
                  marginTop: 8,
                  background: C.danger + "11",
                  border: `1px solid ${C.danger}33`,
                  borderRadius: 9,
                  padding: 8,
                  color: C.danger,
                  fontSize: 11,
                  fontWeight: 700
                }}
              >
                {"⚠ الحساسية: "}
                {curPatient.allergies}
              </div>
            )}
          </>
        );
      })()}
    </div>
  );
}
