// The ONLY operations the language model can ask for. The model proposes; this layer validates every argument and the server
// decides. There is no SQL, no free table access, and no phone number / patient id / appointment id parameter anywhere:
//   * the sender's identity (wa_id) comes from the trusted conversation row, never from model output;
//   * appointments are referred to by opaque per-conversation refs (A1, A2...) created by list_my_appointments after a name check;
//   * writes are only PROPOSED here (stored in conversations.flow_state.pending). They are executed by assistant.js when the PATIENT's
//     next message is an explicit yes - model output alone can never create, change or cancel an appointment.
import { cleanPatientName, firstToken, normArabic, sanitizeIncoming } from './text.js';
import { CLINICS, DEFAULT_DOCTOR, DEFAULT_VISIT_TYPE, WEEK_DAY_NAMES, addDaysISO, availableSlots, clinicDays, clinicNow, findClinic, isISODate, isScheduledSlot, isoDow, normTime, BOOKING_DAYS_AHEAD } from './schedule.js';
import { getInfo, INFO_TOPICS } from './clinicinfo.js';

export const VISIT_TYPES = ['فحص روتيني', 'متابعة', 'استشارة', 'قياس نظر', 'فحص شبكية'];
export const PENDING_TTL_MIN = 15;
const MAX_REFS = 10;

export const TOOL_DEFINITIONS = [
  {
    name: 'get_clinic_info',
    description: 'معلومات العيادة المعتمدة فقط: العنوان، مواعيد العمل، الأسعار، الأطباء، تعليمات معتمدة. لو الموضوع available=false قل للمريض إنك مش متأكد وحوّله للسكرتارية.',
    input_schema: { type: 'object', properties: { topic: { type: 'string', enum: [...INFO_TOPICS, 'all'] } }, required: ['topic'] }
  },
  {
    name: 'list_available_slots',
    description: 'المواعيد المتاحة فعليًا. من غير date: أقرب أيام فيها مواعيد. مع date (YYYY-MM-DD): كل مواعيد اليوم المتاحة.',
    input_schema: { type: 'object', properties: { clinic: { type: 'string', enum: CLINICS.map(c => c.code) }, date: { type: 'string', description: 'YYYY-MM-DD' } }, required: ['clinic'] }
  },
  {
    name: 'propose_booking',
    description: 'اقتراح حجز بعد ما المريض يحدد العيادة والتاريخ والوقت ويقول اسمه بالكامل. ده مجرد اقتراح: النظام هيطلب من المريض التأكيد بنفسه. ممنوع تقول إن الحجز تم.',
    input_schema: { type: 'object', properties: { clinic: { type: 'string', enum: CLINICS.map(c => c.code) }, date: { type: 'string' }, time: { type: 'string', description: 'HH:MM' }, patient_name: { type: 'string' }, visit_type: { type: 'string', enum: VISIT_TYPES } }, required: ['clinic', 'date', 'time', 'patient_name'] }
  },
  {
    name: 'list_my_appointments',
    description: 'مواعيد المريض القادمة. لازم المريض يقول اسمه المسجل. بترجع مراجع (A1, A2...) تستخدمها في الإلغاء/التعديل.',
    input_schema: { type: 'object', properties: { patient_name: { type: 'string' } }, required: ['patient_name'] }
  },
  {
    name: 'propose_cancel',
    description: 'اقتراح إلغاء موعد (ref من list_my_appointments). النظام هيطلب تأكيد المريض.',
    input_schema: { type: 'object', properties: { ref: { type: 'string' } }, required: ['ref'] }
  },
  {
    name: 'propose_reschedule',
    description: 'اقتراح نقل موعد لتاريخ/وقت متاح (ref من list_my_appointments). النظام هيطلب تأكيد المريض.',
    input_schema: { type: 'object', properties: { ref: { type: 'string' }, date: { type: 'string' }, time: { type: 'string' } }, required: ['ref', 'date', 'time'] }
  },
  {
    name: 'request_human',
    description: 'تحويل المحادثة للسكرتارية: لما المريض يطلب، أو معلومة مش متاحة، أو سؤال طبي، أو شكوى، أو أي حاجة مش واثق منها.',
    input_schema: { type: 'object', properties: { reason: { type: 'string', enum: ['patient_requested', 'unknown_info', 'medical_question', 'complaint', 'unsure', 'other'] } }, required: ['reason'] }
  }
];

