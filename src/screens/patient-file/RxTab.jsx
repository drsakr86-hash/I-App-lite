import React from 'react';
import { C } from '../../modules/theme/index.js';
import { medicinesToText } from '../../modules/patient-file/normalize.js';
import { t, useLang } from '../../modules/i18n/index.js';
import { tv } from '../../modules/i18n/tv.js';

// Patient file — "rx" tab. Presentational port of the legacy PatientFile JSX;
// all state and handlers come from the legacy function through ctx.
export default function RxTab({ ctx }) {
  const { onDeleteRx, rxList, setModal } = ctx;
  const lang = useLang();
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={{ color: C.text, fontWeight: 700, fontSize: 14 }}>{t("tab.rx", lang)} ({rxList.length})</div>
        <div
          role="button"
          tabIndex={0}
          onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.currentTarget.click(); } }}
          onClick={() => setModal("addRx")}
          style={{
            background: `linear-gradient(135deg,${C.accent},${C.teal})`,
            borderRadius: 10,
            padding: "7px 14px",
            color: C.bg,
            fontSize: 12,
            fontWeight: 700,
            cursor: "pointer"
          }}
        >
          + {t("g1.pf.newRx", lang)}
        </div>
      </div>
      {rxList.length === 0 && (<div style={{ color: C.muted, textAlign: "center", padding: 40, fontSize: 13 }}>{t("g1.rx.none", lang)}</div>)}
      {rxList.map(rx => (
        <div
          key={rx.id}
          data-rec={String(rx.id)}
          style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 14, marginBottom: 12 }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ color: C.accent, fontWeight: 700, fontSize: 13 }}>{rx.date}{" · "}{tv(rx.eye)}</div>
            <div style={{ display: "flex", gap: 6 }}>
              <div
                role="button"
                tabIndex={0}
                onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.currentTarget.click(); } }}
                onClick={() => setModal({
                  editRx: rx
                })}
                style={{
                  background: C.accent + "22",
                  borderRadius: 8,
                  padding: "5px 10px",
                  color: C.accent,
                  fontSize: 11,
                  cursor: "pointer",
                  fontWeight: 600
                }}
              >
                ✏ {t("g1.common.edit", lang)}
              </div>
              <div
                role="button"
                tabIndex={0}
                aria-label={t("g1.common.delete", lang)}
                onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.currentTarget.click(); } }}
                onClick={() => onDeleteRx(rx)}
                style={{
                  background: C.danger + "22",
                  borderRadius: 8,
                  padding: "5px 10px",
                  color: C.danger,
                  fontSize: 11,
                  cursor: "pointer",
                  fontWeight: 600
                }}
              >
                🗑
              </div>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
            {[[t("g1.rx.sphR", lang), rx.sphR], [t("g1.rx.cylR", lang), rx.cylR], [t("g1.rx.axisR", lang), rx.axisR], [t("g1.rx.sphL", lang), rx.sphL], [t("g1.rx.cylL", lang), rx.cylL], [t("g1.rx.axisL", lang), rx.axisL]].map(([k, v]) => (
              <div key={k} style={{ background: C.bg, borderRadius: 8, padding: "6px 10px" }}>
                <div style={{ color: C.muted, fontSize: 10 }}>{k}</div>
                <div style={{ color: C.text, fontWeight: 600, fontSize: 13 }}>{v || "-"}</div>
              </div>
            ))}
          </div>
          {rx.add && rx.add !== "0.00" && (
            <div style={{ background: C.teal + "11", borderRadius: 8, padding: "6px 10px", marginBottom: 8 }}>
              <span style={{ color: C.muted, fontSize: 11 }}>{"ADD: "}</span>
              <span style={{ color: C.teal, fontWeight: 700 }}>{rx.add}</span>
              {rx.ipd && (
                <>
                  <span style={{ color: C.muted, fontSize: 11, marginInlineStart: 12 }}>{"IPD: "}</span>
                  <span style={{ color: C.teal, fontWeight: 700 }}>{rx.ipd}</span>
                </>
              )}
            </div>
          )}
          {medicinesToText(rx.medicines).trim() && (
            <div
              style={{ background: C.gold + "11", border: `1px solid ${C.gold}33`, borderRadius: 10, padding: 10, marginBottom: 8 }}
            >
              <div style={{ color: C.gold, fontSize: 11, fontWeight: 700, marginBottom: 3 }}>💊 {t("g1.rx.medicines", lang)}</div>
              <div style={{ color: C.text, fontSize: 12, whiteSpace: "pre-line" }}>{tv(medicinesToText(rx.medicines))}</div>
            </div>
          )}
          {rx.notes && (<div style={{ color: C.muted, fontSize: 11, marginBottom: 8, fontStyle: "italic" }}>{tv(rx.notes)}</div>)}
          <div
            role="button"
            tabIndex={0}
            onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.currentTarget.click(); } }}
            onClick={() => setModal({
              printRx: rx
            })}
            style={{
              background: C.purple + "22",
              borderRadius: 8,
              padding: "7px 0",
              color: C.purple,
              fontSize: 11,
              fontWeight: 700,
              cursor: "pointer",
              textAlign: "center"
            }}
          >
            🖨️ {t("g1.rx.print", lang)}
          </div>
        </div>
      ))}
    </div>
  );
}
