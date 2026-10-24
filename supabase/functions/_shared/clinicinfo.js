// Approved clinic information for the assistant. Built ONLY from verified sources:
//   * CLINICS (schedule.js: copy of the patient booking portal's schedule, address, phone),
//   * live prices / doctors from iapp_store (the same data the app shows),
//   * clinic-approved FAQ rows (wa_faq, written by the admin).
// If a topic has no data the answer is { available: false } and the assistant must hand over to the secretary instead of guessing.
import { CLINICS, workingDaysText, hoursText } from './schedule.js';

const clip = (s, n) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, n);

export function buildClinicInfo({ prices = [], doctors = [], faq = [] } = {}) {
  // Approved FAQ address rows ("عنوان ...") win over the built-in address: each row goes to the clinic with the LONGEST code contained in its topic.
  const faqList = Array.isArray(faq) ? faq : [];
  const addrFor = Object.fromEntries(CLINICS.map(c => [c.code, null]));
  for (const f of faqList) {
    if (!f || f.active === false || !f.topic || !f.answer || !/^\s*عنوان/.test(String(f.topic))) continue;
    const owner = CLINICS.filter(c => String(f.topic).includes(c.code)).sort((a, b) => b.code.length - a.code.length)[0];
    if (owner && !addrFor[owner.code]) addrFor[owner.code] = clip(f.answer, 300);
  }
  const location = CLINICS.map(c => `${addrFor[c.code] || `${c.name}: ${c.address}`} — هاتف ${c.phone}`).join('\n');
  const hours = CLINICS.map(c => `${c.name}: أيام العمل ${workingDaysText(c)} — ${hoursText(c)}`).join('\n');
  const priceRows = (Array.isArray(prices) ? prices : []).filter(p => p && p.name && p.price !== undefined && p.price !== null && String(p.price) !== '')
    .map(p => `${clip(p.name, 60)}${p.clinic ? ' (' + clip(p.clinic, 40) + ')' : ''}: ${clip(p.price, 12)} جنيه`);
  const docRows = (Array.isArray(doctors) ? doctors : []).filter(d => d && d.name).map(d => `${clip(d.name, 60)}${d.title ? ' — ' + clip(d.title, 80) : ''}`);
  const faqRows = (Array.isArray(faq) ? faq : []).filter(f => f && f.active !== false && f.topic && f.answer).map(f => `${clip(f.topic, 80)}: ${clip(f.answer, 1200)}`);
  return {
    location: { available: true, text: location },
    hours: { available: true, text: hours + '\nالحجز بنظام المواعيد (كل موعد ' + 10 + ' دقائق).' },
    prices: priceRows.length ? { available: true, text: priceRows.join('\n') } : { available: false },
    doctors: docRows.length ? { available: true, text: docRows.join('\n') } : { available: false },
    faq: faqRows.length ? { available: true, text: faqRows.join('\n') } : { available: false }
  };
}

export const INFO_TOPICS = ['location', 'hours', 'prices', 'doctors', 'faq'];
export function getInfo(info, topic) {
  if (topic === 'all' || !topic) return Object.fromEntries(INFO_TOPICS.map(t => [t, info[t]]));
  return INFO_TOPICS.includes(topic) ? { [topic]: info[topic] } : { error: 'UNKNOWN_TOPIC', topics: INFO_TOPICS };
}
