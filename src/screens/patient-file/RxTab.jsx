import React from 'react';
import { C } from '../../modules/theme/index.js';
import { medicinesToText } from '../../modules/patient-file/normalize.js';

// Patient file — "rx" tab. Presentational port of the legacy PatientFile JSX;
// all state and handlers come from the legacy function through ctx.
export default function RxTab({ ctx }) {
  const { onDeleteRx, rxList, setModal } = ctx;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={{ color: C.text, fontWeight: 700, fontSize: 14 }}>الوصفات ({rxList.length})</div>
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
          + وصفة جديدة
        </div>
      </div>
      {rxList.length === 0 && (<div style={{ color: C.muted, textAlign: "center", padding: 40, fontSize: 13 }}>لا توجد وصفات لهذا المريض</div>)}
      {rxList.map(rx => (
        <div
          key={rx.id}
          data-rec={String(rx.id)}
          style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 14, marginBottom: 12 }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ color: C.accent, fontWeight: 700, fontSize: 13 }}>{rx.date}{" · "}{rx.eye}</div>
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
                ✏ تعديل
              </div>
              <div
                role="button"
                tabIndex={0}
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
            {[["SPH يمنى", rx.sphR], ["CYL يمنى", rx.cylR], ["AXIS يمنى", rx.axisR], ["SPH يسرى", rx.sphL], ["CYL يسرى", rx.cylL], ["AXIS يسرى", rx.axisL]].map(([k, v]) => (
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
                  <span style={{ color: C.muted, fontSize: 11, marginRight: 12 }}>{"IPD: "}</span>
                  <span style={{ color: C.teal, fontWeight: 700 }}>{rx.ipd}</span>
                </>
              )}
            </div>
          )}
          {medicinesToText(rx.medicines).trim() && (
            <div
              style={{ background: C.gold + "11", border: `1px solid ${C.gold}33`, borderRadius: 10, padding: 10, marginBottom: 8 }}
            >
              <div style={{ color: C.gold, fontSize: 11, fontWeight: 700, marginBottom: 3 }}>💊 الأدوية</div>
              <div style={{ color: C.text, fontSize: 12, whiteSpace: "pre-line" }}>{medicinesToText(rx.medicines)}</div>
            </div>
          )}
          {rx.notes && (<div style={{ color: C.muted, fontSize: 11, marginBottom: 8, fontStyle: "italic" }}>{rx.notes}</div>)}
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
            🖨️ طباعة الوصفة / كشف النظارة
          </div>
        </div>
      ))}
    </div>
  );
}
