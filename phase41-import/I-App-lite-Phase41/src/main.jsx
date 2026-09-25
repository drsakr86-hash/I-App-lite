import React from 'react';
import ReactDOM from 'react-dom/client';
import { createClient } from '@supabase/supabase-js';
import './styles/legacy.css';

// Phase 41 migration bridge: keep the proven production runtime intact while
// moving the shell/build system to Vite. New modules should use services/hooks
// rather than writing directly to the legacy runtime.
globalThis.React = React;
globalThis.ReactDOM = ReactDOM;
globalThis.supabase = { createClient };

await import('../legacy/app-runtime.js');
