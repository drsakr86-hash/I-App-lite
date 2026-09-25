import React from 'react';
import ReactDOM from 'react-dom/client';
import { createClient } from '@supabase/supabase-js';
import './styles/legacy.css';

globalThis.React = React;
globalThis.ReactDOM = ReactDOM;
globalThis.supabase = { createClient };

// Phase 41 migration bridge.
// Load the proven production runtime only after the globals above exist.
(async () => {
  try {
    await import('../legacy/app-runtime.js');
  } catch (error) {
    console.error('I-App legacy runtime failed to load:', error);
    const root = document.getElementById('root');
    if (root) {
      root.innerHTML = `
        <div style="padding:24px;font-family:Arial;direction:rtl">
          <h2>تعذر تحميل التطبيق</h2>
          <p>حدث خطأ أثناء تحميل النظام.</p>
          <pre style="white-space:pre-wrap">${String(error?.message || error)}</pre>
        </div>
      `;
    }
  }
})();
