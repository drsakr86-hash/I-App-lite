// Pure logic for the shared UI atoms in src/components/common.jsx (no DOM /
// React). Every value mirrors the legacy runtime's Btn / Toast / ThemeToggle
// expressions exactly (public/legacy/app-runtime.js).

import { t } from '../modules/i18n/index.js';

// ---- Toast -------------------------------------------------------------------

// A toast whose text starts with "⚠" is a warning: gold, shown longer, and
// printed as-is. Anything else is a success toast: green, "✓ " prefix.
export const TOAST_MS = 2200;
export const TOAST_WARN_MS = 4000;

export const isWarnToast = msg => typeof msg === 'string' && msg.startsWith('⚠');
export const toastDuration = warn => (warn ? TOAST_WARN_MS : TOAST_MS);
export const toastText = (msg, warn) => (warn ? msg : '✓ ' + msg);

// ---- Btn ---------------------------------------------------------------------

// Style object for the shared button. Precedence (legacy): outline beats
// danger beats color; `color` only changes the first gradient stop.
export const btnStyle = (C, { danger, full, small, outline, color } = {}) => {
  const bg = color || C.accent;
  return {
    background: outline ? 'transparent' : danger ? `linear-gradient(135deg,${C.danger},#aa0020)` : `linear-gradient(135deg,${bg},${C.teal})`,
    border: outline ? `1px solid ${C.border}` : 'none',
    borderRadius: 10,
    padding: small ? '6px 14px' : '11px 18px',
    color: outline ? C.muted : C.bg,
    fontWeight: 700,
    fontSize: small ? 11 : 13,
    cursor: 'pointer',
    width: full ? '100%' : 'auto',
    whiteSpace: 'nowrap',
    fontFamily: 'inherit'
  };
};

// ---- ThemeToggle -------------------------------------------------------------

export const nextTheme = theme => (theme === 'dark' ? 'light' : 'dark');
export const themeToggleTitle = theme => (theme === 'dark' ? t('g3.common.themeLight') : t('g3.common.themeDark'));
export const themeToggleIcon = theme => (theme === 'dark' ? '☀️' : '🌙');
