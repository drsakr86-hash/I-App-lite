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
    bg: '#0A0F1E',
    bg2: '#0a1220',
    surface: '#111827',
    surface2: '#0D1929',
    card: '#141E30',
    border: '#1E2D45',
    accent: '#00C2FF',
    teal: '#00E5CC',
    gold: '#FFB830',
    text: '#E8F4FF',
    muted: '#6B8CAE',
    danger: '#FF4D6D',
    success: '#00E5B0',
    purple: '#A78BFA'
  },
  light: {
    bg: '#F2F6FB',
    bg2: '#FFFFFF',
    surface: '#FFFFFF',
    surface2: '#EAF1F9',
    card: '#FFFFFF',
    border: '#D3DEEB',
    accent: '#0077B6',
    teal: '#008F86',
    gold: '#B86E00',
    text: '#0F1B2D',
    muted: '#566B84',
    danger: '#D6304F',
    success: '#0A8F65',
    purple: '#6D4FD1'
  }
};

// Mutated in place (Object.assign) rather than replaced, so every holder of
// this reference (legacy closures, React components via the bridge) sees the
// new colors without needing to be told the object changed.
export const C = { ...THEMES.dark };

let _theme = 'dark';
try {
  if (localStorage.getItem('iapp_theme') === 'light') _theme = 'light';
} catch {}

const themeSubs = new Set();

export function getTheme() {
  return _theme;
}

export function applyTheme(t) {
  _theme = t;
  Object.assign(C, THEMES[t]);
  try {
    localStorage.setItem('iapp_theme', t);
  } catch {}
  try {
    document.documentElement.setAttribute('data-theme', t);
    document.documentElement.style.background = C.bg;
    document.body.style.background = C.bg;
    const m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute('content', C.bg);
  } catch {}
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
