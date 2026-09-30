// Shared, dependency-light UI atoms moved out of
// public/legacy/app-runtime.js (Phase 8, batch 3): a status-color lookup, a
// couple of style/element helpers, and two small presentational components.
// The legacy runtime now delegates to this module (see the "const { SC, inp,
// Field, SecHead, Tag, XRAY_ICON } = window.IAppModules.ui;" line there)
// instead of redefining them, so legacy and React share the exact same
// functions/objects. Style logic lives in atoms-model.js (plain JS, unit
// tested); this file is the thin JSX layer on top of it.
import React from 'react';
import { fieldLabelStyle, secHeadLabelColor, tagStyle } from './atoms-model.js';

export { SC, inp, XRAY_ICON } from './atoms-model.js';

// Labeled form field wrapper.
export const Field = ({ label, children }) => (
  <div>
    <label style={fieldLabelStyle()}>{label}</label>
    {children}
  </div>
);

// Small section header with an icon and a colored label (defaults to the
// accent color).
export function SecHead({ icon, label, color }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
      <span style={{ fontSize: 14 }}>{icon}</span>
      <span style={{ color: secHeadLabelColor(color), fontWeight: 700, fontSize: 13 }}>{label}</span>
    </div>
  );
}

// Small colored pill label.
export function Tag({ label, color }) {
  return <span style={tagStyle(color)}>{label}</span>;
}
