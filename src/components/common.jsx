import React, { useEffect } from 'react';
import {
  isWarnToast, toastDuration, toastText, btnStyle, nextTheme, themeToggleTitle, themeToggleIcon
} from './common-model.js';
import { C, useTheme, setTheme } from '../modules/theme/index.js';
import { useLang, setLang, t, getLang, dirOf } from '../modules/i18n/index.js';

// Shared UI atoms for both the React screens and the legacy runtime.
// Phase 8, batch 6: these used to be duplicated — one copy here, one copy
// defined inline in public/legacy/app-runtime.js, kept behaviorally in sync
// by hand. The legacy runtime now delegates to this single copy via the
// bridge (window.IAppModules.common) instead of redefining them, so there is
// exactly one Btn/Modal/Confirm/Toast/ThemeToggle function shared everywhere.
// C/useTheme/setTheme come straight from the theme module (Phase 8, batch 1)
// rather than through the IAppLegacy bridge, since that module is already the
// single source of truth for the theme and importing it directly removes the
// last runtime dependency these components had on the legacy script.

export function Btn({ children, onClick, danger, full, small, outline, color }) {
  return (
    <button onClick={onClick} style={btnStyle(C, { danger, full, small, outline, color })}>{children}</button>
  );
}

// Accessible dialog (bottom sheet on phones, centered on tablet/desktop -- see .ds-modal in
// tokens.css). role="dialog" + aria-modal + aria-labelledby; ESC closes; focus moves into the
// dialog, is kept inside while it is open (Tab cycles) and returns to the opener on close.
// Clicks inside the sheet do not reach the backdrop.
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
let modalSeq = 0;
export function Modal({ title, onClose, children }) {
  const ref = React.useRef(null);
  const closeRef = React.useRef(onClose);
  closeRef.current = onClose;
  const [titleId] = React.useState(() => 'modal-title-' + (++modalSeq));
  useEffect(() => {
    if (typeof document === 'undefined') return undefined; // no DOM (server render / node tests)
    const opener = document.activeElement;
    const node = ref.current;
    if (node) {
      const first = node.querySelector(FOCUSABLE);
      try { (first || node).focus(); } catch { /* element not focusable: non-fatal */ }
    }
    const onKey = e => {
      if (e.key === 'Escape') { e.stopPropagation(); closeRef.current && closeRef.current(); return; }
      if (e.key !== 'Tab' || !ref.current) return;
      const items = Array.from(ref.current.querySelectorAll(FOCUSABLE));
      if (!items.length) { e.preventDefault(); return; }
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      try { if (opener && opener.focus && document.contains(opener)) opener.focus(); } catch { /* opener gone: non-fatal */ }
    };
  }, []);
  return (
    <div className="ds-modal-backdrop" onClick={onClose}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="ds-modal"
        onClick={e => e.stopPropagation()}
        style={{ direction: dirOf(getLang()), paddingBottom: 32 }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <span id={titleId} style={{ color: C.text, fontWeight: 700, fontSize: 15 }}>{title}</span>
          <button
            type="button"
            aria-label={t('common.close')}
            onClick={onClose}
            style={{ color: C.muted, fontSize: 26, cursor: 'pointer', lineHeight: 1, background: 'transparent', border: 'none', minWidth: 44, minHeight: 44 }}
          >×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// Backdrop click and "×" both call onNo (it is the Modal's onClose).
export function Confirm({ msg, onOk, onNo }) {
  return (
    <Modal title={t('g3.common.confirm')} onClose={onNo}>
      <p style={{ color: C.muted, fontSize: 13, marginBottom: 20 }}>{msg}</p>
      <div style={{ display: 'flex', gap: 10 }}>
        <Btn outline full onClick={onNo}>{t('g3.common.cancel')}</Btn>
        <Btn danger full onClick={onOk}>{t('g3.common.confirm')}</Btn>
      </div>
    </Modal>
  );
}

// Auto-dismiss: onDone after 2200 ms (4000 ms for "⚠" warnings). The timer
// restarts only when msg changes (legacy deps [msg]; onDone is the one from
// the render that started it). Extra props (e.g. `color`) are ignored.
export function Toast({ msg, onDone }) {
  const warn = isWarnToast(msg);
  useEffect(() => {
    const t = setTimeout(onDone, toastDuration(warn));
    return () => clearTimeout(t);
  }, [msg]);
  return (
    <div
      style={{
        position: 'fixed',
        bottom: 80,
        left: '50%', // centring trick with translateX(-50%): intentionally physical
        transform: 'translateX(-50%)',
        background: warn ? C.gold : C.success,
        color: C.bg,
        borderRadius: 14,
        padding: '10px 22px',
        fontWeight: 700,
        fontSize: 13,
        zIndex: 999,
        whiteSpace: 'nowrap',
        boxShadow: '0 2px 10px rgba(0,0,0,0.25)',
        animation: 'toastIn 0.3s ease'
      }}
    >{toastText(msg, warn)}</div>
  );
}

// Arabic <-> English switch (persisted in iapp_lang). Screens that call t() follow it.
export function LangToggle() {
  const lang = useLang();
  return (
    <button
      type="button"
      onClick={() => setLang(lang === 'en' ? 'ar' : 'en')}
      aria-label={lang === 'en' ? t('g3.common.switchToAr', lang) : t('g3.common.switchToEn', lang)}
      title={t('lang.toggle', lang)}
      style={{
        minWidth: 44, height: 34, padding: '0 8px', borderRadius: 10, background: C.card, border: `1px solid ${C.border}`,
        color: C.text, cursor: 'pointer', fontSize: 12, fontWeight: 700, flexShrink: 0
      }}
    >{t('lang.toggle', lang)}</button>
  );
}

// Uses the legacy theme store, so toggling here re-themes the whole app
// (ThemeRoot subscribes to the same store) and persists to iapp_theme.
export function ThemeToggle() {
  const theme = useTheme();
  useLang();
  return (
    <div
      onClick={() => setTheme(nextTheme(theme))}
      title={themeToggleTitle(theme)}
      style={{
        width: 34,
        height: 34,
        borderRadius: 10,
        background: C.card,
        border: `1px solid ${C.border}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        fontSize: 15,
        flexShrink: 0
      }}
    >{themeToggleIcon(theme)}</div>
  );
}
