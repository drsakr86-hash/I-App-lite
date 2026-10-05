import { t, getLang } from "../i18n/index.js";

// Pure view-model helpers for the patient file screen (no DOM / React / Supabase).
// Each function reproduces an expression that used to live inline in the
// legacy PatientFile JSX, so results must stay identical to that code.

// Newest exam by date + time (clinical summary and latest-exam cards).
export function latestExamByDateTime(exams) {
  return [...exams].sort((a, b) => (String(b.date || "") + String(b.time || "")).localeCompare(String(a.date || "") + String(a.time || "")))[0];
}

// Age for display: "58 سنة", or "—" when blank / null / NaN (0 is a valid age).
export function ageLabel(age) {
  return age || age === 0 ? t("g1.age.years", { n: age }) : "—";
}

// Comparison tab: exams with at least one VA/IOP value, oldest first.
export function compareRows(exams) {
  return [...exams].filter(e => e.visualAcuityR || e.visualAcuityL || e.iopR || e.iopL).sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));
}

// Timeline events built from the merged legacy/core arrays.
// `colors` is the theme object (C): teal, gold, accent, purple are used.
export function buildTimelineEvents({ visits = [], requests = [], exams = [], rxList = [], images = [] }, colors) {
  const C = colors || {};
  return [...visits.map(v => ({
    date: v.date || "",
    time: v.time || "",
    type: "زيارة",
    title: v.type || t("g1.tl.clinicVisit"),
    detail: v.result || v.complaint || v.notes || "",
    doctor: v.doctor || "",
    icon: "🩺",
    color: C.teal
  })), ...requests.map(e => ({
    date: e.date || "",
    time: e.time || "",
    type: "طلب أشعة",
    title: t("g1.tl.testRequest"),
    detail: t("g1.tl.requested") + ": " + (e.requestedTests || []).map(x => x.name + " (" + (x.eye || "OU") + ")").join(getLang() === "en" ? ", " : "، ") + (e.notes ? " · " + e.notes : ""),
    doctor: e.doctor || "",
    icon: "🩻",
    color: C.gold
  })), ...exams.map(e => ({
    date: e.date || "",
    time: e.time || "",
    type: "فحص",
    title: e.testType || e.type || t("g1.tl.eyeExam"),
    detail: e.diagnosis || e.chiefComplaint || e.notes || "",
    doctor: e.doctor || "",
    icon: "🔍",
    color: C.accent
  })), ...rxList.map(r => ({
    date: r.date || "",
    time: r.time || "",
    type: "وصفة",
    title: t("g1.tl.prescription"),
    detail: r.notes || r.medications || r.drugs || "",
    doctor: r.doctor || "",
    icon: "💊",
    color: C.gold
  })), ...images.map(img => ({
    date: img.date || "",
    time: img.time || "",
    type: "صورة",
    title: img.type || t("g1.tl.medicalImage"),
    detail: `${img.eye && img.eye !== "OU" ? img.eye + " · " : ""}${img.name || ""}${img.notes ? " · " + img.notes : ""}`,
    doctor: "",
    icon: "🖼️",
    color: C.purple
  }))];
}

// Core 360 journey wins when it has events; otherwise the built timeline.
export function timelineSourceEvents({ coreSource, coreJourneyEvents = [], ...arrays }, colors) {
  return coreSource === "360" && coreJourneyEvents.length ? coreJourneyEvents : buildTimelineEvents(arrays, colors);
}

// Type filter ("All" = everything) + free-text search, newest first (date, then time).
export function filterTimeline(events, filter, search) {
  return events.filter(e => (filter === "All" || e.type === filter) && (!search || (String(e.title) + " " + String(e.detail) + " " + String(e.doctor)).toLowerCase().includes(search.toLowerCase()))).sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.time).localeCompare(String(a.time)));
}
