// A service price may be tied to one clinic (price.clinic = clinic name) or apply to all clinics (no clinic).
// For a given clinic: its own prices come first, then the general ones; other clinics' prices are ignored.
// Without a clinic the list is returned unchanged (old behaviour).
export const pricesForClinic = (prices, clinic) => {
  if (!clinic) return prices;
  const ok = prices.filter(p => !p.clinic || p.clinic === clinic);
  return [...ok.filter(p => p.clinic === clinic), ...ok.filter(p => !p.clinic)];
};

// Fallback when no price name matches the appointment type literally (the types are fixed wording such as "فحص روتيني",
// the price list is free text such as "كشف" / "استشاره"). Spelling is normalised (ة/ه, ى/ي, hamza forms); a consultation type
// maps to a price containing "استشار", the examination types map to a price containing "كشف". Surgery maps to nothing.
const norm = s => String(s || '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').trim();
const EXAM_TYPES = ['فحص روتيني', 'متابعة', 'قياس نظر', 'فحص شبكية'];
export const fallbackPrice = (list, type) => {
  const t = norm(type);
  if (!t) return undefined;
  const byName = list.find(p => p && p.name && (norm(p.name) === t || norm(p.name).includes(t) || t.includes(norm(p.name))));
  if (byName) return byName;
  const key = t.includes('استشار') ? 'استشار' : EXAM_TYPES.map(norm).includes(t) ? 'كشف' : null;
  return key ? list.find(p => p && p.name && norm(p.name).includes(key)) : undefined;
};
