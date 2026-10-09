import React from 'react';
import { C } from '../modules/theme/index.js';
import { isChunkLoadError, recoverFromStaleChunk } from './chunk-recovery.js';

// Exact port of the legacy runtime's UnifiedErrorBoundary
// (public/legacy/app-runtime.js) -- a plain top-level React error boundary.
export default class UnifiedErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(e) {
    return { error: e };
  }
  componentDidCatch(e, info) {
    console.error('I App render error:', e, info);
  }
  render() {
    if (this.state.error && isChunkLoadError(this.state.error)) {
      // A new version was deployed while this page was open: reload to the new build (one click, never automatic here).
      return (
        <div style={{ position: 'fixed', inset: 0, background: C.bg, color: C.text, padding: 24, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
          <div style={{ fontSize: 18 }}>تم تحديث التطبيق — اضغط تحديث للمتابعة</div>
          <div style={{ fontSize: 14, opacity: 0.8 }}>The app was updated — reload to continue</div>
          <button type="button" onClick={() => recoverFromStaleChunk(globalThis, { force: true })}
            style={{ padding: '12px 28px', fontSize: 16, borderRadius: 10, border: 'none', background: C.accent, color: '#fff', cursor: 'pointer' }}>
            تحديث · Reload
          </button>
        </div>
      );
    }
    if (this.state.error) {
      return (
        <div
          style={{
            position: 'fixed', inset: 0, background: C.bg, color: C.danger, fontFamily: 'monospace',
            fontSize: 12, padding: 24, overflow: 'auto', direction: 'ltr', whiteSpace: 'pre-wrap'
          }}
        >
          ⚠ I App — Render Error:{'\n\n'}{this.state.error.message}{'\n\n'}{this.state.error.stack || ''}
        </div>
      );
    }
    return this.props.children;
  }
}
