// A service price may be tied to one clinic (price.clinic = clinic name) or apply to all clinics (no clinic).
// For a given clinic: its own prices come first, then the general ones; other clinics' prices are ignored.
// Without a clinic the list is returned unchanged (old behaviour).
export const pricesForClinic = (prices, clinic) => {
  if (!clinic) return prices;
  const ok = prices.filter(p => !p.clinic || p.clinic === clinic);
  return [...ok.filter(p => p.clinic === clinic), ...ok.filter(p => !p.clinic)];
};
