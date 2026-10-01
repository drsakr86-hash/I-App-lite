// BottomNav -- moved here from public/legacy/app-runtime.js (Phase 8,
// batch 18). Exact copy of the original JSX/logic, now a React component
// instead of a legacy function. Its only dependencies (C, XRAY_ICON) were
// already moved in earlier batches, so this one moves as a self-contained
// component.
import React from 'react';
import { C } from '../modules/theme/index.js';
import { XRAY_ICON } from '../modules/ui/atoms.jsx';
import { navItemsForRole } from './bottomnav-model.js';

export default function BottomNav({ active, setActive, role }) {
  const items = navItemsForRole(role);
  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, maxWidth: 480, margin: '0 auto',
      background: C.surface, borderTop: `1px solid ${C.border}`,
      display: 'flex', justifyContent: 'space-around', alignItems: 'center', height: 64, zIndex: 200
    }}>
      {items.map(item => (
        <button
          key={item.id}
          onClick={() => setActive(item.id)}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '4px 10px'
          }}
        >
          <div style={{
            fontSize: 20,
            filter: active === item.id ? `drop-shadow(0 0 6px ${C.accent})` : 'none',
            transform: active === item.id ? 'scale(1.2)' : 'scale(1)',
            transition: 'all 0.2s'
          }}>
            {item.icon === 'xray' ? (
              <img
                src={XRAY_ICON}
                style={{
                  width: 24, height: 24, display: 'block',
                  filter: active === item.id ? `drop-shadow(0 0 6px ${C.accent}) brightness(1.3)` : 'brightness(0.75)'
                }}
              />
            ) : item.icon}
          </div>
          <span style={{ fontSize: 9, fontWeight: 600, color: active === item.id ? C.accent : C.muted }}>{item.label}</span>
        </button>
      ))}
    </div>
  );
}
