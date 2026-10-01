import React from 'react';
import { C } from '../modules/theme/index.js';

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
