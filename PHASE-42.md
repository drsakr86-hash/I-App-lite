# Phase 42 — Patient / Patient 360 extraction

## Goal
Move Patient 360 data access from the monolithic runtime into a Vite/React service boundary without rewriting the working Patient UI.

## Implemented
- Added `src/modules/patients/patient.service.js` as the single Patient 360 read contract.
- Added bounded RPC access with the existing `Patient 360 → Summary → Legacy` fallback chain.
- Added `mapPatient360ToLegacyView()` for the existing Patient UI's Core examination/visit/prescription shapes.
- Added `usePatient360()` for future React components.
- Exposed the extracted Patient service through `globalThis.IAppModules.patients` as a temporary migration bridge.
- Updated the production PatientFile runtime to prefer the extracted Patient service and retain the direct-RPC fallback.
- Bumped package version to `42.0.0`.
- No database schema changes.
- No destructive data changes.

## Safety
The existing Patient UI remains in place. If the extracted service fails, the legacy RPC path remains available, so Phase 42 is reversible by removing the bridge/import.

## Verification
- Phase 41 baseline was already verified with Vite build and live `127.0.0.1:5173` runtime.
- Phase 42 modified JavaScript files pass Node syntax checks.
- Full Vite build should be re-run in Termux after copying this phase because the model environment does not retain the user's Termux `node_modules` cache.

## Next
Extract Patient 360 presentation and write operations into React components/services, then move Appointments/Queue.
