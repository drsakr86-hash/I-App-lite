import React, { useState, useEffect, useRef } from "react";
import {
  POLL_INTERVAL_MS, RATING_POPUP_DELAY_MS, RATING_DONE_DELAY_MS,
  BOOK_DUPLICATE_MSG, BOOK_FAILED_MSG, RATING_STARS,
  initialTab, patientTabs, blankBookForm, myAppointments, ownRecords,
  upcomingAppointments, pastAppointments, isAptSoon as aptSoon, findUnratedVisit, shouldAutoPromptRating,
  bookFormError, buildBookingRow, isDuplicateBookingError, clearBookTime, bookDoneSummary,
  markVisitRatedIn, canSubmitRating, buildRatingRecord, appendRating,
  headerAvatar, headerName, headerSub, firstName, nextAptPlace, clinicWaHref, rxMedicineLines, examVitals
} from "../modules/patient-app/model.js";
import { Modal, Toast } from "../components/common.jsx";
import { BookingForm } from "../components/forms/index.js";

const L = () => globalThis.IAppLegacy;

// "⭐ قيّم زيارتك" modal body (only used inside PatientApp).
// QUIRK: "لاحقاً" calls the same onDone as a successful submit, so skipping
// also marks the visit rated; the submit has no double-click guard and does a
// read-modify-write of iapp_ratings via sbGet/sbSet (not sbMutate).
function RatingPrompt({ visit, patient, onDone }) {
  const { C, inp, sbGet, sbSet, localISO } = L();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [sent, setSent] = useState(false);
  const submit = async () => {
    const ratings = (await sbGet("iapp_ratings")) || [];
    appendRating(ratings, buildRatingRecord({ id: Date.now(), patient, visit, rating, comment, date: localISO() }));
    await sbSet("iapp_ratings", ratings);
    setSent(true);
    setTimeout(onDone, RATING_DONE_DELAY_MS);
  };
  if (sent) return (
    <div style={{ textAlign: "center", padding: "30px 20px" }}>
      <div style={{ fontSize: 48, marginBottom: 12 }}>🌟</div>
      <div style={{ color: C.success, fontWeight: 800, fontSize: 18 }}>شكراً على تقييمك!</div>
    </div>
  );
  const can = canSubmitRating(rating);
  return (
    <div>
      <div style={{ textAlign: "center", marginBottom: 20 }}>
        <div style={{ color: C.text, fontWeight: 700, fontSize: 15, marginBottom: 6 }}>كيف كانت تجربتك؟</div>
        <div style={{ color: C.muted, fontSize: 12 }}>{"زيارة "}{visit.date}</div>
      </div>
      <div style={{ display: "flex", justifyContent: "center", gap: 12, marginBottom: 20 }}>
        {RATING_STARS.map(n => (
          <div
            key={n}
            onClick={() => setRating(n)}
            style={{
              fontSize: 36,
              cursor: "pointer",
              opacity: n <= rating ? 1 : 0.3,
              transition: "all 0.15s",
              transform: n <= rating ? "scale(1.1)" : "scale(1)"
            }}
          >⭐</div>
        ))}
      </div>
      <textarea
        style={{ ...inp(), minHeight: 70, resize: "none", marginBottom: 14 }}
        value={comment}
        onChange={e => setComment(e.target.value)}
        placeholder="أي ملاحظات أو اقتراحات؟ (اختياري)"
      />
      <div style={{ display: "flex", gap: 10 }}>
        <button
          onClick={onDone}
          style={{
            flex: 1,
            background: "transparent",
            border: "1px solid " + C.border,
            borderRadius: 10,
            padding: 10,
            color: C.muted,
            fontWeight: 700,
            fontSize: 13,
            cursor: "pointer",
            fontFamily: "inherit"
          }}
        >لاحقاً</button>
        <button
          onClick={submit}
          disabled={!rating}
          style={{
            flex: 2,
            background: can ? `linear-gradient(135deg,${C.gold},${C.accent})` : "transparent",
            border: "1px solid " + (can ? C.gold : C.border),
            borderRadius: 10,
            padding: 10,
            color: can ? C.bg : C.muted,
            fontWeight: 700,
            fontSize: 13,
            cursor: can ? "pointer" : "default",
            fontFamily: "inherit"
          }}
        >إرسال التقييم ✓</button>
      </div>
    </div>
  );
}

