import React from 'react';
import { C } from '../../modules/theme/index.js';
import { inp } from '../../modules/ui/atoms.jsx';
import { t, useLang } from '../../modules/i18n/index.js';
import { tv } from '../../modules/i18n/tv.js';

// Stored event types stay Arabic (they are the filter values); only the label is translated.
const TYPES = ['زيارة', 'فحص', 'تشخيص', 'علاج', 'طلب أشعة', 'وصفة', 'صورة', 'متابعة'];
const TYPE_KEY = { 'زيارة': 'g1.evt.visit', 'فحص': 'g1.evt.exam', 'تشخيص': 'g1.evt.diagnosis', 'علاج': 'g1.evt.treatment', 'طلب أشعة': 'g1.evt.imagingRequest', 'وصفة': 'g1.evt.rx', 'صورة': 'g1.evt.image', 'متابعة': 'g1.evt.followUp' };

// Patient file — "timeline" tab. Events come pre-built, de-duplicated and
// ordered from the data layer (normalize.js buildPatientTimeline); each event
// knows its source tab/record so it can be opened with one tap.
export default function TimelineTab({ ctx }) {
  const { coreJourneyCount, coreSource, coreStatus, timelineEvents, filteredTimeline, openSource, setTimelineFilter, setTimelineSearch, timelineFilter, timelineSearch } = ctx;
  const lang = useLang();
  const typeLabel = x => (TYPE_KEY[x] ? t(TYPE_KEY[x], lang) : x);
  const loading = coreStatus && coreStatus.state === 'loading';
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ color: C.text, fontWeight: 800, fontSize: 14 }}>{t("g1.tl.title", lang)} ({filteredTimeline.length}{filteredTimeline.length !== timelineEvents.length ? ` ${t("g1.tl.ofN", lang, { n: timelineEvents.length })}` : ""})</div>
      {coreSource === "360" ? (<span style={{ fontSize: 11, opacity: .65 }}>{"Core 360: " + coreJourneyCount}</span>) : coreSource === "summary" ? (<span style={{ fontSize: 11, opacity: .65 }}>Core Summary</span>) : null}
      <div style={{ display: "flex", gap: 7 }}>
        <input
          style={{ ...inp(), flex: 1 }}
          aria-label={t("g1.tl.searchAria", lang)}
          value={timelineSearch}
          onChange={e => setTimelineSearch(e.target.value)}
          placeholder={"🔎 " + t("g1.tl.searchPh", lang)}
        />
        <select style={{ ...inp(), width: 105 }} aria-label={t("g1.tl.typeAria", lang)} value={timelineFilter} onChange={e => setTimelineFilter(e.target.value)}>
          <option value="All">{t("g1.common.all", lang)}</option>
          {TYPES.map(ty => (<option key={ty} value={ty}>{typeLabel(ty)}</option>))}
        </select>
      </div>
      {loading && (<div role="status" style={{ color: C.muted, fontSize: 11 }}>⏳ {t("g1.tl.loadingRest", lang)}</div>)}
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
                <span style={{ color: e.color, fontWeight: 800, fontSize: 12 }}>{tv(e.title)}</span>
                <span style={{ color: C.muted, fontSize: 10 }}>{e.date || t("g1.cs.noDate", lang)}{e.time ? " · " + e.time : ""}</span>
              </div>
              <div style={{ color: C.muted, fontSize: 10, marginTop: 3 }}>{typeLabel(e.type)}{e.doctor ? " · " + tv(e.doctor) : ""}</div>
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
                {t("g1.tl.openRecord", lang)}
              </button>
            </div>
          </li>
        ))}
      </ol>
      {timelineEvents.length === 0 && !loading && (<div style={{ color: C.muted, textAlign: "center", padding: 35 }}>{t("g1.tl.none", lang)}</div>)}
      {timelineEvents.length > 0 && filteredTimeline.length === 0 && (<div style={{ color: C.muted, textAlign: "center", padding: 25, fontSize: 12 }}>{t("g1.tl.noMatch", lang)}</div>)}
    </div>
  );
}
