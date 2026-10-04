// TopBar -- moved here from public/legacy/app-runtime.js (Phase 8, batch
// 18). Exact copy of the original JSX/logic, now a React component instead
// of a legacy function. Every dependency it needs (C, useSyncStatus,
// dirtyKeys, syncKeyLabel, flushAll, ThemeToggle) was already moved in
// earlier batches, so this one moves as a self-contained component.
import React from 'react';
import { C } from '../modules/theme/index.js';
import { useSyncStatus, dirtyKeys, syncKeyLabel, flushAll } from '../modules/sync/index.js';
import { ThemeToggle, LangToggle } from './common.jsx';
import { topBarSyncView, sessionDisplayText } from './topbar-model.js';

export default function TopBar({ backLabel, onBack, primary, onSearch, syncing, session, onLogout }) {
  const ini = (primary && primary.initial) || 'ع';
  const st = useSyncStatus();
  const { stBusy, stLabel, pendingLabels, title } = topBarSyncView(st, syncing, dirtyKeys, syncKeyLabel);
  const stColor = syncing && !st.offline ? C.gold : st.color;

  return (
    <div style={{
      background: `linear-gradient(135deg,${C.surface},${C.surface2})`,
      borderBottom: `1px solid ${C.border}`,
      padding: '0 16px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      height: 64,
      position: 'sticky',
      top: 0,
      zIndex: 200
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {backLabel ? (
          <div onClick={onBack} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: C.card, border: `1px solid ${C.border}`, borderRadius: 10,
            padding: '6px 12px', cursor: 'pointer', color: C.accent, fontSize: 13, fontWeight: 700
          }}>← رجوع</div>
        ) : (
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: `linear-gradient(135deg,${C.accent},${C.teal})`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 18, boxShadow: `0 0 14px ${C.accent}55`
          }}>👁</div>
        )}
        <div>
          <div style={{ color: C.text, fontWeight: 700, fontSize: 14 }}>{backLabel || 'I App'}</div>
          {!backLabel && (
            <div
              onClick={() => { if (st.pending > 0) flushAll(); }}
              title={title}
              style={{
                color: st.offline ? C.danger : C.muted,
                fontSize: 10,
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                cursor: st.pending > 0 ? 'pointer' : 'default'
              }}
            >
              <span style={{
                width: 6, height: 6, borderRadius: '50%',
                background: stColor, display: 'inline-block', boxShadow: `0 0 6px ${stColor}`
              }} />
              {stBusy ? stLabel : session ? sessionDisplayText(session, primary) : 'متصل ومحدّث'}
            </div>
          )}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        {!backLabel && <LangToggle />}
        {!backLabel && <ThemeToggle />}
        {!backLabel && onSearch && (
          <div onClick={onSearch} title="بحث" style={{
            width: 34, height: 34, borderRadius: 10, background: C.card, border: `1px solid ${C.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 15
          }}>🔍</div>
        )}
        {!backLabel && session && (
          <div
            onClick={() => window.dispatchEvent(new CustomEvent('iapp-open-settings'))}
            title="الإعدادات"
            style={{
              width: 34, height: 34, borderRadius: 10, background: C.card, border: `1px solid ${C.border}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 16, color: C.accent
            }}
          >⚙️</div>
        )}
        {!backLabel && onLogout && (
          <div onClick={onLogout} title="تسجيل الخروج" style={{
            width: 34, height: 34, borderRadius: 10, background: C.card, border: `1px solid ${C.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 15, color: C.danger
          }}>⏻</div>
        )}
        <div style={{
          width: 34, height: 34, borderRadius: '50%',
          background: `linear-gradient(135deg,${C.accent},${C.teal})`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 13, fontWeight: 700, color: C.bg
        }}>{ini}</div>
      </div>
    </div>
  );
}
