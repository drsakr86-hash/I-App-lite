# External Review Brief — I App Lite "Clinical Refinement" change set

**Purpose of this document:** to let an independent reviewer (e.g. ChatGPT) evaluate the changes in the attached zip critically. Please look for bugs, risky assumptions, over-claims, and anything that would harm patient data safety or clinical correctness. Do not assume the claims below are true — verify them against the code.

## 1. Context
- App: Arabic (RTL) clinic management / EMR for an ophthalmology clinic in Egypt. React 18 + Vite 6 + Supabase (PostgreSQL + RLS), offline-first with a local sync queue, deployed on GitHub Pages. ~10.5k lines, mostly inline styles.
- Owner: a single ophthalmologist (non-professional developer). Server-side staff roles are only `admin` and `secretary` (4 accounts); the "doctor" role exists only client-side.
- Hard constraints given to the AI engineer: do not rewrite from scratch; do not remove working features; do not invent backend APIs; no fake clinical values; no claiming success without testing; no production data changes without authorization; never show "saved" if the server write failed; avoid logging PHI.
- Baseline (measured before changes): 620 tests passing, single JS bundle 831.80 kB.

## 2. What changed (summary)
**Security / honesty (client side)**
- `staff-login.js`: first-ever login is no longer auto-promoted to admin; admin creation requires a successful server read of the user list AND `iapp_is_admin()` RPC = true; a locally stored "admin" is downgraded if the server explicitly answers false (kept if unknown/offline).
- `sync/phi-purge.js`: on sign-out, cached `iapp_*` localStorage data is purged except keys with unsynced changes (`iapp_dirty_*`/`iapp_base_*`) and a small keep-list; service worker clears the cached-images cache on message.
- `patient-file/save-state.js`: pure interpreter that maps write results to `saved | local-only | partial | failed | saving`; success text only if every attempted destination succeeded. Also a 5-state connection indicator (online / saving / pending sync / partial / failed).
- `services/logger.js`: `logError()` strips emails and long digit runs, allow-lists id keys, ring buffer of 50.
- ~80 empty `catch {}` blocks removed: ~12 real fixes (e.g. booking-request accept now checks the status-update error and prevents double-accept), the rest annotated with reasons. A test scans the source for empty catches.

**Clinical features (all pure, unit-tested modules)**
- `clinical-summary.js` — Patient 360 summary: latest BCVA/IOP/CMT/refraction **per eye with their own date**, primary and per-eye diagnosis, treatment, next/overdue follow-up, pending investigations, alerts. Missing → "غير مسجل". No estimation.
- `ophth.js` — optional structured exam object `exam.ophth` (UCVA, PH, IOP method, refraction, anterior/posterior parts, C/D, CMT, VF MD, per-eye diagnosis, follow-up reason). Backward compatible; flat legacy fields remain the source for BCVA/IOP/plan/follow-up. Structured text is mirrored into flat fields inside a regenerated block after the marker `— تفصيل منظّم —` so the existing Core RPCs still receive it. `applyOphthToExam` is idempotent.
- `longitudinal.js` — time series per eye, change between last two points, overall change, injection intervals, a "treatment response" classification (CMT/VA after first injection). VA → logMAR **only for trend detection**. Display thresholds: VA 0.2 logMAR, IOP 3 mmHg (high >21), CMT 10 %, C/D 0.1, MD 2 dB — these are display heuristics, stated in the UI, not diagnoses. CMT assumes an oedema context (decrease = favourable).
- `investigation-links.js` — explicit chain request → legacy order → Core investigation order → study → images → report, linked **only by stable IDs**; unresolvable links are listed as "gaps". Fixes a real bug: Core stores the *investigation order id* in `imaging_studies.order_id`, but the old mapper read a non-existent `investigation_order_id` column, so images never linked.
- `exam-core-sync.js` now also creates eye-specific Core diagnoses (`p_laterality` OD/OS/OU) and passes the structured follow-up reason.
- `patient-facing.js` — plain-Arabic view-model for patients (next visit, medicines, pending tests). **Not wired to any portal**; the portal stays disabled.

**UI / platform**
- `styles/tokens.css` + new palette (navy / restrained teal), removal of glow/float/orb animations; PatientFile no longer fixed at 480 px (mobile 1 column, ≥768 two columns, ≥1100 nav rail + main + side panel); ARIA tablist with arrow keys; `Modal` rewritten (role=dialog, aria-modal, ESC, focus trap + return, real close button); new Compare tab with SVG charts (different marker per eye, table fallback, injection markers); investigation chain cards; structured-exam panel in `ExamForm` (optional).
- Code splitting with `React.lazy`: PatientFile, Radiology, ImagingCenter, Accounting, Settings, SecretaryApp, PatientApp. Main bundle 831.80 → **624.89 kB** (gzip 224.9 → 182.0). A Vite plugin emits `precache.json` and `sw.js` precaches the chunks so first-time offline opens still work (**not tested in a real browser**).

## 3. Verification actually performed
| Check | Result |
|---|---|
| `npm test` | 684 tests, 684 pass, 0 fail (620 baseline + 64 new) |
| `npm run build` | passes |
| `npm run test:smoke` (react-test-renderer, mocked Supabase) | passes — 9 tabs, 4 modals, 11 new checks (summary, "غير مسجل", roles, responsive classes, dialog ARIA) |
| GitHub CI on the branch (`npm ci`, test, smoke, build on Linux/Node 20) | success; then merged to `main` and the Pages deploy workflow succeeded |
| Browser / E2E / visual / contrast / real offline test | **NOT done** |
| Real device sign-out purge, service-worker behaviour | **NOT done** |

