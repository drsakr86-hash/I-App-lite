import React, { useState, useEffect } from "react";
import { getDailyReportHTML, printDoc } from "../modules/print/index.js";
import { C } from "../modules/theme/index.js";
import { useDB } from "../modules/data/index.js";
import { SEED } from "../modules/constants/seed.js";
import { getUsers, saveUsers } from "../modules/auth/staff-login.js";
import { sbGet } from "../modules/sync/wiring.js";
import { refreshPending } from "../modules/sync/engine.js";
import { localISO } from "../modules/constants/misc.js";
import LoginScreen from "../components/forms/LoginScreen.jsx";
import TopBar from "../components/TopBar.jsx";
import BottomNav from "../components/BottomNav.jsx";
import FollowUpCentre from "../components/FollowUpCentre.jsx";
import GlobalSearch from "../components/GlobalSearch.jsx";
import { Toast } from "../components/common.jsx";
import Dashboard from "./Dashboard.jsx";
import PatientsContainer from "./PatientsContainer.jsx";
import Appointments from "./Appointments.jsx";
import WaitingRoom from "./WaitingRoom.jsx";
import Prescriptions from "./Prescriptions.jsx";
import Radiology from "./Radiology.jsx";
import ImagingCenter from "./ImagingCenter.jsx";
import Accounting from "./Accounting.jsx";
import Settings from "./Settings.jsx";