const dayLabel = iso => `${WEEK_DAY_NAMES[isoDow(iso)]} ${iso}`;
export const describeSlot = (clinic, date, time) => `${clinic.name} — ${dayLabel(date)} الساعة ${time}`;

// ctx: { store, conv:{id}, waId, config, now(), flow (mutable object persisted by the caller), latestMsgId, info }
export function createToolRuntime(ctx) {
  const tz = ctx.config.clinic_tz || 'Africa/Cairo';
  const nowDate = () => (ctx.now ? ctx.now() : new Date());
  const takenFor = async (clinic, date) => (await ctx.store.takenTimes(clinic.code, date)).map(normTime).filter(Boolean);

  const handlers = {
    async get_clinic_info({ topic }) { return getInfo(ctx.info, topic); },

    async list_available_slots({ clinic: c, date }) {
      const clinic = findClinic(c);
      if (!clinic) return { error: 'UNKNOWN_CLINIC', clinics: CLINICS.map(x => x.code) };
      if (date !== undefined && date !== null && date !== '') {
        if (!isISODate(date)) return { error: 'INVALID_DATE', hint: 'YYYY-MM-DD' };
        const slots = availableSlots(clinic, date, await takenFor(clinic, date), nowDate(), { tz });
        return { clinic: clinic.code, date, day: WEEK_DAY_NAMES[isoDow(date)], works_that_day: clinicDays(clinic).includes(isoDow(date)), count: slots.length, slots: slots.slice(0, 40) };
      }
      const today = clinicNow(nowDate(), tz).date, out = [];
      for (let i = 0; i <= BOOKING_DAYS_AHEAD && out.length < 4 && i < 21; i++) {
        const d = addDaysISO(today, i);
        if (!clinicDays(clinic).includes(isoDow(d))) continue;
        const slots = availableSlots(clinic, d, await takenFor(clinic, d), nowDate(), { tz });
        if (slots.length) out.push({ date: d, day: WEEK_DAY_NAMES[isoDow(d)], count: slots.length, first: slots.slice(0, 3), last: slots[slots.length - 1] });
      }
      return { clinic: clinic.code, working_days: clinicDays(clinic).map(d => WEEK_DAY_NAMES[d]), next_dates: out };
    },

    async propose_booking({ clinic: c, date, time, patient_name, visit_type }) {
      const clinic = findClinic(c); if (!clinic) return { error: 'UNKNOWN_CLINIC' };
      if (!isISODate(date)) return { error: 'INVALID_DATE' };
      const t = normTime(time); if (!t) return { error: 'INVALID_TIME' };
      const name = cleanPatientName(patient_name); if (!name) return { error: 'NAME_REQUIRED', hint: 'اطلب الاسم بالكامل' };
      const type = visit_type === undefined ? DEFAULT_VISIT_TYPE : (VISIT_TYPES.includes(visit_type) ? visit_type : null);
      if (!type) return { error: 'INVALID_VISIT_TYPE', allowed: VISIT_TYPES };
      if (!isScheduledSlot(clinic, date, t, nowDate(), { tz })) return { error: 'NOT_A_SLOT', hint: 'المعاد ده خارج مواعيد العيادة أو فات. استخدم list_available_slots' };
      if ((await takenFor(clinic, date)).includes(t)) return { error: 'SLOT_TAKEN', hint: 'المعاد محجوز. اعرض بدائل من list_available_slots' };
      ctx.flow.pending = { kind: 'book', args: { clinic: clinic.code, date, time: t, name, type }, created_msg_id: ctx.latestMsgId, expires_at: new Date(nowDate().getTime() + PENDING_TTL_MIN * 60000).toISOString() };
      return { ok: true, awaiting_patient_confirmation: true, summary: `${describeSlot(clinic, date, t)} — ${name} — ${type}`, instruction: 'اعرض الملخص على المريض واطلب منه يرد بـ "تأكيد". النظام هو اللي هينفذ ويبعت رسالة التأكيد. ممنوع تقول إن الحجز تم.' };
    },

    async list_my_appointments({ patient_name }) {
      const name = cleanPatientName(patient_name); if (!name) return { error: 'NAME_REQUIRED' };
      const rows = (await ctx.store.myAppointments(ctx.waId)).filter(r => firstToken(r.patient) !== '' && firstToken(r.patient) === firstToken(name)).slice(0, MAX_REFS);
      // same answer whether the number has no appointments or the name did not match: nothing is disclosed on a failed check
      if (!rows.length) { ctx.flow.refs = {}; return { found: 0 }; }
      ctx.flow.refs = {};
      const list = rows.map((r, i) => { const ref = 'A' + (i + 1); ctx.flow.refs[ref] = { id: r.id, clinic: r.clinic, date: r.date, time: r.time }; return { ref, clinic: r.clinic, day: WEEK_DAY_NAMES[isoDow(r.date)], date: r.date, time: r.time, confirmed: !!r.confirmed, type: r.type || null }; });
      return { found: list.length, appointments: list };
    },

    async propose_cancel({ ref }) {
      const a = ctx.flow.refs && ctx.flow.refs[String(ref)]; if (!a) return { error: 'UNKNOWN_REF', hint: 'استدعِ list_my_appointments الأول' };
      ctx.flow.pending = { kind: 'cancel', args: { ref: String(ref), id: a.id, clinic: a.clinic, date: a.date, time: a.time }, created_msg_id: ctx.latestMsgId, expires_at: new Date(nowDate().getTime() + PENDING_TTL_MIN * 60000).toISOString() };
      return { ok: true, awaiting_patient_confirmation: true, summary: `إلغاء موعد ${a.clinic} — ${dayLabel(a.date)} الساعة ${a.time}`, instruction: 'اطلب من المريض يرد بـ "تأكيد" عشان يتم الإلغاء. ممنوع تقول إنه اتلغى.' };
    },

    async propose_reschedule({ ref, date, time }) {
      const a = ctx.flow.refs && ctx.flow.refs[String(ref)]; if (!a) return { error: 'UNKNOWN_REF', hint: 'استدعِ list_my_appointments الأول' };
      const clinic = findClinic(a.clinic); if (!clinic) return { error: 'UNKNOWN_CLINIC' };
      if (!isISODate(date)) return { error: 'INVALID_DATE' };
      const t = normTime(time); if (!t) return { error: 'INVALID_TIME' };
      if (!isScheduledSlot(clinic, date, t, nowDate(), { tz })) return { error: 'NOT_A_SLOT' };
      if ((await takenFor(clinic, date)).includes(t)) return { error: 'SLOT_TAKEN' };
      ctx.flow.pending = { kind: 'reschedule', args: { ref: String(ref), id: a.id, clinic: a.clinic, from_date: a.date, from_time: a.time, date, time: t }, created_msg_id: ctx.latestMsgId, expires_at: new Date(nowDate().getTime() + PENDING_TTL_MIN * 60000).toISOString() };
      return { ok: true, awaiting_patient_confirmation: true, summary: `نقل موعد ${a.clinic} من ${dayLabel(a.date)} ${a.time} إلى ${dayLabel(date)} الساعة ${t}`, instruction: 'اطلب من المريض يرد بـ "تأكيد". ممنوع تقول إنه اتعدل.' };
    },

    async request_human({ reason }) {
      const allowed = ['patient_requested', 'unknown_info', 'medical_question', 'complaint', 'unsure', 'other'];
      await ctx.store.handoff(ctx.conv.id, allowed.includes(reason) ? reason : 'other', true);
      ctx.flow.handedOff = true;
      return { ok: true, note: 'المحادثة اتحولت للسكرتارية والمريض هيستلم إشعار. متكتبش حاجة تانية.' };
    }
  };

  return {
    definitions: TOOL_DEFINITIONS,
    async execute(name, input) {
      const fn = handlers[name];
      if (!fn) return { error: 'UNKNOWN_TOOL' };
      if (input === null || typeof input !== 'object' || Array.isArray(input)) return { error: 'INVALID_ARGUMENTS' };
      const clean = {};
      for (const [k, v] of Object.entries(input)) clean[k] = typeof v === 'string' ? sanitizeIncoming(v, 200) : v;   // model output is not trusted either
      try { return await fn(clean); } catch (e) { return { error: 'INTERNAL', detail: String(e && e.message || e).slice(0, 120) }; }
    }
  };
}
export { normArabic };
