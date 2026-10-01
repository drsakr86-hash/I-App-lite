import React from 'react';
import { C } from '../../modules/theme/index.js';
import { inp } from '../../modules/ui/atoms.jsx';

const TYPES = ['زيارة', 'فحص', 'تشخيص', 'علاج', 'طلب أشعة', 'وصفة', 'صورة', 'متابعة'];

// Patient file — "timeline" tab. Events come pre-built, de-duplicated and
// ordered from the data layer (normalize.js buildPatientTimeline); each event
// knows its source tab/record so it can be opened with one tap.
export default function TimelineTab({ ctx }) {
  const { coreJourneyCount, coreSource, coreStatus, timelineEvents, filteredTimeline, openSource, setTimelineFilter, setTimelineSearch, timelineFilter, timelineSearch } = ctx;
  const loading = coreStatus && coreStatus.state === 'loading';
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ color: C.text, fontWeight: 800, fontSize: 14 }}>السجل الطبي الزمني ({filteredTimeline.length}{filteredTimeline.length !== timelineEvents.length ? ` من ${timelineEvents.length}` : ""})</div>
      {coreSource === "360" ? (<span style={{ fontSize: 11, opacity: .65 }}>{"Core 360: " + coreJourneyCount}</span>) : coreSource === "summary" ? (<span style={{ fontSize: 11, opacity: .65 }}>Core Summary</span>) : null}
      <div style={{ display: "flex", gap: 7 }}>
        <input
          style={{ ...inp(), flex: 1 }}
          aria-label="بحث في السجل الزمني"
          value={timelineSearch}
          onChange={e => setTimelineSearch(e.target.value)}
          placeholder="🔎 بحث في السجل..."
        />
        <select style={{ ...inp(), width: 105 }} aria-label="نوع الحدث" value={timelineFilter} onChange={e => setTimelineFilter(e.target.value)}>
          <option value="All">الكل</option>
          {TYPES.map(t => (<option key={t} value={t}>{t}</option>))}
        </select>
      </div>
      {loading && (<div role="status" style={{ color: C.muted, fontSize: 11 }}>⏳ جاري تحميل بقية السجل من السيرفر…</div>)}
      <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
        {filteredTimeline.map(e => (
          <li key={e.key} style={{ display: "flex", gap: 10, alignItems: "stretch" }}>
            <div
              aria-hidden="true"
              style={{
                width: 34, minWidth: 34, height: 34, borderRadius: 10,
                background: e.color + "22", border: `1px solid ${e.color}44`,
                display: "flex", alignItems: "center", justifyContent: "center"
              }}
            >
              {e.icon}
            </div>
            <div style={{ flex: 1, background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "9px 11px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <span style={{ color: e.color, fontWeight: 800, fontSize: 12 }}>{e.title}</span>
                <span style={{ color: C.muted, fontSize: 10 }}>{e.date || "بدون تاريخ"}{e.time ? " · " + e.time : ""}</span>
              </div>
              <div style={{ color: C.muted, fontSize: 10, marginTop: 3 }}>{e.type}{e.doctor ? " · " + e.doctor : ""}</div>
              {e.detail && (
                <div style={{ color: C.text, fontSize: 11, lineHeight: 1.7, marginTop: 5, whiteSpace: "pre-wrap" }}>
                  {String(e.detail).slice(0, 500)}
                </div>
              )}
              <button
                type="button"
                onClick={() => openSource(e)}
                style={{ marginTop: 6, background: C.accent + "18", border: "none", borderRadius: 7, color: C.accent, fontSize: 10, fontWeight: 700, padding: "3px 9px", cursor: "pointer" }}
              >
                فتح السجل ←
              </button>
            </div>
          </li>
        ))}
      </ol>
      {timelineEvents.length === 0 && !loading && (<div style={{ color: C.muted, textAlign: "center", padding: 35 }}>لا توجد أحداث مسجلة بعد</div>)}
      {timelineEvents.length > 0 && filteredTimeline.length === 0 && (<div style={{ color: C.muted, textAlign: "center", padding: 25, fontSize: 12 }}>لا توجد نتائج مطابقة للبحث</div>)}
    </div>
  );
}