// Doctor-app shell. Exact port of the legacy runtime's App()
// (public/legacy/app-runtime.js) -- same state, same effects, same screens
// object, same render tree. Final batch: every screen below is the real
// React component directly (no more useNewScreen(...) gate -- there is no
// legacy fallback left to gate against), including the Patients tab, now
// wired to PatientsContainer (src/screens/PatientsContainer.jsx), which owns
// the search state and onOpenFile callback PatientFile needs.
export default function App() {

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
  const [users, setUsersState] = useState(() => getUsers());
  const setUsers = list => {
    saveUsers(list);
    setUsersState(list);
  };
  const [tab, setTab] = useState("dashboard");
  const [patOpenId, setPatOpenId] = useState(null);
  const [patNewName, setPatNewName] = useState("");
  const [showAlerts, setShowAlerts] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [alertsShown, setAlertsShown] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [toast, setToast] = useState(null);
  const showToast = msg => {
    setToast(msg);
  };
  useEffect(() => {
    const openSettings = () => setTab("settings");
    window.addEventListener("iapp-open-settings", openSettings);
    return () => window.removeEventListener("iapp-open-settings", openSettings);
  }, []);
  const [patients, setRawP, pR] = useDB("iapp_patients", SEED.patients);
  const [appointments, setRawA, aR, refreshAppointments] = useDB("iapp_appointments", SEED.appointments);
  const [prescriptions, setRawRx, rR] = useDB("iapp_prescriptions", SEED.prescriptions);
  const [exams, setRawE, eR] = useDB("iapp_exams", SEED.exams);
  const [visits, setRawV, vR] = useDB("iapp_visits", SEED.visits);
  const [doctors, setRawD, dR] = useDB("iapp_doctors", SEED.doctors);
  const [prices, setRawPr, prR] = useDB("iapp_prices", SEED.prices);
  const [customTests, setRawCT, ctR] = useDB("iapp_custom_tests", SEED.customTests);
  const [clinic, setRawCl, clR] = useDB("iapp_clinic", SEED.clinic);
  const [expenses, setRawEx, exR] = useDB("iapp_expenses", SEED.expenses);
  const [recurringExpenses, setRawRE, reR] = useDB("iapp_recurring_expenses", SEED.recurringExpenses);
  useEffect(() => {
    if (!session) return;
    refreshAppointments();
    const iv = setInterval(refreshAppointments, 5000);
    return () => clearInterval(iv);
  }, [session, refreshAppointments]);
  const withSync = fn => async v => {
    setSyncing(true);
    const ok = await fn(v);
    setTimeout(() => setSyncing(false), 1200);
    // لا نعرض Toast البرتقالي عند فشل المزامنة؛ حالة المزامنة نفسها تظهر في شريط الحالة.
    // وبذلك لا تُفهم كل مشكلة مزامنة على أنها "Offline".
    if (ok === false) {
      refreshPending();
    } else {
      showToast("تم الحفظ والمزامنة");
    }
  };
  const setPatients = withSync(setRawP);
  const setAppointments = withSync(setRawA);
  const updateSharedAppointment = async apt => {
    const remote = await sbGet("iapp_appointments");
    const base = Array.isArray(remote) ? remote : appointments;
    const next = base.some(a => a.id === apt.id) ? base.map(a => a.id === apt.id ? apt : a) : [...base, apt];
    await setAppointments(next);
  };
  const setRx = withSync(setRawRx);
  const setExams = withSync(setRawE);
  const setVisits = withSync(setRawV);
  const setDoctors = withSync(setRawD);
  const setPrices = withSync(setRawPr);
  const setCustomTests = withSync(setRawCT);
  const setClinic = withSync(setRawCl);
  const setExpenses = withSync(setRawEx);
  const setRecurringExpenses = withSync(setRawRE);
  const primary = doctors.find(d => d.isPrimary) || doctors[0] || {
    name: "د. عبدالستار صقر",
    short: "د. عبدالستار",
    initial: "ع"
  };
  const doctorNames = doctors.map(d => d.short);
  const reset = () => {
    setRawP(SEED.patients);
    setRawA(SEED.appointments);
    setRawRx(SEED.prescriptions);
    setRawE(SEED.exams);
    setRawV(SEED.visits);
    setRawD(SEED.doctors);
    setRawPr(SEED.prices);
    setRawCT(SEED.customTests);
    setRawCl(SEED.clinic);
    setRawEx(SEED.expenses);
    setRawRE(SEED.recurringExpenses);
  };
  useEffect(() => {
    if (!alertsShown && session) {
      setAlertsShown(true);
      // Show the follow-up centre at most once per day (closing it with x is no longer undone by the next app start).
      let seenToday = false;
      try {
        const d = new Date().toDateString();
        seenToday = localStorage.getItem("iapp_alerts_day") === d;
        if (!seenToday) localStorage.setItem("iapp_alerts_day", d);
      } catch {}
      if (!seenToday) setTimeout(() => setShowAlerts(true), 800);
    }
  }, [session]);
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
    setTab("dashboard");
    try {
      if (window.__iappUnifiedLogout) window.__iappUnifiedLogout();
    } catch {}
  };
  if (!session) return <LoginScreen onLogin={handleLogin} />;
  const effectiveTab = tab === "accounting" && session.role !== "admin" ? "dashboard" : tab;
  if (!pR || !aR || !rR || !eR || !vR || !dR || !prR || !ctR || !clR || !exR || !reR) {
    return (
      <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", direction: "rtl", fontFamily: "'Segoe UI','Tahoma',Arial,sans-serif" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>👁</div>
          <div style={{ color: C.accent, fontSize: 16, fontWeight: 700 }}>I App</div>
          <div style={{ color: C.muted, fontSize: 13, marginTop: 8 }}>جاري التحميل...</div>
        </div>
      </div>
    );
  }
  const screens = {
    dashboard: React.createElement(Dashboard, {
      patients, appointments, visits, primary, clinic,
      onDailyReport: () => {
        const html = getDailyReportHTML(localISO(), patients, visits, appointments, primary, clinic);
        printDoc(html);
      },
      onPatientClick: (name, p) => {
        if (p && p.id) {
          setPatOpenId(p.id);
        } else {
          setPatNewName(name);
        }
        setTab("patients");
      }
    }),
    patients: React.createElement(PatientsContainer, {
      patients, setPatients,
      initOpenId: patOpenId,
      initNewName: patNewName,
      onInitDone: () => {
        setPatOpenId(null);
        setPatNewName("");
      },
      exams, setExams, prescriptions, setRx, visits, setVisits,
      doctorNames, primaryDoctor: primary, prices, clinic, session, customTests
    }),
    appointments: React.createElement(Appointments, {
      appointments, setAppointments, doctorNames, patients, session,
      onPatientClick: (name, p) => {
        if (p && p.id) {
          setPatOpenId(p.id);
        } else {
          setPatNewName(name);
        }
        setTab("patients");
      }
    }),
    waiting: React.createElement(WaitingRoom, {
      apts: appointments, today: localISO(), onUpdateApt: updateSharedAppointment, onCollect: () => {}, doctorNames,
      isAdmin: !!(session && session.role === 'admin')
    }),
    prescriptions: React.createElement(Prescriptions, {
      prescriptions, setRx, patients, doctorNames, primaryDoctor: primary, clinic
    }),
    radiology: React.createElement(Radiology, {
      patients, customTests, setCustomTests, setExams, primary, clinic
    }),
    imaging: React.createElement(ImagingCenter, {
      patients, primary, clinic
    }),
    accounting: React.createElement(Accounting, {
      visits, expenses, setExpenses, recurringExpenses, setRecurringExpenses, doctors, clinic
    }),
    settings: React.createElement(Settings, {
      patients, appointments, prescriptions, exams, visits, doctors, setDoctors,
      prices, setPrices, clinic, setClinic, onReset: reset, users, setUsers, session, onLogout: handleLogout
    })
  };
  return (
    <div style={{ minHeight: "100vh", background: "#000", display: "flex", justifyContent: "center", alignItems: "flex-start" }}>
      <div style={{ width: "100%", maxWidth: 480, minHeight: "100vh", background: C.bg, direction: "rtl", fontFamily: "'Segoe UI','Tahoma',Arial,sans-serif", position: "relative", overflowX: "hidden" }}>
        <TopBar primary={primary} onSearch={() => setShowSearch(true)} syncing={syncing} session={session} onLogout={handleLogout} />
        <div style={{ overflowY: "auto", maxHeight: "calc(100vh - 128px)", animation: "slideUp 0.25s ease" }}>
          {screens[effectiveTab]}
        </div>
        <BottomNav active={effectiveTab} setActive={setTab} role={session.role} />
        {showAlerts && (
          <FollowUpCentre
            visits={visits}
            patients={patients}
            onPatientClick={id => {
              setPatOpenId(id);
              setTab("patients");
            }}
            onClose={() => setShowAlerts(false)}
          />
        )}
        {showSearch && (
          <GlobalSearch
            patients={patients}
            prescriptions={prescriptions}
            appointments={appointments}
            onNavigate={(t, id) => {
              if (t === "patients" && id) {
                setPatOpenId(id);
              }
              setTab(t);
              setShowSearch(false);
            }}
            onClose={() => setShowSearch(false)}
          />
        )}
        {toast && <Toast msg={toast} onDone={() => setToast(null)} />}
      </div>
    </div>
  );
}
