import React from 'react';
import { C } from '../../modules/theme/index.js';
import { SecHead } from '../../modules/ui/atoms.jsx';
import { t, useLang } from '../../modules/i18n/index.js';
import { tv } from '../../modules/i18n/tv.js';

// Patient file — "treatment" tab. Presentational port of the legacy PatientFile JSX;
// all state and handlers come from the legacy function through ctx.
export default function TreatmentTab({ ctx }) {
  const { exams } = ctx;
  const lang = useLang();
  return (
    <div>
      <div style={{ color: C.text, fontWeight: 700, fontSize: 14, marginBottom: 14 }}>{t("g1.tx.plan", lang)}</div>
      {exams.filter(e => e.treatmentPlan).length === 0 && (<div style={{ color: C.muted, textAlign: "center", padding: 40, fontSize: 13 }}>{t("g1.tx.empty", lang)}</div>)}
      {exams.filter(e => e.treatmentPlan).map(ex => (
        <div
          key={ex.id}
          data-rec={String(ex.id)}
          style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 14, marginBottom: 12 }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
            <span style={{ color: C.accent, fontWeight: 700, fontSize: 13 }}>{ex.date}</span>
            <span style={{ color: C.muted, fontSize: 11 }}>{tv(ex.doctor)}</span>
          </div>
          <div
            style={{
              background: C.success + "11",
              border: `1px solid ${C.success}33`,
              borderRadius: 12,
              padding: 12,
              marginBottom: 10
            }}
          >
            <SecHead icon="💊" label={t("g1.tx.plan", lang)} color={C.success}/>
            <div style={{ color: C.text, fontSize: 13, lineHeight: 1.8, whiteSpace: "pre-wrap" }}>
              {tv(ex.treatmentPlan)}
            </div>
          </div>
          {ex.followUp && (
            <div
              style={{
                background: C.teal + "11",
                border: `1px solid ${C.teal}33`,
                borderRadius: 10,
                padding: 10,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 8
              }}
            >
              <span style={{ color: C.muted, fontSize: 12 }}>{t("g1.tx.followUpDate", lang)}</span>
              <span style={{ color: C.teal, fontWeight: 700, fontSize: 13 }}>{"📅 "}{ex.followUp}</span>
            </div>
          )}
          {ex.anteriorSegment && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
              <div style={{ background: C.bg, borderRadius: 10, padding: 10 }}>
                <div style={{ color: C.muted, fontSize: 10, marginBottom: 3 }}>{t("g1.tx.anterior", lang)}</div>
                <div style={{ color: C.text, fontSize: 12 }}>{tv(ex.anteriorSegment)}</div>
              </div>
              {ex.posteriorSegment && (
                <div style={{ background: C.bg, borderRadius: 10, padding: 10 }}>
                  <div style={{ color: C.muted, fontSize: 10, marginBottom: 3 }}>{t("g1.tx.posterior", lang)}</div>
                  <div style={{ color: C.text, fontSize: 12 }}>{tv(ex.posteriorSegment)}</div>
                </div>
              )}
            </div>
          )}
          {ex.notes && (
            <div style={{ background: C.border, borderRadius: 10, padding: 10, marginTop: 8 }}>
              <div style={{ color: C.muted, fontSize: 10, marginBottom: 3 }}>{t("g1.tx.notes", lang)}</div>
              <div style={{ color: C.text, fontSize: 12 }}>{tv(ex.notes)}</div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
