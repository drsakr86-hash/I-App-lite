import React, { useEffect } from 'react';
import {
  isWarnToast, toastDuration, toastText, btnStyle, nextTheme, themeToggleTitle, themeToggleIcon
} from './common-model.js';
import { C, useTheme, setTheme } from '../modules/theme/index.js';

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

// Bottom sheet. Closes on backdrop click and on "×" (no Escape-key handling,
// same as legacy); clicks inside the sheet do not reach the backdrop.
export function Modal({ title, onClose, children }) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.8)',
        zIndex: 400,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center'
      }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: C.surface,
          borderRadius: '20px 20px 0 0',
          padding: '20px 16px 44px',
          width: '100%',
          maxWidth: 480,
          maxHeight: '92vh',
          overflowY: 'auto',
          border: `1px solid ${C.border}`
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <span style={{ color: C.text, fontWeight: 700, fontSize: 15 }}>{title}</span>
          <span onClick={onClose} style={{ color: C.muted, fontSize: 28, cursor: 'pointer', lineHeight: 1 }}>×</span>
        </div>
        {children}
      </div>
    </div>
  );
}

// Backdrop click and "×" both call onNo (it is the Modal's onClose).
export function Confirm({ msg, onOk, onNo }) {
  return (
    <Modal title="تأكيد" onClose={onNo}>
      <p style={{ color: C.muted, fontSize: 13, marginBottom: 20 }}>{msg}</p>
      <div style={{ display: 'flex', gap: 10 }}>
        <Btn outline full onClick={onNo}>إلغاء</Btn>
        <Btn danger full onClick={onOk}>تأكيد</Btn>
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
        left: '50%',
        transform: 'translateX(-50%)',
        background: warn ? C.gold : C.success,
        color: C.bg,
        borderRadius: 14,
        padding: '10px 22px',
        fontWeight: 700,
        fontSize: 13,
        zIndex: 999,
        whiteSpace: 'nowrap',
        boxShadow: `0 4px 20px ${warn ? C.gold : C.success}66`,
        animation: 'toastIn 0.3s ease'
      }}
    >{toastText(msg, warn)}</div>
  );
}

// Uses the legacy theme store, so toggling here re-themes the whole app
// (ThemeRoot subscribes to the same store) and persists to iapp_theme.
export function ThemeToggle() {
  const t = useTheme();
  return (
    <div
      onClick={() => setTheme(nextTheme(t))}
      title={themeToggleTitle(t)}
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
    >{themeToggleIcon(t)}</div>
  );
}
