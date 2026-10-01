# Technical report — I-App-lite Patient 360 (2026-10-02)

## 1. Implemented and verified (automated)
Counts: `npm test` 605/605 pass (554 baseline + 51 new), `npm run build` ok, `npm run test:smoke` all passed (all 9 tabs and 4 modals render with synthetic data incl. Core medicines array).
- Legacy/Core merge and de-duplication by stable ids; shadow-visit alias; no merging of same-date/same-test records with different ids; foreign-patient rows/files rejected; malformed payloads never throw.
- Encounter linkage carried (`_coreVisitId`); Core diagnoses/treatments/follow-ups on the timeline without duplicating the exam they mirror; offline-only records stay on the timeline; ordering and stable keys.
- Exam Core sync: unchanged values are not re-created; per-step partial results; no automatic retry.
- Investigation request: single draft id, resume after partial failure without a second visit/order, offline = local-only, RPC without id ≠ success, double click = one write, network failure reported accurately.
- Patient switching during an in-flight Core load (remount and same-instance cases); Core load failure keeps legacy data; unsaved-changes guard; Core-only delete refused; honest saved/local-only/partial/failed status for exam saves.
- Print HTML: undated rows, escaping, clinician, request exclusion, other-patient isolation.

## 2. Implemented but not fully verified
- Behaviour against the real Supabase project (nothing was run against it): whether stable legacy ids actually prevent duplicates server-side; whether the Core field names read by the mapper exist.
- Browser-only behaviour: RTL layout, scroll/highlight on "open source", `window.confirm` flows, keyboard operation, print preview rendering (only the HTML string is tested).
- Image upload to Cloudinary and the metadata write path (code path rewritten, not executed; no network from this environment).
- "Resync" action and later flush of offline-queued writes for the new paths (uses existing `sbMutate` offline fallback; the later flush was not exercised).
- Image→order link is local metadata only (no Core imaging study is created from the patient file; Imaging Center still owns that).

## 3. Recommended, not implemented
- Role-based RLS/RPC grants (see SECURITY.md); server-side role source instead of `iapp_users`.
- Decide logout policy for PHI cached in localStorage; signed/authenticated Cloudinary delivery.
- Verify/enforce idempotency of create RPCs; update paths for diagnosis/treatment/follow-up; follow-up *reason* is still the fixed text «متابعة» (the exam form has no reason field).
- Persist `_coreId` in the `iapp_visits` row mapping (would remove the need for the alias).
- Conflict-resolution UI for offline edits beyond the existing three-way merge; audit entries for edits (today only deletions call `logAudit`).
- Replace the other ~70 empty `catch {}` blocks; unify the two `createClinicalVisit` implementations; code-split the 800 kB bundle; structured history/allergy/complaint entry beyond the existing patient fields.

## 4. Blocked by missing backend/schema information
Table/column definitions, RLS policies, RPC signatures and idempotency semantics, `iapp_staff` columns. The repository contains no migrations; nothing was invented (see `PATIENT360.md` "Verification still required").

## Acceptance scenarios (Phase I)
| # | Scenario | Status |
|---|---|---|
| 1 | Create patient, open file | Not run (code unchanged) |
| 2–3 | Visit/exam/diagnosis/treatment/Rx | Save status + sync steps tested with mocks; not run end-to-end |
| 4 | Imaging request, attach study | Request tested; attaching a Core study not changed/run |
| 5 | Follow-up | Via exam sync, tested with mocks |
| 6 | Reopen & verify timeline | Timeline tested on merged fixtures |
| 7 | Edit and see changes consistently | Edit does not duplicate Core rows (tested); not run in a browser |
| 8 | Switch patients while loading | Tested |
| 9 | Network failure during save | Tested (request, exam) |
| 10 | Duplicate submit / offline sync | Duplicate tested; offline result tested, later flush not tested |
| 11 | Print | HTML tested, not previewed |
| 12 | Role access | Matrix only; real enforcement is backend and unverified |

## Remaining production risks (priority order)
1. Role enforcement is client-side only; all staff have the same DB access (High).
2. Create RPC idempotency unverified: retries/edits may still duplicate Core rows (High).
3. PHI cached unencrypted in localStorage and public Cloudinary URLs (Medium–High).
4. Whole-array writes of exams/prescriptions to `iapp_store` (cross-device last-writer-wins, mitigated by the merge layer) (Medium).
5. Silent `catch {}` blocks outside the patient file (Medium).
6. No browser/e2e test suite; UI verified by render smoke test only (Medium).
