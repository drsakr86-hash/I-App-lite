import React, { useState, useEffect } from 'react';
import {
  SLOTS_VIEW, BOOKING_DATES_SHOWN, BOOK_VISIT_TYPES, initialBookingStep, bookingSteps, currentStepIndex,
  getAvailableDates, getSlots, slotsClinicCode, addTakenRows, isSlotFull, canPickSlot, withClinicPicked,
  withDatePicked, withTimePicked, withDateTimeCleared, withTimeCleared, shouldReturnToTimeStep, guestInfoError,
  bookingSummaryRows, bookButtonLabel
} from './booking-form-model.js';
import { C } from '../../modules/theme/index.js';
import { inp } from '../../modules/ui/atoms.jsx';
import { localISO, PATIENT_CLINICS, CLINIC_CODE } from '../../modules/constants/index.js';
import { getSB } from '../../modules/data-access/index.js';

// Patient booking wizard (patient app): guest info (guests only) → clinic →
// date → time → confirm. Exact port of the legacy runtime's BookingForm
// (public/legacy/app-runtime.js). The form only walks the steps and fills
// PatientApp's bookForm; PatientApp's doBook (onBook) validates and submits,
// unchanged. (The clinic list is the same instance PatientApp uses.)
export default function BookingForm({ patient, bookForm, setBookForm, booking, onBook, slotsVersion }) {
  const [step, setStep] = useState(initialBookingStep(patient.isGuest));
  const [selClinic, setSelClinic] = useState(null);
  const [availDates, setAvailDates] = useState([]);
  const [selDate, setSelDate] = useState(null);
  const [taken, setTaken] = useState({});
  const [slotsLoading, setSlotsLoading] = useState(false);
  // Taken-slot counts for the chosen clinic/date; refetched when PatientApp
  // bumps slotsVersion (after a "slot already taken" error).
  useEffect(() => {
    if (!selClinic || !selDate) return;
    let alive = true;
    setSlotsLoading(true);
    (async () => {
      const code = slotsClinicCode(CLINIC_CODE, selClinic.name);
      const m = {};
      try {
        const sb = getSB();
        if (sb) {
          const { data } = await sb.from(SLOTS_VIEW).select('time,taken').eq('clinic', code).eq('date', selDate.date);
          addTakenRows(m, data);
        }
      } catch (e) {}
      if (!alive) return;
      setTaken(m);
      setSlotsLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [selClinic, selDate, slotsVersion]);
  useEffect(() => {
    if (shouldReturnToTimeStep(step, bookForm.time)) setStep(4);
  }, [bookForm.time]);
  const s = k => e => setBookForm(v => ({ ...v, [k]: e.target.value }));
  const selClinicFn = c => {
    setSelClinic(c);
    setBookForm(v => withClinicPicked(v, c));
    setAvailDates(getAvailableDates(c, new Date(), localISO));
    setSelDate(null);
    setStep(3);
  };
  const selDateFn = d => {
    setSelDate(d);
    setBookForm(v => withDatePicked(v, d));
    setStep(4);
  };
  const selTimeFn = t => {
    setBookForm(v => withTimePicked(v, t));
    setStep(5);
  };
  const steps = bookingSteps(patient.isGuest);
  const currentStep = currentStepIndex(patient.isGuest, step);
  const label = mb => ({ color: C.muted, fontSize: 11, display: 'block', marginBottom: mb });
  const sectionHead = { color: C.muted, fontSize: 12, marginBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' };
  const stepTitle = n => ({ color: step === n ? C.accent : C.muted, fontWeight: step === n ? 700 : 400 });
  const changeLink = { color: C.accent, cursor: 'pointer', fontSize: 11, background: C.accent + '22', padding: '3px 10px', borderRadius: 8 };
  const doneCard = { background: C.card, border: '1px solid ' + C.success + '44', borderRadius: 14, padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' };
  return (
    <div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 18, alignItems: 'center' }}>
        {steps.map((l, i) => (
          <React.Fragment key={i}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
              <div
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: '50%',
                  background: i < currentStep ? C.success : i === currentStep ? C.accent : C.border,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 10,
                  fontWeight: 700,
                  color: i <= currentStep ? C.bg : C.muted,
                  transition: 'all 0.3s'
                }}
              >{i < currentStep ? '✓' : i + 1}</div>
              <div style={{ color: i === currentStep ? C.accent : C.muted, fontSize: 8, whiteSpace: 'nowrap' }}>{l}</div>
            </div>
            {i < steps.length - 1 && (
              <div
                style={{
                  flex: 1,
                  height: 2,
                  background: i < currentStep ? C.success : C.border,
                  borderRadius: 1,
                  marginBottom: 14,
                  transition: 'all 0.3s'
                }}
              />
            )}
          </React.Fragment>
        ))}
      </div>
      {patient.isGuest && step === 1 && (
        <div style={{ background: C.surface, borderRadius: 16, padding: 16, border: '1px solid ' + C.border, marginBottom: 14 }}>
          <div style={{ color: C.text, fontWeight: 700, fontSize: 14, marginBottom: 14 }}>👤 بياناتك أولاً</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={label(5)}>الاسم الكامل</label>
              <input
                style={inp()}
                value={bookForm.newName || ''}
                onChange={e => setBookForm(v => ({ ...v, newName: e.target.value }))}
                placeholder="اكتب اسمك كاملاً"
              />
            </div>
            <div>
              <label style={label(5)}>رقم الهاتف</label>
              <input
                style={inp()}
                value={bookForm.newPhone || ''}
                onChange={e => setBookForm(v => ({ ...v, newPhone: e.target.value }))}
                placeholder="01xxxxxxxxx"
                type="tel"
                inputMode="tel"
              />
            </div>
          </div>
          <button
            onClick={() => {
              const err = guestInfoError(bookForm);
              if (err) {
                alert(err);
                return;
              }
              setStep(2);
            }}
            style={{
              width: '100%',
              marginTop: 14,
              background: `linear-gradient(135deg,${C.accent},${C.teal})`,
              border: 'none',
              borderRadius: 12,
              padding: 13,
              color: C.bg,
              fontWeight: 700,
              fontSize: 14,
              cursor: 'pointer',
              fontFamily: 'inherit',
              boxShadow: '0 4px 16px ' + C.accent + '44'
            }}
          >التالي ← اختيار العيادة</button>
        </div>
      )}
      {patient.isGuest && step > 1 && (
        <div
          style={{
            background: C.card,
            border: '1px solid ' + C.success + '44',
            borderRadius: 12,
            padding: '10px 14px',
            marginBottom: 12,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
        >
          <div>
            <div style={{ color: C.text, fontSize: 12, fontWeight: 600 }}>{'👤 '}{bookForm.newName}</div>
            <div style={{ color: C.muted, fontSize: 11 }}>{'📞 '}{bookForm.newPhone}</div>
          </div>
          <span
            onClick={() => setStep(1)}
            style={{ color: C.accent, fontSize: 11, cursor: 'pointer', background: C.accent + '22', padding: '3px 10px', borderRadius: 8 }}
          >تغيير</span>
        </div>
      )}
      {step >= 2 && (
        <div style={{ marginBottom: 14 }}>
          <div style={sectionHead}>
            <span style={stepTitle(2)}>🏥 اختر مكان الكشف</span>
            {step > 2 && (
              <span
                onClick={() => {
                  setStep(2);
                  setSelDate(null);
                  setBookForm(withDateTimeCleared);
                }}
                style={changeLink}
              >تغيير</span>
            )}
          </div>
          {step === 2 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {PATIENT_CLINICS.map(c => (
                <div
                  key={c.id}
                  onClick={() => selClinicFn(c)}
                  style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: 16, padding: 16, cursor: 'pointer' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div
                      style={{
                        width: 48,
                        height: 48,
                        borderRadius: 14,
                        background: C.accent + '22',
                        border: '1px solid ' + C.accent + '33',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 24,
                        flexShrink: 0
                      }}
                    >{c.icon}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ color: C.text, fontWeight: 700, fontSize: 14 }}>{c.name}</div>
                      <div style={{ color: C.muted, fontSize: 11, marginTop: 2 }}>{'📍 '}{c.address}</div>
                      <div style={{ color: C.accent, fontSize: 11, marginTop: 2 }}>{'📅 '}{c.dayNames?.join(' · ')}</div>
                      <a
                        href={'tel:' + c.phone}
                        onClick={e => e.stopPropagation()}
                        style={{ color: C.teal, fontSize: 11, textDecoration: 'none', display: 'block', marginTop: 2 }}
                      >{'📞 '}{c.phone}</a>
                    </div>
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 10,
                        background: C.accent + '22',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: C.accent,
                        fontSize: 18,
                        flexShrink: 0
                      }}
                    >←</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div
              style={{
                background: C.card,
                border: '1px solid ' + C.success + '44',
                borderRadius: 14,
                padding: '12px 16px',
                display: 'flex',
                alignItems: 'center',
                gap: 12
              }}
            >
              <span style={{ fontSize: 22 }}>{selClinic?.icon}</span>
              <div>
                <div style={{ color: C.text, fontWeight: 700, fontSize: 13 }}>{selClinic?.name}</div>
                <div style={{ color: C.muted, fontSize: 11 }}>{'📍 '}{selClinic?.address}</div>
              </div>
              <span style={{ marginRight: 'auto', color: C.success, fontSize: 16 }}>✓</span>
            </div>
          )}
        </div>
      )}
      {step >= 3 && (
        <div style={{ marginBottom: 14 }}>
          <div style={sectionHead}>
            <span style={stepTitle(3)}>📅 اختر التاريخ</span>
            {step > 3 && (
              <span
                onClick={() => {
                  setStep(3);
                  setBookForm(withTimeCleared);
                }}
                style={changeLink}
              >تغيير</span>
            )}
          </div>
          {step === 3 ? (
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 8 }}>
              {availDates.slice(0, BOOKING_DATES_SHOWN).map(d => (
                <div
                  key={d.date}
                  onClick={() => selDateFn(d)}
                  style={{
                    flexShrink: 0,
                    background: C.card,
                    border: '1px solid ' + C.border,
                    borderRadius: 14,
                    padding: '12px 14px',
                    cursor: 'pointer',
                    textAlign: 'center',
                    minWidth: 76
                  }}
                >
                  <div style={{ color: C.accent, fontSize: 10, marginBottom: 4 }}>{d.dayName}</div>
                  <div style={{ color: C.text, fontWeight: 700, fontSize: 13 }}>{d.date.slice(5)}</div>
                </div>
              ))}
            </div>
          ) : (
            <div style={doneCard}>
              <div style={{ color: C.text, fontWeight: 700, fontSize: 13 }}>{'📅 '}{selDate?.dayName}{' · '}{bookForm.date}</div>
              <span style={{ color: C.success, fontSize: 16 }}>✓</span>
            </div>
          )}
        </div>
      )}
      {step >= 4 && (
        <div style={{ marginBottom: 14 }}>
          <div style={sectionHead}>
            <span style={stepTitle(4)}>⏰ اختر الوقت</span>
            {step > 4 && <span onClick={() => setStep(4)} style={changeLink}>تغيير</span>}
          </div>
          {step === 4 ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              {slotsLoading && (
                <div style={{ gridColumn: '1 / -1', color: C.muted, fontSize: 11, textAlign: 'center' }}>⏳ جاري تحميل المواعيد المتاحة...</div>
              )}
              {getSlots(selClinic, selDate?.dayOfWeek).map(t => {
                const full = isSlotFull(taken, t);
                return (
                  <div
                    key={t}
                    onClick={() => canPickSlot(full, slotsLoading) && selTimeFn(t)}
                    style={{
                      background: full ? C.bg : C.card,
                      border: '1px solid ' + C.border,
                      borderRadius: 12,
                      padding: '12px 8px',
                      textAlign: 'center',
                      cursor: full ? 'not-allowed' : 'pointer',
                      color: full ? C.muted : C.text,
                      fontWeight: 700,
                      fontSize: 14,
                      opacity: full ? 0.45 : 1
                    }}
                  >
                    {t}
                    {full && <div style={{ fontSize: 9, fontWeight: 600, marginTop: 2 }}>محجوز</div>}
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={doneCard}>
              <div style={{ color: C.text, fontWeight: 700, fontSize: 13 }}>{'⏰ '}{bookForm.time}</div>
              <span style={{ color: C.success, fontSize: 16 }}>✓</span>
            </div>
          )}
        </div>
      )}
      {step >= 5 && (
        <div style={{ background: C.surface, borderRadius: 16, padding: 16, border: '1px solid ' + C.border, marginBottom: 14 }}>
          <div style={{ marginBottom: 12 }}>
            <label style={label(6)}>🔬 نوع الكشف</label>
            <select style={inp()} value={bookForm.type} onChange={s('type')}>
              {BOOK_VISIT_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={label(6)}>📝 ملاحظات (اختياري)</label>
            <textarea
              style={{ ...inp(), minHeight: 55, resize: 'none' }}
              value={bookForm.notes || ''}
              onChange={s('notes')}
              placeholder="أي أعراض أو ملاحظات للطبيب..."
            />
          </div>
          <div style={{ background: C.bg, borderRadius: 12, padding: 12, marginBottom: 14, border: '1px solid ' + C.border }}>
            <div style={{ color: C.muted, fontSize: 11, fontWeight: 700, marginBottom: 8 }}>📋 ملخص الحجز</div>
            {bookingSummaryRows(bookForm, patient.isGuest).map(([icon, val]) => (
              <div key={icon} style={{ display: 'flex', gap: 10, marginBottom: 5, alignItems: 'center' }}>
                <span style={{ fontSize: 14 }}>{icon}</span>
                <span style={{ color: C.text, fontSize: 12 }}>{val}</span>
              </div>
            ))}
          </div>
          <button
            onClick={onBook}
            disabled={booking}
            style={{
              width: '100%',
              background: booking ? '#1a2840' : `linear-gradient(135deg,${C.accent},${C.teal})`,
              border: 'none',
              borderRadius: 14,
              padding: 14,
              color: C.bg,
              fontWeight: 800,
              fontSize: 15,
              cursor: 'pointer',
              fontFamily: 'inherit',
              opacity: booking ? 0.7 : 1,
              boxShadow: booking ? 'none' : '0 4px 20px ' + C.accent + '44'
            }}
          >{bookButtonLabel(booking)}</button>
        </div>
      )}
    </div>
  );
}