export default function PatientApp({ patient, onLogout }) {
  const {
    C, localISO, sbGet, sbMutate, getSB, BOOKING_TABLE,
    PATIENT_CLINICS, CLINIC_CODE, clinicDisplay
  } = L();
  const [tab, setTab] = useState(initialTab(patient));
  const [appointments, setAppointments] = useState([]);
  const [prescriptions, setPrescriptions] = useState([]);
  const [exams, setExams] = useState([]);
  const [visits, setVisits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  // QUIRK: toast is never set anywhere in PatientApp (dead state, kept as legacy).
  const [toast, setToast] = useState(null);
  const [bookForm, setBookForm] = useState(blankBookForm(patient));
  const [booking, setBooking] = useState(false);
  const [bookDone, setBookDone] = useState(false);
  const [ratingTarget, setRatingTarget] = useState(null);
  const [slotsVersion, setSlotsVersion] = useState(0);
  const bookingLock = useRef(false);
  const today = localISO();
  useEffect(() => {
    (async () => {
      const [a, rx, ex, v] = await Promise.all([sbGet("iapp_appointments"), sbGet("iapp_prescriptions"), sbGet("iapp_exams"), sbGet("iapp_visits")]);
      if (a) setAppointments(myAppointments(a, patient));
      if (rx) setPrescriptions(ownRecords(rx, patient.id));
      if (ex) setExams(ownRecords(ex, patient.id));
      if (v) {
        const pv = ownRecords(v, patient.id);
        setVisits(pv);
        const unrated = findUnratedVisit(pv, Date.now());
        if (shouldAutoPromptRating(unrated, patient)) setTimeout(() => setRatingTarget(unrated), RATING_POPUP_DELAY_MS);
      }
      setLoading(false);
    })();
    const iv = setInterval(async () => {
      const a = await sbGet("iapp_appointments");
      if (a) setAppointments(myAppointments(a, patient));
    }, POLL_INTERVAL_MS);
    return () => clearInterval(iv);
  }, []);
  const upcomingApts = upcomingAppointments(appointments, today);
  const pastApts = pastAppointments(appointments, today);
  const doBook = async () => {
    const err = bookFormError(bookForm);
    if (err) {
      alert(err);
      return;
    }
    if (bookingLock.current) return;
    bookingLock.current = true;
    setBooking(true);
    try {
      const sb = getSB();
      if (!sb) throw new Error("offline");
      const row = buildBookingRow(bookForm, CLINIC_CODE);
      const { error } = await sb.from(BOOKING_TABLE).insert(row);
      if (error) {
        if (isDuplicateBookingError(error)) {
          alert(BOOK_DUPLICATE_MSG);
          setBookForm(clearBookTime);
          setSlotsVersion(x => x + 1);
        } else {
          alert(BOOK_FAILED_MSG);
        }
      } else {
        setBookDone(true);
      }
    } catch (e) {
      alert(BOOK_FAILED_MSG);
    } finally {
      bookingLock.current = false;
      setBooking(false);
    }
  };
  const markVisitRated = async visitId => {
    await sbMutate("iapp_visits", v => markVisitRatedIn(v, visitId));
    setRatingTarget(null);
  };
  const TABS = patientTabs(patient.isGuest);
  const nextApt = upcomingApts[0];
  const isAptSoon = aptSoon(nextApt, new Date());
  const anim = { animation: "slideUp 0.25s ease" };
  const confirmedBadge = a => a.confirmed
    ? <div style={{ color: C.success, fontSize: 10, fontWeight: 700 }}>✓ مؤكد</div>
    : <div style={{ color: C.gold, fontSize: 10 }}>⏳ بانتظار التأكيد</div>;

  return (
    <div style={{ height: "100%", background: C.bg, direction: "rtl", display: "flex", flexDirection: "column" }}>
      <div
        style={{
          background: `linear-gradient(135deg,${C.surface},${C.surface2})`,
          borderBottom: "1px solid " + C.border,
          padding: "0 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          height: 60,
          flexShrink: 0
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: "50%",
              background: `linear-gradient(135deg,${C.accent},${C.teal})`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 800,
              color: C.bg,
              fontSize: 15
            }}
          >{headerAvatar(patient)}</div>
          <div>
            <div style={{ color: C.text, fontWeight: 700, fontSize: 13 }}>{headerName(patient)}</div>
            <div style={{ color: C.muted, fontSize: 10 }}>{headerSub(patient)}</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {isAptSoon && (
            <span
              style={{
                background: C.gold + "22",
                color: C.gold,
                borderRadius: 8,
                padding: "3px 8px",
                fontSize: 10,
                fontWeight: 700,
                animation: "pulse 2s infinite"
              }}
            >⏰ موعد قريب</span>
          )}
          <button
            onClick={onLogout}
            style={{
              background: "transparent",
              border: "1px solid " + C.border,
              borderRadius: 8,
              padding: "6px 12px",
              color: C.muted,
              fontSize: 11,
              cursor: "pointer",
              fontFamily: "inherit"
            }}
          >خروج</button>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "16px 16px 0" }}>
        {loading && <div style={{ color: C.muted, textAlign: "center", padding: 40, fontSize: 13 }}>⏳ جاري التحميل...</div>}

        {!loading && tab === "home" && (
          <div style={anim}>
            <div style={{ color: C.text, fontWeight: 800, fontSize: 18, marginBottom: 2 }}>{"أهلاً "}{firstName(patient)}{" 👋"}</div>
            <div style={{ color: C.muted, fontSize: 12, marginBottom: 20 }}>عيادة د. عبدالستار صقر</div>
            {nextApt && (
              <div
                style={{
                  background: isAptSoon ? `linear-gradient(135deg,${C.gold}22,${C.accent}11)` : `linear-gradient(135deg,${C.accent}22,${C.teal}11)`,
                  border: "1px solid " + (isAptSoon ? C.gold : C.accent) + "44",
                  borderRadius: 16,
                  padding: 16,
                  marginBottom: 16,
                  animation: isAptSoon ? "pulse 2.5s infinite" : "none"
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ color: isAptSoon ? C.gold : C.accent, fontWeight: 700, fontSize: 12, marginBottom: 6 }}>
                      {isAptSoon ? "⏰ موعدك قريب جداً!" : "📅 موعدك القادم"}
                    </div>
                    <div style={{ color: C.text, fontWeight: 800, fontSize: 16 }}>{nextApt.date}</div>
                    <div style={{ color: C.muted, fontSize: 13, marginTop: 4 }}>{nextApt.time}{" · "}{nextApt.type}</div>
                    <div style={{ color: C.muted, fontSize: 12, marginTop: 2 }}>{"🏥 "}{nextAptPlace(nextApt, clinicDisplay)}</div>
                  </div>
                  <div style={{ textAlign: "center" }}>
                    {nextApt.confirmed ? (
                      <div
                        style={{
                          background: C.success + "22",
                          border: "1px solid " + C.success + "44",
                          borderRadius: 10,
                          padding: "6px 12px",
                          color: C.success,
                          fontSize: 12,
                          fontWeight: 700
                        }}
                      >✓ مؤكد</div>
                    ) : (
                      <div
                        style={{
                          background: C.gold + "22",
                          border: "1px solid " + C.gold + "44",
                          borderRadius: 10,
                          padding: "6px 12px",
                          color: C.gold,
                          fontSize: 11,
                          fontWeight: 700
                        }}
                      >⏳ بانتظار التأكيد</div>
                    )}
                  </div>
                </div>
              </div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
              {[
                { icon: "📅", label: "مواعيد قادمة", val: upcomingApts.length, color: C.accent, action: () => setTab("apts") },
                { icon: "💊", label: "روشتات", val: prescriptions.length, color: C.teal, action: () => setTab("rx") },
                { icon: "🔬", label: "فحوصات", val: exams.length, color: C.gold, action: () => setTab("exams") },
                { icon: "🗓", label: "زيارات سابقة", val: pastApts.length, color: C.muted, action: () => setTab("apts") }
              ].map((s, i) => (
                <div
                  key={i}
                  onClick={s.action}
                  style={{ background: C.card, borderRadius: 14, padding: "14px", border: "1px solid " + C.border, cursor: "pointer" }}
                >
                  <div style={{ fontSize: 22, marginBottom: 6 }}>{s.icon}</div>
                  <div style={{ color: s.color, fontSize: 22, fontWeight: 800 }}>{s.val}</div>
                  <div style={{ color: C.muted, fontSize: 11 }}>{s.label}</div>
                </div>
              ))}
            </div>
            <div
              onClick={() => setTab("book")}
              style={{
                background: `linear-gradient(135deg,${C.accent}22,${C.teal}11)`,
                border: "1px solid " + C.accent + "44",
                borderRadius: 16,
                padding: 16,
                marginBottom: 16,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 14
              }}
            >
              <div
                style={{
                  width: 46,
                  height: 46,
                  borderRadius: 14,
                  background: `linear-gradient(135deg,${C.accent},${C.teal})`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 22
                }}
              >➕</div>
              <div>
                <div style={{ color: C.text, fontWeight: 700, fontSize: 14 }}>احجز موعد جديد</div>
                <div style={{ color: C.muted, fontSize: 12, marginTop: 2 }}>اختر المكان والوقت المناسب لك</div>
              </div>
              <div style={{ color: C.accent, fontSize: 18, marginRight: "auto" }}>←</div>
            </div>
            <div style={{ background: C.card, borderRadius: 14, padding: 14, border: "1px solid " + C.border, marginBottom: 16 }}>
              <div style={{ color: C.text, fontWeight: 700, fontSize: 13, marginBottom: 12 }}>📞 تواصل معنا</div>
              {PATIENT_CLINICS.map(c => (
                <div
                  key={c.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 10,
                    paddingBottom: 10,
                    borderBottom: "1px solid " + C.border + "66"
                  }}
                >
                  <div>
                    <div style={{ color: C.text, fontSize: 12, fontWeight: 600 }}>{c.icon}{" "}{c.name}</div>
                    <div style={{ color: C.muted, fontSize: 11 }}>{"📍 "}{c.address}</div>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <a
                      href={"tel:" + c.phone}
                      style={{
                        background: C.teal + "22",
                        border: "1px solid " + C.teal + "33",
                        borderRadius: 8,
                        padding: "5px 10px",
                        color: C.teal,
                        fontSize: 12,
                        textDecoration: "none"
                      }}
                    >📞</a>
                    <a
                      href={clinicWaHref(c.phone)}
                      target="_blank"
                      style={{
                        background: "#25D36622",
                        border: "1px solid #25D36633",
                        borderRadius: 8,
                        padding: "5px 10px",
                        color: "#25D366",
                        fontSize: 12,
                        textDecoration: "none"
                      }}
                    >💬</a>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {!loading && tab === "book" && (
          <div style={anim}>
            <div style={{ color: C.text, fontWeight: 700, fontSize: 16, marginBottom: 4 }}>➕ احجز موعد</div>
            <div style={{ color: C.muted, fontSize: 12, marginBottom: 16 }}>اختر المكان والوقت المناسب</div>
            {bookDone ? (
              <div
                style={{
                  background: C.success + "22",
                  border: "1px solid " + C.success,
                  borderRadius: 16,
                  padding: "30px 20px",
                  textAlign: "center",
                  animation: "slideUp 0.3s ease"
                }}
              >
                <div style={{ fontSize: 52, marginBottom: 12 }}>✅</div>
                <div style={{ color: C.success, fontWeight: 800, fontSize: 18, marginBottom: 8 }}>تم إرسال طلب الحجز!</div>
                <div style={{ background: C.bg, borderRadius: 12, padding: 14, marginBottom: 16, textAlign: "right" }}>
                  {bookDoneSummary(bookForm).map(([icon, val]) => (
                    <div key={icon} style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                      <span>{icon}</span>
                      <span style={{ color: C.text, fontSize: 13 }}>{val}</span>
                    </div>
                  ))}
                </div>
                <div style={{ color: C.muted, fontSize: 12, marginBottom: 20 }}>سيتم التواصل معك لتأكيد الموعد</div>
                <button
                  onClick={() => {
                    setBookDone(false);
                    setBookForm(blankBookForm(patient));
                  }}
                  style={{
                    background: `linear-gradient(135deg,${C.accent},${C.teal})`,
                    border: "none",
                    borderRadius: 10,
                    padding: "10px 24px",
                    color: C.bg,
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: "pointer",
                    fontFamily: "inherit"
                  }}
                >حجز موعد آخر</button>
              </div>
            ) : (
              <BookingForm
                patient={patient}
                bookForm={bookForm}
                setBookForm={setBookForm}
                booking={booking}
                onBook={doBook}
                slotsVersion={slotsVersion}
              />
            )}
          </div>
        )}

        {!loading && tab === "apts" && (
          <div style={anim}>
            <div style={{ color: C.text, fontWeight: 700, fontSize: 16, marginBottom: 16 }}>📅 مواعيدي</div>
            {upcomingApts.length > 0 && (
              <>
                <div style={{ color: C.accent, fontSize: 12, fontWeight: 700, marginBottom: 10 }}>القادمة</div>
                {upcomingApts.map(a => (
                  <div
                    key={a.id}
                    style={{
                      background: C.card,
                      border: "1px solid " + (a.confirmed ? C.success : C.accent) + "44",
                      borderRadius: 16,
                      padding: "14px",
                      marginBottom: 10,
                      borderRight: "3px solid " + (a.confirmed ? C.success : C.accent)
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                      <div>
                        <div style={{ color: C.text, fontWeight: 700, fontSize: 14 }}>{a.date}</div>
                        <div style={{ color: C.muted, fontSize: 12, marginTop: 2 }}>{a.type}</div>
                        {a.clinic && <div style={{ color: C.teal, fontSize: 11, marginTop: 2 }}>{"🏥 "}{clinicDisplay(a.clinic)}</div>}
                      </div>
                      <div style={{ textAlign: "center" }}>
                        <div style={{ color: C.accent, fontSize: 18, fontWeight: 800 }}>{a.time}</div>
                        {confirmedBadge(a)}
                      </div>
                    </div>
                    {a.notes && <div style={{ color: C.muted, fontSize: 11 }}>{"📝 "}{a.notes}</div>}
                  </div>
                ))}
              </>
            )}
            {pastApts.length > 0 && (
              <>
                <div style={{ color: C.muted, fontSize: 12, fontWeight: 700, marginTop: 16, marginBottom: 10 }}>السابقة</div>
                {pastApts.map(a => (
                  <div
                    key={a.id}
                    style={{ background: C.card, border: "1px solid " + C.border, borderRadius: 14, padding: "12px 14px", marginBottom: 8, opacity: 0.75 }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <div>
                        <div style={{ color: C.text, fontSize: 13 }}>{a.date}</div>
                        <div style={{ color: C.muted, fontSize: 11 }}>{a.type}</div>
                      </div>
                      <div style={{ color: C.muted, fontSize: 14, fontWeight: 700 }}>{a.time}</div>
                    </div>
                  </div>
                ))}
              </>
            )}
            {appointments.length === 0 && <div style={{ color: C.muted, textAlign: "center", padding: 40 }}>لا توجد مواعيد</div>}
          </div>
        )}

        {!loading && tab === "rx" && (
          <div style={anim}>
            <div style={{ color: C.text, fontWeight: 700, fontSize: 16, marginBottom: 16 }}>{"💊 روشتاتي ("}{prescriptions.length}{")"}</div>
            {prescriptions.length === 0 && <div style={{ color: C.muted, textAlign: "center", padding: 40 }}>لا توجد روشتات بعد</div>}
            {prescriptions.map(rx => (
              <div key={rx.id} style={{ background: C.card, border: "1px solid " + C.border, borderRadius: 16, padding: 16, marginBottom: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <div style={{ color: C.accent, fontWeight: 700, fontSize: 14 }}>{rx.date}</div>
                  <div style={{ color: C.muted, fontSize: 11, background: C.bg, padding: "4px 10px", borderRadius: 8 }}>{rx.eye}</div>
                </div>
                <div style={{ background: C.bg, borderRadius: 10, padding: 10, marginBottom: 12, border: "1px solid " + C.border }}>
                  <div style={{ color: C.text, fontSize: 11, fontWeight: 700, marginBottom: 8 }}>👓 كشف النظارة</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 6, fontSize: 10, textAlign: "center" }}>
                    <div style={{ color: C.muted }}>العين</div>
                    <div style={{ color: C.muted }}>SPH</div>
                    <div style={{ color: C.muted }}>CYL</div>
                    <div style={{ color: C.muted }}>AX</div>
                    <div style={{ color: C.text, fontWeight: 700 }}>يمنى</div>
                    <div style={{ color: C.text }}>{rx.sphR || "-"}</div>
                    <div style={{ color: C.text }}>{rx.cylR || "-"}</div>
                    <div style={{ color: C.text }}>{rx.axisR || "-"}</div>
                    <div style={{ color: C.text, fontWeight: 700 }}>يسرى</div>
                    <div style={{ color: C.text }}>{rx.sphL || "-"}</div>
                    <div style={{ color: C.text }}>{rx.cylL || "-"}</div>
                    <div style={{ color: C.text }}>{rx.axisL || "-"}</div>
                  </div>
                  {rx.add && <div style={{ color: C.gold, fontSize: 11, marginTop: 8 }}>{"ADD: "}{rx.add}</div>}
                </div>
                {rx.medicines && (
                  <div style={{ background: C.teal + "11", borderRadius: 10, padding: 10, border: "1px solid " + C.teal + "33" }}>
                    <div style={{ color: C.teal, fontSize: 11, fontWeight: 700, marginBottom: 6 }}>💊 الأدوية</div>
                    {rxMedicineLines(rx.medicines).map((m, i) => (
                      <div key={i} style={{ color: C.text, fontSize: 12, marginBottom: 4 }}>{"• "}{m}</div>
                    ))}
                  </div>
                )}
                {rx.notes && <div style={{ color: C.muted, fontSize: 11, marginTop: 10 }}>{"📝 "}{rx.notes}</div>}
              </div>
            ))}
          </div>
        )}

        {!loading && tab === "exams" && (
          <div style={anim}>
            <div style={{ color: C.text, fontWeight: 700, fontSize: 16, marginBottom: 16 }}>{"🔬 نتائج My Investigations ("}{exams.length}{")"}</div>
            {exams.length === 0 && <div style={{ color: C.muted, textAlign: "center", padding: 40 }}>No investigations yet</div>}
            {exams.map(ex => (
              <div key={ex.id} style={{ background: C.card, border: "1px solid " + C.border, borderRadius: 16, padding: 16, marginBottom: 14 }}>
                <div style={{ color: C.accent, fontWeight: 700, fontSize: 14, marginBottom: 12 }}>{ex.date}{" · "}{ex.doctor}</div>
                {ex.chiefComplaint && (
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ color: C.muted, fontSize: 11, marginBottom: 4 }}>الشكوى</div>
                    <div style={{ color: C.text, fontSize: 13 }}>{ex.chiefComplaint}</div>
                  </div>
                )}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
                  {examVitals(ex).map(([l, v]) => (
                    <div key={l} style={{ background: C.bg, borderRadius: 8, padding: "8px" }}>
                      <div style={{ color: C.muted, fontSize: 10 }}>{l}</div>
                      <div style={{ color: C.text, fontWeight: 700, fontSize: 13 }}>{v}</div>
                    </div>
                  ))}
                </div>
                {ex.diagnosis && (
                  <div style={{ background: C.accent + "11", borderRadius: 10, padding: 10, border: "1px solid " + C.accent + "33", marginBottom: 8 }}>
                    <div style={{ color: C.accent, fontSize: 11, fontWeight: 700, marginBottom: 4 }}>التشخيص</div>
                    <div style={{ color: C.text, fontSize: 13 }}>{ex.diagnosis}</div>
                  </div>
                )}
                {ex.treatmentPlan && (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ color: C.muted, fontSize: 11, marginBottom: 4 }}>خطة العلاج</div>
                    <div style={{ color: C.text, fontSize: 12 }}>{ex.treatmentPlan}</div>
                  </div>
                )}
                {ex.followUp && <div style={{ color: C.gold, fontSize: 11, marginTop: 8 }}>{"📅 موعد المتابعة: "}{ex.followUp}</div>}
              </div>
            ))}
          </div>
        )}
        <div style={{ height: 80 }} />
      </div>

      <div
        style={{
          background: C.surface,
          borderTop: "1px solid " + C.border,
          display: "flex",
          justifyContent: "space-around",
          padding: "8px 0 20px",
          flexShrink: 0
        }}
      >
        {TABS.map(t => (
          <div
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 3,
              cursor: "pointer",
              padding: "4px 12px",
              borderRadius: 10,
              background: tab === t.id ? C.accent + "22" : "transparent"
            }}
          >
            <div
              style={{
                fontSize: 20,
                filter: tab === t.id ? "drop-shadow(0 0 6px " + C.accent + ")" : "none",
                transform: tab === t.id ? "scale(1.15)" : "scale(1)",
                transition: "all 0.2s"
              }}
            >{t.icon}</div>
            <div style={{ color: tab === t.id ? C.accent : C.muted, fontSize: 9, fontWeight: tab === t.id ? 700 : 400 }}>{t.label}</div>
          </div>
        ))}
      </div>

      {ratingTarget && (
        <Modal title="⭐ قيّم زيارتك" onClose={() => setRatingTarget(null)}>
          <RatingPrompt visit={ratingTarget} patient={patient} onDone={() => markVisitRated(ratingTarget.id)} />
        </Modal>
      )}
      {toast && <Toast msg={toast.msg} color={toast.color} onDone={() => setToast(null)} />}
    </div>
  );
}
