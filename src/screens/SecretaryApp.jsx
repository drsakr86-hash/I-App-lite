import React, { useState, useEffect } from "react";
import {
  REQUEST_DOCTOR, STATS_VISIT_TYPES, mutateErrorMessage,
  addAptMutation, editAptMutation, acceptAptMutation, mergeApt, markRemindedIn, withoutAptId,
  buildAcceptedAppointment, requestAuditDetail, collectionVisitId, buildCollectionVisitRecord, upsertVisit,
  collectAudit, collectToast, deleteAuditDetail,
  countPendingFromPatient, countWaitingToday, countToday, countConfirmed, filterSecretaryApts,
  todayDoctorNames, collectedToday, unpaidTodayCount, clinicStats, typeStats, requestsTabLabel, waCardHref
} from "../modules/secretary-app/model.js";
import { Modal, Toast, ThemeToggle } from "../components/common.jsx";
import { LoginScreen, SecretaryAptForm, CollectModal } from "../components/forms/index.js";
import { RemindersModal } from "../components/modals/index.js";
import { C } from "../modules/theme/index.js";
import { inp } from "../modules/ui/atoms.jsx";
import { localISO, clinicLabel, BOOKING_TABLE, CLINICS_LIST } from "../modules/constants/index.js";
import { useSyncStatus } from "../modules/sync/engine.js";
import { sbGet, sbMutate } from "../modules/sync/wiring.js";
import { getSB } from "../modules/data-access/index.js";
import { trashPut, logAudit } from "../modules/sync/index.js";
import { newId } from "../modules/constants/misc.js";
import { waOpen, waReminderText } from "../modules/notifications/index.js";
import WaitingRoom from "./WaitingRoom.jsx";

// The secretary app's own small filter button (the legacy component shadows the
// shared Btn with this one inside SecretaryApp).
function SecBtn({ children, onClick, color, active }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? `linear-gradient(135deg,${color || C.accent},${C.teal})` : color ? color + "22" : "transparent",
        border: "1px solid " + (active ? "transparent" : color || C.border),
        borderRadius: 8,
        padding: "6px 12px",
        color: active ? C.bg : color || C.muted,
        fontSize: 11,
        fontWeight: 600,
        cursor: "pointer",
        fontFamily: "inherit",
        whiteSpace: "nowrap"
      }}
    >{children}</button>
  );
}

const badge = (bg, color) => ({ background: bg, color, borderRadius: 6, padding: "1px 6px", fontSize: 9, fontWeight: 700 });

