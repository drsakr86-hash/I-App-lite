import React from 'react';
import { Btn } from '../../components/common.jsx';
import { C } from '../../modules/theme/index.js';
import { Tag } from '../../modules/ui/atoms.jsx';
import InjectionsSection from '../../components/InjectionsSection.jsx';
import { t, useLang } from '../../modules/i18n/index.js';
import { tv } from '../../modules/i18n/tv.js';

// Patient file — "visits" tab. Presentational port of the legacy PatientFile JSX;
// all state and handlers come from the legacy function through ctx.
export default function VisitsTab({ ctx }) {
  const { patient, setDelTarget, setModal, totalSpent, visits } = ctx;
  const lang = useLang();
  return (
    <div>
      <InjectionsSection patient={patient}/>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <span style={{ color: C.text, fontWeight: 700, fontSize: 14 }}>{t("g1.visits.title", lang)} ({visits.length})</span>
        <Btn small onClick={() => setModal("addVisit")}>+ {t("g1.pf.newVisit", lang)}</Btn>
      </div>
      {visits.length === 0 && (<div style={{ color: C.muted, textAlign: "center", padding: 40, fontSize: 13 }}>{t("g1.visits.none", lang)}</div>)}
      {visits.map(v => (
        <div
          key={v.id}
          data-rec={String(v.id)}
          style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 14, marginBottom: 12 }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
            <div>
              <div style={{ color: C.accent, fontWeight: 700, fontSize: 13 }}>{v.date}</div>
              <div style={{ color: C.muted, fontSize: 11 }}>{tv(v.doctor)}{" · "}{tv(v.type)}</div>
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <Tag label={v.paid ? t("g1.visits.paid", lang) : t("g1.visits.unpaid", lang)} color={v.paid ? C.success : C.danger}/>
            </div>
          </div>
          {v.complaint && (
            <div style={{ background: C.bg, borderRadius: 10, padding: 10, marginBottom: 8 }}>
              <div style={{ color: C.muted, fontSize: 10, marginBottom: 3 }}>{t("g1.visits.complaint", lang)}</div>
              <div style={{ color: C.text, fontSize: 12 }}>{tv(v.complaint)}</div>
            </div>
          )}
          {v.result && (
            <div
              style={{
                background: C.success + "11",
                border: `1px solid ${C.success}33`,
                borderRadius: 10,
                padding: 10,
                marginBottom: 8
              }}
            >
              <div style={{ color: C.success, fontSize: 10, marginBottom: 3 }}>{t("g1.visits.result", lang)}</div>
              <div style={{ color: C.text, fontSize: 12 }}>{v.result}</div>
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ color: C.gold, fontWeight: 700, fontSize: 13 }}>
                {"💰 "}
                {Number(v.cost || 0).toLocaleString()}
                {" " + t("g1.unit.egp", lang)}
              </span>
              {v.nextVisit && (<span style={{ color: C.teal, fontSize: 11 }}>{"📅 "}{v.nextVisit}</span>)}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <div
                role="button"
                tabIndex={0}
                aria-label={t("g1.common.edit", lang)}
                onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.currentTarget.click(); } }}
                onClick={() => setModal({
                  editVisit: v
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
                  type: "visit",
                  id: v.id
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
          {v.notes && (
            <div
              style={{ color: C.muted, fontSize: 11, marginTop: 8, background: C.border, borderRadius: 8, padding: "6px 10px" }}
            >
              {tv(v.notes)}
            </div>
          )}
        </div>
      ))}
      {visits.length > 0 && (
        <div
          style={{
            background: `linear-gradient(135deg,${C.gold}22,${C.gold}11)`,
            border: `1px solid ${C.gold}44`,
            borderRadius: 12,
            padding: "12px 16px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center"
          }}
        >
          <span style={{ color: C.muted, fontSize: 13 }}>{t("g1.visits.totalPaid", lang)}</span>
          <span style={{ color: C.gold, fontWeight: 800, fontSize: 16 }}>{totalSpent.toLocaleString()}{" " + t("g1.unit.egp", lang)}</span>
        </div>
      )}
    </div>
  );
}
