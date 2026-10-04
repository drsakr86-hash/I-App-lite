import React from 'react';
import { useTheme } from '../modules/theme/index.js';
import { useLang } from '../modules/i18n/index.js';
import UnifiedErrorBoundary from './UnifiedErrorBoundary.jsx';
import UnifiedRouter from './UnifiedRouter.jsx';

// Exact port of the legacy runtime's ThemeRoot (public/legacy/app-runtime.js).
export default function ThemeRoot() {
  useTheme();
  useLang(); // re-render the tree when the language changes
  return (
    <UnifiedErrorBoundary>
      <UnifiedRouter />
    </UnifiedErrorBoundary>
  );
}