Live Supabase was inspected **read-only** (policies, grants, function definitions, advisors); no patient rows were read.

## 4. Known limitations & honest caveats
1. **Server-side authorization is still weak.** Core tables had policy `authenticated_full_access_*` (any authenticated user) and `iapp_store/visits/appointments` use `iapp_is_staff()`. A secretary can read/write clinical data through the API. A role-based RLS migration (`docs/sql/NOT-APPLIED-role-rls.sql`, steps 1–3 + revoke on `iapp_staff`) **was applied manually by the owner on 2026-10-04**. Read-only check afterwards (pg_policies / has_table_privilege): the 8 clinical Core tables now have `clinical_staff_*` policies (admin/doctor only); patients/visits/identity/appointment maps have `staff_*` policies; `authenticated` no longer has INSERT/UPDATE/DELETE on `iapp_staff`; `iapp_has_role` is SECURITY DEFINER. NOT done: the `iapp_store` JSON-key guard (so `iapp_exams`, `iapp_prescriptions`, `iapp_users` inside `iapp_store` are still writable by any staff), and `iapp_imaging_report_versions_core` still has a staff SELECT policy. No post-change functional test with real secretary/admin sessions has been run yet. Client-side role checks are not a security boundary. `iapp_users` (client role source) is writable by any staff via `iapp_store`.
2. The role-RLS SQL was applied **without a prior dry run** (the tool could not execute one). Please review it for lock-out risks (e.g. SECURITY INVOKER RPCs now failing for non-admin accounts; `iapp_has_role` being SECURITY DEFINER).
3. The patient portal (`PatientApp`) loads whole tables client-side; it is disabled only because `KIOSK_EMAIL=''`. Must not be enabled before a patient-scoped RPC exists.
4. Core ignores a second imaging study for the same order (existing backend behaviour); not fixed.
5. `iapp_exam_coresync` (duplicate-guard) and `iapp_users` remain in localStorage after sign-out by design.
6. Accessibility/responsive work covers PatientFile, Modal and ExamForm tabs only. ~1,400 inline styles elsewhere were not touched; the app shell wrapper is still 480 px wide.
7. The patient file now additionally reads `iapp_appointments` (history window) and `iapp_injections` per opened patient to compute the next appointment and injection trends — an extra network read per file open.
8. Thresholds (VA/IOP/CMT/C-D/MD) are conventional display heuristics chosen by the AI; a clinician should confirm them.
9. Some tests are source-text scans (empty catches, lazy imports, ARIA strings); they prove code shape, not behaviour.

## 5. Suggested review focus (please be adversarial)
1. `src/modules/auth/staff-login.js` — can any path still grant admin without server confirmation? Offline behaviour? Race conditions around `verifyServerAdmin`?
2. `src/modules/sync/phi-purge.js` — can it delete unsynced clinical data? Are keep-list keys leaking PHI?
3. `src/modules/patient-file/save-state.js` and `use-patient-file.js` — any path that still shows "saved" when a write failed or is pending?
4. `ophth.js` + `exam-core-sync.js` — data-loss or duplication risks when editing old exams; idempotency of the regenerated block; the new Core diagnosis rows (duplicates on re-save?).
5. `longitudinal.js` / `clinical-summary.js` — clinical-correctness issues: logMAR conversion, "favourable" direction per metric, per-eye selection, handling of Arabic digits, date-less records, both-eyes injections.
6. `investigation-links.js` + `normalize.js` — is the `order_id` interpretation right; any mis-linking (wrong patient's image under a request)?
7. `docs/sql/NOT-APPLIED-role-rls.sql` — will it lock out the app, break `SECURITY INVOKER` RPCs, or leave gaps (e.g. `iapp_store` JSON keys)?
8. Code splitting + service worker (`vite.config.js`, `public/sw.js`) — offline-first regression risks; cache versioning.
9. `components/common.jsx` Modal — focus-trap edge cases, stacked modals, ESC handling.
10. Any claim in `docs/PHASE-CLINICAL-REFINEMENT-FINAL.md` or `SECURITY-RELEASE-CHECKLIST.md` that the code does not support.

## 6. Where to look
- Audit before changes: `docs/PHASE-CLINICAL-REFINEMENT-AUDIT.md`
- Final report: `docs/PHASE-CLINICAL-REFINEMENT-FINAL.md`
- Security checklist: `docs/SECURITY-RELEASE-CHECKLIST.md`
- SQL (not applied): `docs/sql/NOT-APPLIED-*.sql`, backend notes: `docs/BACKEND-RECOMMENDATIONS.md`
- New tests: `tests/{clinical-summary,longitudinal,investigation-links,ophth,hardening,hardening-source,patient-facing}.test.js`, `tests/smoke/patient-file-render.smoke.jsx`; rewritten: `tests/auth-staff-login.test.js`
- Repo: `drsakr86-hash/I-App-lite`, branch `claude/clinical-refinement` (merged to `main`, commit `3708101`); baseline `8a4f586`.
- Run: `npm install && npm test && npm run build && npm run test:smoke`

## 7. Please answer
1. List any **bugs** (file + line + failing scenario), ranked by severity.
2. List **over-claims** in the docs.
3. List **missing tests** worth adding.
4. Give an overall verdict: safe to keep deployed / needs fixes first — and why.
