# Baseline audit — 2026-10-01 source

Baseline: `npm ci` ok (2 moderate npm-audit advisories, not addressed), `npm test` **554 pass / 0 fail**, `npm run build` ok (one 800 kB chunk warning).
Architecture: Vite + React 18; `src/main.jsx` builds `globalThis.IAppModules` (bridge to formerly-legacy code; the legacy runtime file is already deleted, 122 comment references remain); sync engine = localStorage dirty keys + flusher over `iapp_store` / row tables; Core = Supabase RPCs. No SQL/migrations in the repo.

Status: **Fixed** = changed and covered by a test; **Open** = documented only.

| # | Sev | Where | Evidence | Impact | Status |
|---|---|---|---|---|---|
| 1 | High | `use-patient-file.js` request dedupe | legacy `imagingOrderId` is `'ORD-…'`, Core id numeric → `===` never true | every request with Core data shown twice | Fixed (identity keys) |
| 2 | High | `patients-orchestration.js saveExam` | diagnosis/treatment/follow-up create-RPCs on every save | duplicate Core rows on each edit | Fixed (change markers) |
| 3 | High | `RxTab` + Core mapping | Core `medicines` array rendered as React child | blank file / crash for Core-only Rx (verified React throws) | Fixed |
| 4 | High | `savePatientRadiologyRequest` | new `Date.now()` ids per click; success banner even when Core failed; `sbSet(list from failed read)` | duplicate visits/orders; possible loss of imaging orders list; false success | Fixed |
| 5 | High | Core load effect / images effect | no reset on patient change, image load without stale guard, Core file mapped with `patient.id` of the new patient | other patient's data can appear | Fixed (key remount, active guards, patient_code check) |
| 6 | High | Timeline | Core journey replaced all local events | offline-saved records vanish; no diagnoses without journey | Fixed |
| 7 | Med | visit shadows | `iapp_visits` fromRow drops `_coreId` | shadow + Core visit duplicates after reload | Fixed (deterministic alias) |
| 8 | Med | save paths | `console.warn` only; modals closed regardless | silent partial failures | Fixed (status bar) |
| 9 | Med | `ensureLegacyVisitShadow` | `visits` from render closure used after awaits | lost update | Fixed (ref) |
| 10 | Med | Print template | `b.date.localeCompare` on undefined; requests treated as last exam; no clinician | crash / wrong output | Fixed |
| 11 | Med | Image notes | write on every keystroke (read + queueSave) | write storm | Fixed (local edit, persist on blur) |
| 12 | Med | Deleting Core-only records | legacy delete is a no-op | record "reappears" | Fixed (refused with message) |
| 13 | Med | Tabs / chips | clickable `div`s | no keyboard access | Fixed in patient file |
| 14 | Low | `usePatient360`, duplicated mappers | unused hook; two copies of the mapping | divergence | Removed / delegated |
| 15 | High | Auth/roles | see SECURITY.md | role is client-side only | Open |
| 16 | Med | 74 empty `catch {}` blocks repo-wide | grep | silent failures | Open (patient-file path cleaned) |
| 17 | Med | `createClinicalVisitCore` vs `visit.service.createClinicalVisit` | two implementations | drift | Open |
| 18 | Low | single 800 kB bundle | build output | slow first load | Open |
| 19 | Med | Rx/exam whole-array writes to `iapp_store` | `setRx(updated)` | cross-device last-writer-wins (merge layer mitigates) | Open |
| 20 | Med | Rx edit | `iapp_create_prescription_core` re-called with same `p_legacy_id` on each edit | duplicate Core Rx if server is not upsert | Open (needs backend check) |
