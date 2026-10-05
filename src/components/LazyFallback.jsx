import React from 'react';
import { t, getLang, dirOf } from '../modules/i18n/index.js';

// Loading placeholder for code-split screens (React.lazy). role="status" so it is announced.
export default function LazyFallback({ label = t('common.loading') }) {
  return (
    <div role="status" aria-live="polite" style={{ padding: 16, direction: dirOf(getLang()) }}>
      <div className="ds-skel" style={{ height: 18, width: '40%', marginBottom: 12 }} />
      <div className="ds-skel" style={{ height: 90, marginBottom: 10 }} />
      <div className="ds-skel" style={{ height: 90 }} />
      <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>{label}</span>
    </div>
  );
}
