// The app's shared color theme — moved here from public/legacy/app-runtime.js
// (Phase 8, batch 1). This is now the ONE place the theme object and store
// live; the legacy runtime delegates to this module (see the
// "const { THEMES, C, ... } = window.IAppModules.theme;" line there) so every
// consumer, legacy or React, reads and mutates the exact same `C` object and
// shares the exact same subscriber set. Behavior is an exact copy of the
// original: same palettes, same localStorage key ("iapp_theme"), same DOM
// side effects on toggle (data-theme attribute, body/html background,
// <meta name="theme-color">).
//
// localStorage/document access is wrapped in try/catch exactly as it was in
// legacy, which also means this module loads safely outside a browser (e.g.
// under node:test, where those globals don't exist and the catch swallows
// the ReferenceError) — see tests/theme.test.js.

import { useState, useEffect } from 'react';

export const THEMES = {
  dark: {
    bg: '#0B1220',
    bg2: '#0E1627',
    surface: '#111B2E',
    surface2: '#0F1829',
    card: '#142038',
    border: '#243550',
    accent: '#2BA8B8',
    teal: '#22B8A8',
    gold: '#E8A33D',
    text: '#EAF1FA',
    muted: '#8196B3',
    danger: '#E5575F',
    success: '#2FB67C',
    purple: '#8F83E8'
  },
  light: {
    bg: '#F4F7FB',
    bg2: '#FFFFFF',
    surface: '#FFFFFF',
    surface2: '#EDF2F8',
    card: '#FFFFFF',
    border: '#D5DFEB',
    accent: '#0B7A88',
    teal: '#0E8F82',
    gold: '#A8650A',
    text: '#0E1A2B',
    muted: '#51657F',
    danger: '#C93A44',
    success: '#13845A',
    purple: '#5E49C4'
  }
};

// Mutated in place (Object.assign) rather than replaced, so every holder of
// this reference (legacy closures, React components via the bridge) sees the
// new colors without needing to be told the object changed.
export const C = { ...THEMES.dark };

let _theme = 'dark';
try {
  if (localStorage.getItem('iapp_theme') === 'light') _theme = 'light';
} catch { /* storage unavailable (private mode / quota): non-fatal */ }

const themeSubs = new Set();

export function getTheme() {
  return _theme;
}

export function applyTheme(t) {
  _theme = t;
  Object.assign(C, THEMES[t]);
  try {
    localStorage.setItem('iapp_theme', t);
  } catch { /* storage unavailable (private mode / quota): non-fatal */ }
  try {
    document.documentElement.setAttribute('data-theme', t);
    for (const [k, v] of Object.entries(C)) if (['bg','surface','card','border','accent','teal','gold','text','muted','danger','success'].includes(k)) document.documentElement.style.setProperty('--c-' + k, v);
    document.documentElement.style.background = C.bg;
    document.body.style.background = C.bg;
    const m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute('content', C.bg);
  } catch { /* no DOM (tests / non-browser): non-fatal */ }
}

export function setTheme(t) {
  applyTheme(t);
  themeSubs.forEach(f => f(t));
}

export function useTheme() {
  const [t, setT] = useState(_theme);
  useEffect(() => {
    themeSubs.add(setT);
    setT(_theme);
    return () => {
      themeSubs.delete(setT);
    };
  }, []);
  return t;
}

// Apply the theme resolved above right away, same as legacy did at module
// load — so the very first paint (legacy or React) already has the right
// colors, before any component mounts.
applyTheme(_theme);
