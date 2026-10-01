import React from 'react';
import { Btn } from '../../components/common.jsx';
import { C } from '../../modules/theme/index.js';
import { Tag, inp } from '../../modules/ui/atoms.jsx';
import { IMAGING_ORDER_STATUSES } from '../../modules/constants/index.js';
import { getRadiologyHTML, printDoc } from '../../modules/print/index.js';

// Patient file — "requests" tab. Presentational port of the legacy PatientFile JSX;
// all state and handlers come from the legacy function through ctx.
export default function RequestsTab({ ctx }) {
  const { allRequestTests, clinic, curPatient, cycleRequestEye, imagingOrders, primaryDoctor, requestEye, requestNotes, requestResult, requestSaving, requestTests, requests, resyncRequest, savePatientRadiologyRequest, setRequestEye, setRequestNotes, toggleRequestTest } = ctx;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div>
          <div style={{ color: C.text, fontWeight: 800, fontSize: 14 }}>🧪 Investigation Order</div>
          <div style={{ color: C.muted, fontSize: 10, marginTop: 3 }}>إنشاء الطلب مباشرة من ملف المريض</div>
        </div>
        {requests.length > 0 && (
          <span
            style={{
              background: C.gold + "22",
              color: C.gold,
              borderRadius: 8,
              padding: "4px 9px",
              fontSize: 10,
              fontWeight: 700
            }}
          >
            {requests.length}
            {" طلب"}
          </span>
        )}
      </div>
      <div
        style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 12, marginBottom: 14 }}
      >
        <div style={{ display: "flex", gap: 7, alignItems: "center", marginBottom: 10 }}>
          <span style={{ color: C.muted, fontSize: 11 }}>العين الافتراضية</span>
          {[["OU", "كلتا العينين"], ["OD", "اليمنى"], ["OS", "اليسرى"]].map(([v, l]) => (
            <button
              type="button"
              key={v}
              aria-pressed={requestEye === v}
              onClick={() => setRequestEye(v)}
              style={{
                background: requestEye === v ? C.accent + "22" : "transparent",
                border: `1px solid ${requestEye === v ? C.accent : C.border}`,
                borderRadius: 8,
                padding: "5px 9px",
                color: requestEye === v ? C.accent : C.muted,
                fontSize: 10,
                fontWeight: 700
              }}
            >
              {v}
            </button>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {allRequestTests.map(t => {
            const on = !!requestTests[t.id];
            const eye = requestTests[t.id] || requestEye;
            return (
              <div
                key={t.id}
                role="checkbox"
                aria-checked={on}
                tabIndex={0}
                onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleRequestTest(t.id); } }}
                onClick={() => toggleRequestTest(t.id)}
                style={{
                  background: on ? C.accent + "12" : C.bg,
                  border: `1px solid ${on ? C.accent : C.border}`,
                  borderRadius: 10,
                  padding: "9px 10px",
                  cursor: "pointer",
                  position: "relative"
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <span
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: 5,
                      border: `2px solid ${on ? C.accent : C.border}`,
                      background: on ? C.accent : "transparent",
                      color: C.bg,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 10,
                      fontWeight: 900
                    }}
                  >
                    {on ? "✓" : ""}
                  </span>
                  <span style={{ color: C.text, fontWeight: 700, fontSize: 11 }}>{t.name}</span>
                </div>
                <div style={{ color: C.muted, fontSize: 9, marginTop: 3, paddingRight: 25 }}>{t.name_ar}</div>
                {on && (
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      cycleRequestEye(t.id);
                    }}
                    style={{
                      position: "absolute",
                      left: 7,
                      bottom: 7,
                      background: C.teal + "22",
                      border: `1px solid ${C.teal}44`,
                      borderRadius: 6,
                      color: C.teal,
                      fontSize: 9,
                      fontWeight: 800,
                      padding: "2px 6px"
                    }}
                  >
                    {eye}
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <textarea
          value={requestNotes}
          onChange={e => setRequestNotes(e.target.value)}
          rows={3}
          placeholder="ملاحظات / سبب طلب الفحص / تعليمات خاصة..."
          style={{ ...inp(), resize: "none", marginTop: 12, fontSize: 11 }}
        />
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <Btn full onClick={requestSaving ? () => {} : savePatientRadiologyRequest}>{requestSaving ? "⏳ جاري الحفظ..." : "🧪 Save Investigation Order"}</Btn>
          <Btn
            outline
            onClick={() => {
              const html = getRadiologyHTML(requestTests, curPatient, requestNotes, primaryDoctor, allRequestTests, clinic);
              if (Object.keys(requestTests).length) printDoc(html);else alert("اختر الفحوصات أولاً");
            }}
          >
            🖨️ طباعة
          </Btn>
        </div>
        {requestResult && (() => {
          const ok = requestResult.status === "saved";
          const bad = requestResult.status === "failed";
          const color = ok ? C.success : bad ? C.danger : C.gold;
          return (
            <div
              role={bad ? "alert" : "status"}
              style={{
                marginTop: 9,
                background: color + "11",
                border: `1px solid ${color}33`,
                borderRadius: 9,
                padding: 8,
                color,
                fontSize: 11,
                fontWeight: 700
              }}
            >
              {ok ? "✓ " : bad ? "✕ " : "⚠ "}{requestResult.message}
            </div>
          );
        })()}
      </div>
      {requests.length > 0 && (
        <div>
          <div style={{ color: C.muted, fontSize: 11, fontWeight: 700, marginBottom: 8 }}>الطلبات السابقة</div>
          {requests.slice().sort((a, b) => String(b.date || "").localeCompare(String(a.date || ""))).map(r => (
            <div
              key={r.id}
              data-rec={String(r.id)}
              style={{ background: C.card, border: `1px solid ${C.gold}33`, borderRadius: 12, padding: 11, marginBottom: 8 }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <div style={{ color: C.gold, fontWeight: 800, fontSize: 12 }}>🧪 Investigation Order</div>
                <span style={{ color: C.muted, fontSize: 10 }}>{r.date}{" · "}{r.time || ""}</span>
              </div>
              <div style={{ color: C.text, fontSize: 11, lineHeight: 1.8, marginTop: 6 }}>
                {(r.requestedTests || []).map(t => (
                  <span
                    key={t.id}
                    style={{
                      display: "inline-block",
                      background: C.bg,
                      border: `1px solid ${C.border}`,
                      borderRadius: 7,
                      padding: "3px 7px",
                      margin: "2px 3px"
                    }}
                  >
                    {t.name}
                    {" · "}
                    {t.eye || "OU"}
                  </span>
                ))}
              </div>
              {r.notes && (<div style={{ color: C.muted, fontSize: 10, marginTop: 5 }}>{"📝 "}{r.notes}</div>)}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
                {r.coreSyncError ? (
                  <span style={{ color: C.gold, fontSize: 10 }}>
                    {"⚠ محفوظ هنا فقط — لم يُزامن مع السجل المركزي "}
                    <button type="button" onClick={() => resyncRequest(r)} style={{ background: C.gold + "22", border: "none", borderRadius: 6, color: C.gold, fontSize: 10, padding: "2px 7px", cursor: "pointer" }}>إعادة المزامنة</button>
                  </span>
                ) : (
                  <span style={{ color: C.teal, fontSize: 10 }}>
                    {r._sources && r._sources.includes("core") ? "✓ مسجل في السجل المركزي" : "✓ محفوظ في الملف"}
                  </span>
                )}
                <button
                  onClick={() => printDoc(getRadiologyHTML(Object.fromEntries((r.requestedTests || []).map(t => [t.id, t.eye || "OU"])), curPatient, r.notes, primaryDoctor, allRequestTests, clinic))}
                  style={{
                    background: C.accent + "22",
                    border: "none",
                    borderRadius: 7,
                    padding: "5px 9px",
                    color: C.accent,
                    fontSize: 10,
                    fontWeight: 700
                  }}
                >
                  🖨️ إعادة طباعة
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {requests.length === 0 && (
        <div style={{ color: C.muted, textAlign: "center", padding: 20, fontSize: 11 }}>
          No previous Investigation Orders for this patient
        </div>
      )}
      {imagingOrders.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ color: C.muted, fontSize: 11, fontWeight: 700, marginBottom: 8 }}>حالة تنفيذ الطلبات</div>
          {imagingOrders.slice().sort((a, b) => String(b.date + b.time).localeCompare(String(a.date + a.time))).map(o => (
            <div
              key={o.id}
              style={{
                background: C.card,
                border: `1px solid ${o.status === "reported" ? C.success : C.border}`,
                borderRadius: 12,
                padding: 11,
                marginBottom: 8
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <div style={{ color: C.text, fontWeight: 800, fontSize: 11 }}>{"🩻 "}{o.id}</div>
                <Tag
                  label={IMAGING_ORDER_STATUSES[o.status] || o.status}
                  color={o.status === "reported" ? C.success : o.status === "completed" ? C.teal : o.status === "cancelled" ? C.danger : C.gold}
                />
              </div>
              <div style={{ color: C.text, fontSize: 10, lineHeight: 1.7, marginTop: 5 }}>
                {(o.tests || []).map(t => (
                  <span
                    key={t.id}
                    style={{
                      display: "inline-block",
                      margin: "2px 3px",
                      background: C.bg,
                      border: `1px solid ${C.border}`,
                      borderRadius: 6,
                      padding: "2px 6px"
                    }}
                  >
                    {t.name}
                    {" · "}
                    {t.eye || "OU"}
                  </span>
                ))}
              </div>
              <div style={{ color: C.muted, fontSize: 9, marginTop: 4 }}>{o.date}{" · "}{o.doctor || ""}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
