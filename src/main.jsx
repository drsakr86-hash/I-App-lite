import React from 'react';
import ReactDOM from 'react-dom/client';
import { createClient } from '@supabase/supabase-js';
import './styles/legacy.css';
import { getPatient360, mapPatient360ToLegacyView } from './modules/patients/index.js';

// Phase 41 migration bridge: keep the proven production runtime intact while
// moving the shell/build system to Vite. New modules should use services/hooks
// rather than writing directly to the legacy runtime.
globalThis.React = React;
globalThis.ReactDOM = ReactDOM;
globalThis.supabase = { createClient };

// Phase 42: expose the extracted Patient service to the legacy runtime through
// a narrow migration boundary. The legacy UI can consume the new service now
// without importing React modules directly; later phases can remove the bridge.
globalThis.IAppModules = globalThis.IAppModules || {};
globalThis.IAppModules.patients = {
  getPatient360,
  mapPatient360ToLegacyView
};

const legacyScript = document.createElement('script');
legacyScript.src = '/legacy/app-runtime.js';
legacyScript.async = false;
legacyScript.onload = () => console.log('I-App legacy runtime loaded');
legacyScript.onerror = (e) => console.error('I-App legacy runtime failed to load', e);
document.body.appendChild(legacyScript);
