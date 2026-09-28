// Pure decision logic behind useNewScreen() in the legacy runtime.
//
// Phase 7: React is now the default UI for everyone, per screen — ?ui=legacy
// is the remembered opt-out (mirroring how ?ui=react used to be the
// remembered opt-in before this phase). Side effects (reading the URL,
// reading/writing localStorage) stay in app-runtime.js; this only decides
// what to store and what a stored value means.

// What to write to localStorage for a screen's key, given the current
// ?ui query value. Returns null when there's nothing to write (no explicit
// choice was made on this page load) — the caller should leave the existing
// stored value untouched in that case.
export function screenPreferenceToStore(queryUi) {
  if (queryUi === 'react') return 'react';
  if (queryUi === 'legacy') return 'legacy';
  return null;
}

// Whether a screen should render its new React version, given the stored
// per-device preference (null/undefined when nothing was ever stored).
// Defaults to true (React) now — the explicit opt-out is the "legacy" value.
export function isNewScreenPreferred(storedPref) {
  return storedPref !== 'legacy';
}
