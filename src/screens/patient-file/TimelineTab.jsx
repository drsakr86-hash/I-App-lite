import React from 'react';
import { timelineSourceEvents, filterTimeline } from '../../modules/patient-file/model.js';

const L = () => globalThis.IAppLegacy;

// Patient file — "timeline" tab. Presentational port of the legacy PatientFile JSX;
// all state and handlers come from the legacy function through ctx.
export default function TimelineTab({ ctx }) {
  const { C, inp } = L();
  const { coreJourneyCount, coreJourneyEvents, coreSource, exams, images, requests, rxList, setTimelineFilter, setTimelineSearch, timelineFilter, timelineSearch, visits } = ctx;
  const allEvents = timelineSourceEvents({ coreSource, coreJourneyEvents, visits, requests, exams, rxList, images }, C);
  const events = filterTimeline(allEvents, timelineFilter, timelineSearch);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ color: C.text, fontWeight: 800, fontSize: 14 }}>السجل الطبي الزمني</div>
      {coreSource === "360" ? (<span style={{ fontSize: 11, opacity: .65, marginInlineStart: 6 }}>{"Core 360: " + coreJourneyCount}</span>) : coreSource === "summary" ? (<span style={{ fontSize: 11, opacity: .65, marginInlineStart: 6 }}>Core Summary</span>) : null}
      <div style={{ display: "flex", gap: 7 }}>
        <input
          style={{ ...inp(), flex: 1 }}
          value={timelineSearch}
          onChange={e => setTimelineSearch(e.target.value)}
          placeholder="🔎 Search Timeline..."
        />
        <select style={{ ...inp(), width: 105 }} value={timelineFilter} onChange={e => setTimelineFilter(e.target.value)}>
          <option value="All">الكل</option>
          <option value="زيارة">زيارة</option>
          <option value="فحص">فحص</option>
          <option value="تشخيص">تشخيص</option>
          <option value="علاج">علاج</option>
          <option value="طلب أشعة">طلب أشعة</option>
          <option value="وصفة">وصفة</option>
          <option value="صورة">صورة</option>
          <option value="متابعة">متابعة</option>
        </select>
      </div>
      {events.map((e, i) => (
        <div key={i} style={{ display: "flex", gap: 10, alignItems: "stretch" }}>
          <div
            style={{
              width: 34,
              minWidth: 34,
              height: 34,
              borderRadius: 10,
              background: e.color + "22",
              border: `1px solid ${e.color}44`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center"
            }}
          >
            {e.icon}
          </div>
          <div
            style={{ flex: 1, background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "9px 11px" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <span style={{ color: e.color, fontWeight: 800, fontSize: 12 }}>{e.title}</span>
              <span style={{ color: C.muted, fontSize: 10 }}>{e.date}</span>
            </div>
            {e.doctor && (<div style={{ color: C.muted, fontSize: 10, marginTop: 3 }}>{e.type}{" · "}{e.doctor}</div>)}
            {e.detail && (
              <div style={{ color: C.text, fontSize: 11, lineHeight: 1.7, marginTop: 5, whiteSpace: "pre-wrap" }}>
                {String(e.detail).slice(0, 500)}
              </div>
            )}
          </div>
        </div>
      ))}
      {allEvents.length === 0 && (<div style={{ color: C.muted, textAlign: "center", padding: 35 }}>لا توجد أحداث مسجلة بعد</div>)}
    </div>
  );
}
