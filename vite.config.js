import { defineConfig } from 'vite';

// Relative base so the build works from any sub-path
// (e.g. https://<user>.github.io/<repo>/) as well as from a root domain.
export default defineConfig({ base: './' });
