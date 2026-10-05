import React from 'react';
import { useTheme } from '../modules/theme/index.js';
import { useLang } from '../modules/i18n/index.js';
import UnifiedErrorBoundary from './UnifiedErrorBoundary.jsx';
import UnifiedRouter from './UnifiedRouter.jsx';

// Exact port of the legacy runtime's ThemeRoot (public/legacy/app-runtime.js).
export default function ThemeRoot() {
  useTheme();
  const lang = useLang(); // the tree is re-mounted on a language change so every screen re-renders in the new language
  return (
    <UnifiedErrorBoundary>
      <UnifiedRouter key={lang} />
    </UnifiedErrorBoundary>
  );
}
