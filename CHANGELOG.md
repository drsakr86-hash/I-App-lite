# Changelog

## Unreleased
- Admin: pending patient booking requests now appear on the dashboard and the appointments screen with accept/reject (previously only the secretary screen read `iapp_booking_requests`). Status writes are checked, accepting twice never duplicates an appointment, and a request already handled elsewhere is reported.

## Patient 360 hardening — 2026-10-02 (baseline: source of 2026-10-01, commit 37356d1)

Tests 554 → 605 passing, build ok, render smoke test ok (logs in `docs/logs/`).

### Added
- `src/modules/patient-file/normalize.js` — canonical legacy/Core merge, stable identity keys, provenance, patient-ownership checks, canonical timeline. *Why: duplicates, cross-patient mixing, crash on Core medicines array.*
- `src/modules/patient-file/exam-core-sync.js` — per-step Core sync of an examination with change markers. *Why: every save re-created diagnosis/treatment/follow-up.*
- `src/modules/patient-file/request-workflow.js` — investigation request save/resync with stable draft id and honest result. *Why: double click duplicates, false success, possible order-list loss.*
- `src/screens/patient-file/StatusBar.jsx` — save / sync / offline / load-error status.
- Tests: `patient360-normalize`, `patient360-save-workflows`, `patient360-hook`, `patient360-print-permissions`; `tests/smoke/patient-file-render.smoke.jsx` (`npm run test:smoke`); dev dependency `react-test-renderer@18.3.1`.
- Docs: `docs/PATIENT360.md`, `AUDIT-BASELINE.md`, `SECURITY.md`, `security-recommendations.sql` (unexecuted), `REPORT.md`.

### Changed
- `use-patient-file.js` — rewritten around the normalisation layer: guarded async loads, memoised derived data, single refresh path, per-operation locks, unsaved-changes guard, Core-only delete refused, image notes persisted on blur, 10 MB upload limit, image→order link (local metadata).
- `patients-orchestration.js` — `saveExam/saveVisit/saveRx` return structured results and call `onLocalSaved`; visits written from a ref instead of a stale closure; a request with a recorded Core failure is not silently re-sent.
- `PatientsContainer.jsx` — `key={patient.id}` so no state leaks between patients.
- `PatientFile.jsx` and tabs — status bar, `tablist`/`tab` buttons, keyboard-operable chips, `data-rec` anchors, timeline "open source", request result messages and resync button, Core-record badges.
- `print/templates.js` — no crash on undated rows; requests excluded from "last exam"; examining clinician, exam history and Rx table added.
- `patients/patient.service.js` — `mapPatient360ToLegacyView` delegates to the canonical mappers. `README.md` — stale legacy-runtime line corrected.

### Removed
- `src/modules/patients/usePatient360.js` — no callers (verified by grep), a second divergent loading path.
