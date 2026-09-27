import React from 'react';
import { compareRows } from '../../modules/patient-file/model.js';

const L = () => globalThis.IAppLegacy;

// Patient file — "compare" tab. Presentational port of the legacy PatientFile JSX;
// all state and handlers come from the legacy function through ctx.
export default function CompareTab({ ctx }) {
  const { C } = L();
  const { exams } = ctx;
  return (
    <div>
      <div style={{ color: C.text, fontWeight: 800, fontSize: 14, marginBottom: 10 }}>
        📊 مقارنة القياسات بين الزيارات
      </div>
      {(() => {
        const rows = compareRows(exams);
        if (!rows.length) return (<div style={{ color: C.muted, textAlign: "center", padding: 40 }}>لا توجد قياسات كافية للمقارنة</div>);
        return (
          <div style={{ overflowX: "auto", background: C.card, border: `1px solid ${C.border}`, borderRadius: 14 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
              <thead>
                <tr>
                  {["التاريخ", "VA OD", "VA OS", "IOP OD", "IOP OS", "التشخيص"].map(h => (
                    <th
                      key={h}
                      style={{ padding: 9, color: C.accent, borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap" }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((e, i) => (
                  <tr key={e.id || i}>
                    {[e.date || "—", e.visualAcuityR || "—", e.visualAcuityL || "—", e.iopR || "—", e.iopL || "—", e.diagnosis || "—"].map((v, j) => (
                      <td
                        key={j}
                        style={{
                          padding: 8,
                          color: j === 5 ? C.gold : C.text,
                          borderBottom: `1px solid ${C.border}33`,
                          whiteSpace: "nowrap"
                        }}
                      >
                        {v}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })()}
    </div>
  );
}
