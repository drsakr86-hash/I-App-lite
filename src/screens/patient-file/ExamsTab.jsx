import React from 'react';
import { Btn } from '../../components/common.jsx';
import { C } from '../../modules/theme/index.js';

// Patient file — "exams" tab. Presentational port of the legacy PatientFile JSX;
// all state and handlers come from the legacy function through ctx.
export default function ExamsTab({ ctx }) {
  const { exams, setDelTarget, setModal } = ctx;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <span style={{ color: C.text, fontWeight: 700, fontSize: 14 }}>شيت الفحص ({exams.length})</span>
        <Btn small onClick={() => setModal("addExam")}>+ فحص جديد</Btn>
      </div>
      {exams.length === 0 && (<div style={{ color: C.muted, textAlign: "center", padding: 40, fontSize: 13 }}>No Examinations recorded</div>)}
      {exams.map(ex => (
        <div
          key={ex.id}
          data-rec={String(ex.id)}
          style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 14, marginBottom: 12 }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div>
              <div style={{ color: C.accent, fontWeight: 700, fontSize: 13 }}>{ex.date}</div>
              <div style={{ color: C.muted, fontSize: 11 }}>{ex.doctor}{ex._sources && !ex._sources.includes("legacy") ? " · سجل مركزي" : ""}</div>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <div
                role="button"
                tabIndex={0}
                onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.currentTarget.click(); } }}
                onClick={() => setModal({
                  editExam: ex
                })}
                style={{
                  background: C.accent + "22",
                  borderRadius: 8,
                  padding: "5px 10px",
                  color: C.accent,
                  fontSize: 11,
                  cursor: "pointer"
                }}
              >
                ✏
              </div>
              <div
                role="button"
                tabIndex={0}
                onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.currentTarget.click(); } }}
                onClick={() => setDelTarget({
                  type: "exam",
                  id: ex.id
                })}
                style={{
                  background: C.danger + "22",
                  borderRadius: 8,
                  padding: "5px 10px",
                  color: C.danger,
                  fontSize: 11,
                  cursor: "pointer"
                }}
              >
                🗑
              </div>
            </div>
          </div>
          {ex.chiefComplaint && (
            <div style={{ background: C.bg, borderRadius: 10, padding: 10, marginBottom: 8 }}>
              <div style={{ color: C.muted, fontSize: 10, marginBottom: 3 }}>الشكوى</div>
              <div style={{ color: C.text, fontSize: 12 }}>{ex.chiefComplaint}</div>
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {[["حدة إبصار ي", ex.visualAcuityR || "-"], ["حدة إبصار ش", ex.visualAcuityL || "-"], ["ضغط العين ي", ex.iopR ? ex.iopR + " mmHg" : "-"], ["ضغط العين ش", ex.iopL ? ex.iopL + " mmHg" : "-"]].map(([k, v]) => (
              <div key={k} style={{ background: C.bg, borderRadius: 8, padding: "8px 10px" }}>
                <div style={{ color: C.muted, fontSize: 10 }}>{k}</div>
                <div style={{ color: C.teal, fontWeight: 700, fontSize: 14 }}>{v}</div>
              </div>
            ))}
          </div>
          {ex.diagnosis && (
            <div
              style={{ background: C.gold + "11", border: `1px solid ${C.gold}33`, borderRadius: 10, padding: 10, marginTop: 8 }}
            >
              <div style={{ color: C.gold, fontSize: 11, fontWeight: 700, marginBottom: 3 }}>التشخيص</div>
              <div style={{ color: C.text, fontSize: 12 }}>{ex.diagnosis}</div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