export default function SecretaryApp() {
  const [session, setSession] = useState(() => {
    try {
      const p = localStorage.getItem("iapp_session");
      if (p) return JSON.parse(p);
    } catch {}
    try {
      return JSON.parse(sessionStorage.getItem("iapp_session"));
    } catch {
      return null;
    }
  });
  const [tab, setTab] = useState("apts");
  const [showReminders, setShowReminders] = useState(false);
  const [requests, setRequests] = useState([]);
  const [reqBusy, setReqBusy] = useState(null);
  const [apts, setAptsState] = useState([]);
  const [patients, setPatients] = useState([]);
  const [prices, setPrices] = useState([]);
  const [modal, setModal] = useState(null);
  const [collectApt, setCollectApt] = useState(null);
  const [filterDate, setFilterDate] = useState(localISO());
  const [filterClinic, setFilterClinic] = useState("");
  const [search, setSearch] = useState("");
  const [filterFromPatient, setFilterFromPatient] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const today = localISO();
  const secSt = useSyncStatus();
  const loadRequests = async () => {
    try {
      const sb = getSB();
      if (!sb) return;
      const {
        data,
        error
      } = await sb.from(BOOKING_TABLE).select("*").eq("status", "pending").order("created_at", {
        ascending: true
      });
      if (!error && Array.isArray(data)) setRequests(data);
    } catch (e) {}
  };
  const loadData = async () => {
    const [a, p, pr] = await Promise.all([sbGet("iapp_appointments"), sbGet("iapp_patients"), sbGet("iapp_prices")]);
    const ld = k => {
      try {
        return JSON.parse(localStorage.getItem(k));
      } catch {
        return null;
      }
    };
    const A = a || ld("iapp_appointments"),
      P = p || ld("iapp_patients"),
      PR = pr || ld("iapp_prices");
    if (Array.isArray(A)) setAptsState(A);
    if (Array.isArray(P)) setPatients(P);
    if (Array.isArray(PR)) setPrices(PR);
    setLoading(false);
    loadRequests();
  };
  const acceptRequest = async r => {
    setReqBusy(r.id);
    const apt = buildAcceptedAppointment(r, newId(), REQUEST_DOCTOR);
    const ok = await mutateApts(list => acceptAptMutation(list, apt), list => list.some(a => a.id === apt.id), "تم تأكيد الطلب");
    if (ok) {
      try {
        await getSB().from(BOOKING_TABLE).update({
          status: "accepted"
        }).eq("id", r.id);
      } catch (e) {}
      setRequests(list => list.filter(x => x.id !== r.id));
      logAudit("قبول طلب حجز", requestAuditDetail(r));
    }
    setReqBusy(null);
  };
  const rejectRequest = async r => {
    if (!window.confirm("رفض طلب " + r.patient_name + "؟")) return;
    setReqBusy(r.id);
    try {
      await getSB().from(BOOKING_TABLE).update({
        status: "rejected"
      }).eq("id", r.id);
      setRequests(list => list.filter(x => x.id !== r.id));
      logAudit("رفض طلب حجز", requestAuditDetail(r));
    } catch (e) {}
    setReqBusy(null);
  };
  // Realtime channel AND 5 s polling — both deliberate (the channel can drop
  // silently on mobile networks); keep them exactly as in the legacy runtime.
  useEffect(() => {
    if (!session) return;
    loadData();
    let channel = null;
    try {
      channel = getSB().channel("iapp_store_changes").on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "iapp_store"
      }, payload => {
        const key = payload.new && payload.new.key || payload.old && payload.old.key;
        if (!key || key === "iapp_appointments" || key === "iapp_patients" || key === "iapp_prices" || key === "iapp_visits") loadData();
      }).subscribe();
    } catch (e) {
      channel = null;
    }
    const iv = setInterval(loadData, 5000);
    return () => {
      clearInterval(iv);
      if (channel) {
        try {
          getSB().removeChannel(channel);
        } catch {}
      }
    };
  }, [session]);
  const mutateApts = async (fn, verify, okMsg) => {
    setSyncing(true);
    const res = await sbMutate("iapp_appointments", fn, verify);
    setSyncing(false);
    if (res.ok) {
      setAptsState(res.data);
      setToast(okMsg || "تم الحفظ");
    } else alert(mutateErrorMessage(res.error));
    return res.ok;
  };
  const markReminded = a => mutateApts(list => markRemindedIn(list, a.id, localISO()), null, "تم تسجيل التذكير");
  const addApt = f => mutateApts(list => addAptMutation(list, f), list => list.some(a => a.id === f.id));
  const editApt = f => mutateApts(list => editAptMutation(list, f));
  const deleteApt = async id => {
    const rec = apts.find(x => x.id === id);
    await trashPut("iapp_appointments", rec, "موعد");
    logAudit("حذف موعد", deleteAuditDetail(rec, id));
    return mutateApts(list => withoutAptId(list, id), list => !list.some(x => x.id === id), "تم الحذف");
  };
  const updateApt = apt => mutateApts(list => mergeApt(list, apt));
  const pushVisitRecord = async (apt, cost, paid) => {
    const vid = collectionVisitId(apt);
    const rec = buildCollectionVisitRecord(apt, cost, paid, clinicLabel);
    await sbMutate("iapp_visits", visits => upsertVisit(visits, rec), list => list.some(v => v.id === vid));
  };
  const handleSaveCollect = async (cost, paid) => {
    const apt = collectApt;
    await updateApt({
      ...apt,
      cost,
      paid
    });
    await pushVisitRecord(apt, cost, paid);
    setCollectApt(null);
    const [auditAction, auditDetail] = collectAudit(apt, cost, paid);
    logAudit(auditAction, auditDetail);
    setToast(collectToast(cost, paid));
  };
  const pendingFromPatient = countPendingFromPatient(apts);
  const waitingCount = countWaitingToday(apts, today);
  const filtered = filterSecretaryApts(apts, { filterDate, search, filterFromPatient, filterClinic });
  const handleLogin = (u, remember) => {
    const s = {
      id: u.id,
      username: u.username,
      name: u.name,
      role: u.role
    };
    if (remember) {
      try {
        localStorage.setItem("iapp_session", JSON.stringify(s));
      } catch {}
    } else {
      try {
        sessionStorage.setItem("iapp_session", JSON.stringify(s));
      } catch {}
    }
    setSession(s);
  };
  const handleLogout = () => {
    try {
      localStorage.removeItem("iapp_session");
    } catch {}
    try {
      sessionStorage.removeItem("iapp_session");
    } catch {}
    setSession(null);
    try {
      if (window.__iappUnifiedLogout) window.__iappUnifiedLogout();
    } catch {}
  };
  if (!session) return <LoginScreen onLogin={handleLogin} />;

  const clinicActive = c => !filterClinic && c === "الكل" || filterClinic === c;

  return (
    <div style={{ height: "100%", background: C.bg, direction: "rtl", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{ background: `linear-gradient(135deg,${C.surface},${C.surface2})`, borderBottom: "1px solid " + C.border, padding: "0 16px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 60, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: `linear-gradient(135deg,${C.accent},${C.teal})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>👁</div>
          <div>
            <div style={{ color: C.text, fontWeight: 700, fontSize: 14 }}>
              {"I App "}<span style={{ color: C.muted, fontWeight: 400, fontSize: 11 }}>· السكرتارية</span>
            </div>
            <div style={{ color: C.muted, fontSize: 9, display: "flex", alignItems: "center", gap: 3 }}>
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: syncing ? C.gold : C.success, display: "inline-block" }} />
              {syncing || secSt.busy ? syncing && !secSt.offline ? "جاري المزامنة..." : secSt.label : session.name}
            </div>
          </div>
          {pendingFromPatient > 0 && <span style={{ background: C.gold, color: C.bg, borderRadius: "50%", width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800 }}>{pendingFromPatient}</span>}
          {waitingCount > 0 && <span style={{ background: C.accent + "22", color: C.accent, borderRadius: 8, padding: "2px 8px", fontSize: 10, fontWeight: 700 }}>{"⏳"}{waitingCount}</span>}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={() => setModal("add")} style={{ background: `linear-gradient(135deg,${C.accent},${C.teal})`, border: "none", borderRadius: 10, padding: "8px 12px", color: C.bg, fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>+ جديد</button>
          <ThemeToggle />
          <button onClick={loadData} style={{ background: "transparent", border: "1px solid " + C.border, borderRadius: 10, padding: "8px 10px", color: C.muted, fontSize: 14, cursor: "pointer" }}>🔄</button>
          <button onClick={handleLogout} title="تسجيل الخروج" style={{ background: "transparent", border: "1px solid " + C.border, borderRadius: 10, padding: "8px 10px", color: C.danger, fontSize: 14, cursor: "pointer" }}>⏻</button>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ background: C.surface, borderBottom: "1px solid " + C.border, display: "flex", flexShrink: 0 }}>
        {[
          { id: "apts", icon: "📋", label: "المواعيد" },
          { id: "requests", icon: "📨", label: requestsTabLabel(requests.length) },
          { id: "waiting", icon: "⏳", label: "الانتظار" },
          { id: "stats", icon: "📊", label: "إحصائيات" }
        ].map(t => (
          <div key={t.id} onClick={() => setTab(t.id)} style={{ flex: 1, textAlign: "center", padding: "9px 4px", cursor: "pointer", borderBottom: tab === t.id ? "2px solid " + C.accent : "2px solid transparent", color: tab === t.id ? C.accent : C.muted, fontSize: 10, fontWeight: tab === t.id ? 700 : 400, transition: "all 0.2s" }}>
            <div style={{ fontSize: 15 }}>{t.icon}</div>
            {t.label}
          </div>
        ))}
      </div>

      {tab === "apts" && (
        <>
          <div style={{ padding: "8px 16px 0", background: C.surface, flexShrink: 0 }}>
            <button onClick={() => setShowReminders(true)} style={{ width: "100%", background: "#25D36618", border: "1px solid #25D36655", borderRadius: 10, padding: "8px 10px", color: "#25D366", fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>📲 تذكير مواعيد الغد على واتساب</button>
          </div>
          <div style={{ padding: "8px 16px", background: C.surface, borderBottom: "1px solid " + C.border, flexShrink: 0, display: "flex", gap: 6, overflowX: "auto" }}>
            <SecBtn active={filterDate === today && !filterFromPatient && !filterClinic} onClick={() => { setFilterDate(today); setFilterFromPatient(false); setFilterClinic(""); }}>📅 اليوم</SecBtn>
            <SecBtn active={!filterDate && !filterFromPatient && !filterClinic} onClick={() => { setFilterDate(""); setFilterFromPatient(false); setFilterClinic(""); }}>📋 الكل</SecBtn>
            <SecBtn active={filterFromPatient} color={C.gold} onClick={() => { setFilterFromPatient(f => !f); setFilterDate(""); }}>{"⭐ طلبات"}{pendingFromPatient > 0 ? " (" + pendingFromPatient + ")" : ""}</SecBtn>
            <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)} style={{ ...inp(), fontSize: 11, padding: "6px 10px", minWidth: 130, flex: "0 0 auto" }} />
          </div>
          <div style={{ padding: "6px 16px", background: C.surface, borderBottom: "1px solid " + C.border, flexShrink: 0, display: "flex", gap: 6, overflowX: "auto" }}>
            {["الكل", ...CLINICS_LIST].map(c => (
              <button
                key={c}
                onClick={() => setFilterClinic(c === "الكل" ? "" : c)}
                style={{
                  background: clinicActive(c) ? C.teal + "33" : "transparent",
                  // Legacy quirk kept on purpose: the string concatenation is always
                  // truthy, so the border is always C.teal.
                  border: "1px solid " + clinicActive(c) ? C.teal : C.border,
                  borderRadius: 8,
                  padding: "5px 10px",
                  color: clinicActive(c) ? C.teal : C.muted,
                  fontSize: 10,
                  fontWeight: 600,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  whiteSpace: "nowrap"
                }}
              >{c === "الكل" ? "🏥 الكل" : "📍 " + clinicLabel(c)}</button>
            ))}
          </div>
          <div style={{ padding: "6px 16px", background: C.surface, borderBottom: "1px solid " + C.border, flexShrink: 0 }}>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 بحث بالاسم..." style={{ ...inp(), fontSize: 12, padding: "8px 12px" }} />
          </div>
          <div style={{ padding: "8px 16px", display: "flex", gap: 8, flexShrink: 0 }}>
            {[
              { l: "اليوم", v: countToday(apts, today), c: C.accent },
              { l: "معروض", v: filtered.length, c: C.teal },
              { l: "مؤكد", v: countConfirmed(filtered), c: C.success },
              { l: "طلبات", v: pendingFromPatient, c: C.gold }
            ].map((s, i) => (
              <div key={i} style={{ flex: 1, background: C.card, borderRadius: 10, padding: "8px 4px", textAlign: "center", border: "1px solid " + C.border }}>
                <div style={{ color: s.c, fontSize: 17, fontWeight: 800 }}>{s.v}</div>
                <div style={{ color: C.muted, fontSize: 9 }}>{s.l}</div>
              </div>
            ))}
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: "0 16px 20px" }}>
            {loading && <div style={{ color: C.muted, textAlign: "center", padding: 40 }}>⏳ جاري التحميل...</div>}
            {!loading && filtered.length === 0 && <div style={{ color: C.muted, textAlign: "center", padding: 40, fontSize: 13 }}>لا توجد مواعيد</div>}
            {filtered.map(a => (
              <div key={a.id} style={{ background: C.card, border: "1px solid " + (a.fromPatient ? C.gold : a.confirmed ? C.success : C.border), borderRadius: 14, padding: "12px 14px", marginBottom: 10, borderRight: "4px solid " + (a.confirmed ? C.success : a.fromPatient ? C.gold : C.accent), animation: "slideUp 0.2s ease" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap", marginBottom: 3 }}>
                      <span style={{ color: C.text, fontWeight: 700, fontSize: 14 }}>{a.patient}</span>
                      {a.fromPatient && <span style={badge(C.gold + "22", C.gold)}>⭐ طلب</span>}
                      {a.waitStatus === "waiting" && <span style={badge(C.gold + "22", C.gold)}>⏳ ينتظر</span>}
                      {a.waitStatus === "in" && <span style={badge(C.accent + "22", C.accent)}>🩺 في العيادة</span>}
                      {a.waitStatus === "done" && <span style={badge(C.success + "22", C.success)}>✓ انتهى</span>}
                      {a.waitStatus === "postponed" && <span style={badge(C.purple + "22", C.purple)}>⏸ مؤجل</span>}
                    </div>
                    <div style={{ color: C.muted, fontSize: 11 }}>{a.type}{" · "}{a.doctor}</div>
                    <div style={{ display: "flex", gap: 10, marginTop: 2, flexWrap: "wrap" }}>
                      {a.phone && <a href={"tel:" + a.phone} style={{ color: C.accent, fontSize: 11, textDecoration: "none" }}>{"📞 "}{a.phone}</a>}
                      {a.phone && <span onClick={() => { waOpen(a.phone, waReminderText(a)); markReminded(a); }} style={{ color: "#25D366", fontSize: 11, cursor: "pointer", fontWeight: 700 }}>💬 تذكير</span>}
                      {a.clinic && <span style={{ color: C.teal, fontSize: 11 }}>{"📍 "}{clinicLabel(a.clinic)}</span>}
                      {a.date !== today && <span style={{ color: C.gold, fontSize: 10 }}>{"📅 "}{a.date}</span>}
                    </div>
                  </div>
                  <div style={{ background: C.accent + "22", borderRadius: 8, padding: "4px 10px", textAlign: "center", flexShrink: 0, marginRight: 8 }}>
                    <div style={{ color: C.accent, fontSize: 14, fontWeight: 800 }}>{a.time}</div>
                    <div onClick={() => setCollectApt(a)} style={{ color: a.cost ? a.paid ? C.success : C.danger : C.muted, fontSize: 9, cursor: "pointer", fontWeight: 700, marginTop: 2 }}>{a.cost ? a.paid ? "✓ " + a.cost + "ج" : "غير مدفوع" : "💰 تحصيل"}</div>
                  </div>
                </div>
                {a.notes && <div style={{ color: C.muted, fontSize: 11, marginBottom: 8 }}>{"📝 "}{a.notes}</div>}
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <div onClick={() => updateApt({ ...a, confirmed: !a.confirmed })} style={{ flex: "1 1 60px", background: a.confirmed ? C.success + "33" : "transparent", border: "1px solid " + (a.confirmed ? C.success : C.border), borderRadius: 8, padding: "7px 0", color: a.confirmed ? C.success : C.muted, fontSize: 11, fontWeight: 700, cursor: "pointer", textAlign: "center" }}>{a.confirmed ? "✓ مؤكد" : "تأكيد"}</div>
                  {a.date === today && !["waiting", "called", "in", "done"].includes(a.waitStatus) && <div onClick={() => updateApt({ ...a, waitStatus: "waiting", arrivedAt: Date.now() })} style={{ flex: "1 1 70px", background: C.gold + "22", border: "1px solid " + C.gold + "44", borderRadius: 8, padding: "7px 0", color: C.gold, fontSize: 11, fontWeight: 700, cursor: "pointer", textAlign: "center" }}>وصل ✓</div>}
                  {a.phone && <a href={waCardHref(a, clinicLabel)} target="_blank" style={{ background: "#25D36622", border: "1px solid #25D36633", borderRadius: 8, padding: "7px 12px", color: "#25D366", fontSize: 14, textDecoration: "none", display: "flex", alignItems: "center", justifyContent: "center" }}>💬</a>}
                  {a.phone && <a href={"tel:" + a.phone} style={{ background: C.teal + "22", border: "1px solid " + C.teal + "33", borderRadius: 8, padding: "7px 12px", color: C.teal, fontSize: 14, textDecoration: "none", display: "flex", alignItems: "center", justifyContent: "center" }}>📞</a>}
                  <div onClick={() => setModal({ edit: a })} style={{ background: C.accent + "22", border: "1px solid " + C.accent + "33", borderRadius: 8, padding: "7px 12px", color: C.accent, fontSize: 14, cursor: "pointer" }}>✏️</div>
                  {session.role === "admin" && <div onClick={() => { if (window.confirm("حذف موعد " + a.patient + "؟")) deleteApt(a.id); }} style={{ background: C.danger + "22", border: "1px solid " + C.danger + "33", borderRadius: 8, padding: "7px 12px", color: C.danger, fontSize: 14, cursor: "pointer" }}>🗑️</div>}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {showReminders && <RemindersModal apts={apts} onClose={() => setShowReminders(false)} onMark={markReminded} />}

      {tab === "requests" && (
        <div style={{ flex: 1, overflowY: "auto", padding: "14px 16px 90px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ color: C.text, fontWeight: 700, fontSize: 15 }}>📨 طلبات الحجز من المرضى</div>
            <span onClick={loadRequests} style={{ color: C.accent, fontSize: 11, cursor: "pointer", background: C.accent + "22", borderRadius: 8, padding: "4px 10px" }}>↻ تحديث</span>
          </div>
          {requests.length === 0 && <div style={{ color: C.muted, fontSize: 13, textAlign: "center", padding: "30px 0" }}>لا توجد طلبات جديدة</div>}
          {requests.map(r => (
            <div key={r.id} style={{ background: C.card, border: "1px solid " + C.gold + "55", borderRadius: 14, padding: "12px 14px", marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                <div style={{ color: C.text, fontWeight: 700, fontSize: 14 }}>{r.patient_name}</div>
                <div style={{ color: C.gold, fontSize: 12 }}>{r.date}{" · "}{r.time}</div>
              </div>
              <div style={{ color: C.muted, fontSize: 11, marginTop: 4 }}>{"📍 "}{clinicLabel(r.clinic)}{" · "}{r.visit_type || "فحص روتيني"}</div>
              {r.phone && <a href={"tel:" + r.phone} style={{ color: C.accent, fontSize: 12, textDecoration: "none", display: "inline-block", marginTop: 4, direction: "ltr" }}>{"📞 "}{r.phone}</a>}
              {r.note && <div style={{ color: C.text, fontSize: 11, marginTop: 6, background: C.bg, borderRadius: 8, padding: "6px 9px" }}>{"📝 "}{r.note}</div>}
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <button onClick={() => acceptRequest(r)} disabled={reqBusy === r.id} style={{ flex: 1, background: `linear-gradient(135deg,${C.success},${C.teal})`, border: "none", borderRadius: 9, padding: "8px 10px", color: C.bg, fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>{reqBusy === r.id ? "⏳" : "✓ تأكيد وإضافة للمواعيد"}</button>
                <button onClick={() => rejectRequest(r)} disabled={reqBusy === r.id} style={{ background: C.danger + "22", border: "1px solid " + C.danger + "44", borderRadius: 9, padding: "8px 12px", color: C.danger, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>✕ رفض</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "waiting" && (
        <div style={{ flex: 1, overflowY: "auto" }}>
          <WaitingRoom
            apts={apts}
            today={today}
            onUpdateApt={updateApt}
            onCollect={setCollectApt}
            doctorNames={todayDoctorNames(apts, today)}
            isAdmin={!!(session && session.role === "admin")}
          />
        </div>
      )}

      {tab === "stats" && (
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 16px 80px" }}>
          <div style={{ color: C.text, fontWeight: 700, fontSize: 16, marginBottom: 16 }}>📊 إحصائيات</div>
          <div style={{ background: `linear-gradient(135deg,${C.success}22,${C.card})`, border: "1px solid " + C.success + "44", borderRadius: 14, padding: 14, marginBottom: 16, textAlign: "center" }}>
            <div style={{ color: C.muted, fontSize: 11, marginBottom: 4 }}>💰 المحصّل اليوم</div>
            <div style={{ color: C.success, fontWeight: 800, fontSize: 24 }}>{collectedToday(apts, today).toLocaleString()}{" ج.م"}</div>
            <div style={{ color: C.muted, fontSize: 10, marginTop: 2 }}>{"غير محصّل: "}{unpaidTodayCount(apts, today)}{" حالة"}</div>
          </div>
          <div style={{ color: C.muted, fontSize: 11, fontWeight: 700, marginBottom: 10 }}>حسب العيادة</div>
          {clinicStats(apts, CLINICS_LIST, today).map(s => s && (
            <div key={s.clinic} style={{ background: C.card, border: "1px solid " + C.border, borderRadius: 12, padding: "12px 14px", marginBottom: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ color: C.text, fontWeight: 700, fontSize: 13 }}>{"📍 "}{clinicLabel(s.clinic)}</span>
                <div style={{ display: "flex", gap: 10 }}>
                  <span style={{ color: C.teal, fontWeight: 700, fontSize: 13 }}>{s.todayCnt}{" اليوم"}</span>
                  <span style={{ color: C.muted, fontSize: 12 }}>{s.cnt}{" إجمالي"}</span>
                </div>
              </div>
              <div style={{ background: C.bg, borderRadius: 6, height: 6, overflow: "hidden" }}>
                <div style={{ width: s.width, height: "100%", background: `linear-gradient(90deg,${C.accent},${C.teal})`, borderRadius: 6 }} />
              </div>
            </div>
          ))}
          <div style={{ color: C.muted, fontSize: 11, fontWeight: 700, marginBottom: 10, marginTop: 16 }}>حسب نوع الموعد</div>
          {typeStats(apts, STATS_VISIT_TYPES).map(s => s && (
            <div key={s.type} style={{ background: C.card, border: "1px solid " + C.border, borderRadius: 10, padding: "10px 14px", marginBottom: 6, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ color: C.text, fontSize: 13 }}>{s.type}</span>
              <span style={{ color: C.teal, fontWeight: 700, fontSize: 15 }}>{s.cnt}</span>
            </div>
          ))}
          <div style={{ background: C.gold + "11", border: "1px solid " + C.gold + "33", borderRadius: 14, padding: 14, marginTop: 16 }}>
            <div style={{ color: C.gold, fontWeight: 700, fontSize: 13, marginBottom: 4 }}>⭐ طلبات المرضى المعلقة</div>
            <div style={{ color: C.text, fontSize: 28, fontWeight: 800 }}>{pendingFromPatient}</div>
            <div style={{ color: C.muted, fontSize: 11 }}>بحاجة للتأكيد</div>
          </div>
        </div>
      )}

      {modal === "add" && (
        <Modal title="موعد جديد" onClose={() => setModal(null)}>
          <SecretaryAptForm patients={patients} appointments={apts} prices={prices} onSave={async f => { if (await addApt(f)) setModal(null); }} onClose={() => setModal(null)} />
        </Modal>
      )}
      {modal?.edit && (
        <Modal title="تعديل الموعد" onClose={() => setModal(null)}>
          <SecretaryAptForm patients={patients} appointments={apts} prices={prices} initial={modal.edit} onSave={async f => { if (await editApt(f)) setModal(null); }} onClose={() => setModal(null)} />
        </Modal>
      )}
      {collectApt && (
        <Modal title="💰 تحصيل مبلغ الكشف" onClose={() => setCollectApt(null)}>
          <CollectModal apt={collectApt} prices={prices} onSave={handleSaveCollect} onClose={() => setCollectApt(null)} />
        </Modal>
      )}
      {toast && <Toast msg={toast} onDone={() => setToast(null)} />}
    </div>
  );
}
