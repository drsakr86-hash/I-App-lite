import React from 'react';
import { Btn } from '../../components/common.jsx';
import { C } from '../../modules/theme/index.js';
import { t, useLang } from '../../modules/i18n/index.js';
import { tv } from '../../modules/i18n/tv.js';

// Patient file — "exams" tab. Presentational port of the legacy PatientFile JSX;
// all state and handlers come from the legacy function through ctx.
export default function ExamsTab({ ctx }) {
  const { exams, setDelTarget, setModal } = ctx;
  const lang = useLang();
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <span style={{ color: C.text, fontWeight: 700, fontSize: 14 }}>{t("g1.exams.title", lang)} ({exams.length})</span>
        <Btn small onClick={() => setModal("addExam")}>+ {t("g1.pf.newExam", lang)}</Btn>
      </div>
      {exams.length === 0 && (<div style={{ color: C.muted, textAlign: "center", padding: 40, fontSize: 13 }}>{t("g1.exams.none", lang)}</div>)}
      {exams.map(ex => (
        <div
          key={ex.id}
          data-rec={String(ex.id)}
          style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 14, marginBottom: 12 }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div>
              <div style={{ color: C.accent, fontWeight: 700, fontSize: 13 }}>{ex.date}</div>
              <div style={{ color: C.muted, fontSize: 11 }}>{tv(ex.doctor)}{ex._sources && !ex._sources.includes("legacy") ? " · " + t("g1.exams.central", lang) : ""}</div>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <div
                role="button"
                tabIndex={0}
                aria-label={t("g1.common.edit", lang)}
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
                aria-label={t("g1.common.delete", lang)}
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
              <div style={{ color: C.muted, fontSize: 10, marginBottom: 3 }}>{t("g1.visits.complaint", lang)}</div>
              <div style={{ color: C.text, fontSize: 12 }}>{tv(ex.chiefComplaint)}</div>
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {[[t("g1.exams.vaR", lang), ex.visualAcuityR || "-"], [t("g1.exams.vaL", lang), ex.visualAcuityL || "-"], [t("g1.exams.iopR", lang), ex.iopR ? ex.iopR + " mmHg" : "-"], [t("g1.exams.iopL", lang), ex.iopL ? ex.iopL + " mmHg" : "-"]].map(([k, v]) => (
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
              <div style={{ color: C.gold, fontSize: 11, fontWeight: 700, marginBottom: 3 }}>{t("g1.pf.diagnosis", lang)}</div>
              <div style={{ color: C.text, fontSize: 12 }}>{tv(ex.diagnosis)}</div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
