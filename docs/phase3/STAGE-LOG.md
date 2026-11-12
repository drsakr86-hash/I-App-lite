# Phase 3 execution log (production: Supabase `mofdveiwlaymlabvsypu` / iapp-clinic)

## Stage 1 — preflight (2026-11-12)
- Repo main @ d8bdc53, clean tree. Baseline: `npm test` 1083/1083, `npm run build` OK.
- Production: ACTIVE_HEALTHY; last migration before Phase 3 = `20261110094524 wa_push_claim_drop_service_role_only`.
- Edge Functions unchanged from audit (ai-scribe v9, gemini-assist v10, WhatsApp wrappers, etc.). None touched.
- iapp_staff roles: admin 1, secretary 3, doctor 0. Role check is by JWT email (`iapp_has_role`); clinical core policies already allow admin+doctor.
- Pre-change facts: visits_core 59, examinations_core 51, imaging_report_versions_core 0 rows.
- Verified: no client code/RPC deletes iapp_visits_core rows. Report-versions table had SELECT policy only (versioning RPCs could not write).
- Pre-change policy/FK/trigger snapshot: all clinical *_core tables policy `iapp_has_role(admin,doctor)`; patients/visits/appointment_visit `iapp_is_staff()`; visit->exam/diagnosis/treatment FKs ON DELETE CASCADE.

## Stage 2 — clinical integrity (applied as migration `phase3_stage2_clinical_integrity`)
- Trigger `trg_iapp_guard_visit_delete`: blocks deleting a visit that has exam/diagnosis/treatment rows.
- Imaging report versions: admin/doctor INSERT+UPDATE policies; trigger `trg_iapp_guard_report_version_immutable` (approved rows only → cancelled; cancelled frozen; no deletes).
- Secretary permissions, backup, Atlas, AI Scribe, gemini-assist: unchanged.
- Tests: SQL assertions (rolled back) PASS; RLS as secretary/admin/doctor PASS. Data counts unchanged afterwards.
- Rollback: docs/sql/phase3-stage2-clinical-integrity-rollback.sql

## Stage 3 — multiple doctors (migration `phase3_stage3_multi_doctor`)
- Gap fixed: `iapp_store` had no doctor policy (a doctor account could not sync). Added `store_doctor_rw` (clinical/operational keys + `iapp_imgmeta_*`) and `store_doctor_ro` (users/doctors/clinic). Doctors have no access to expenses, backups, or unknown keys. Admin/secretary policies untouched.
- `iapp_staff` += `doctor_key`, `display_name` (nullable). New: `iapp_current_doctor_key()`, admin-only `iapp_admin_set_staff()` / `iapp_admin_remove_staff()` (last-admin protected).
- Client: UserForm links a doctor account to a doctor profile; Settings mirrors add/edit/delete to the server via the RPCs (failure notifies, local save kept).
- Tests: rolled-back production RLS test with 2 doctors (admin-only keys hidden, iapp_users not writable, admin RPCs refused for doctor/secretary, secretary access unchanged) PASS; unit tests 1086/1086; build OK.
- Manual step: create the doctor's auth user in Supabase → Authentication → Users (password), then add the user in Settings (role = doctor, link profile).
- Rollback: docs/sql/phase3-stage3-multi-doctor-rollback.sql

## Package A — prepared, NOT yet applied
- Files ready: docs/sql/phase3-packageA-clinical-records.sql (+ rollback, + pre-change sync function capture in docs/sql/pre-phase3/).
- apply_migration was paused awaiting the owner's confirmation prompt (statement includes DROP CONSTRAINT/TRIGGER/POLICY IF EXISTS on objects it creates itself). Verified afterwards: nothing was applied (no new columns, RPCs, table or trigger).

## Package A — APPLIED (migrations `phase3_packageA_clinical_records`, `phase3_packageA_rpc_security_definer`)
- examinations_core += findings_od/os, findings_schema, status (draft|signed), version_no, author_email/doctor_key, signed_by/at. New append-only `iapp_clinical_record_versions`. Triggers: signed exam immutable (only iapp_amend_examination with a reason ≥5 chars), cannot be deleted, cannot be signed except via iapp_sign_examination. `iapp_sync_examination_core` same signature; skips signed exams; stores per-eye findings + author. Sign/amend RPCs are SECURITY DEFINER with an internal admin/doctor check.
- Existing 51 exams: status NULL (legacy), no invented author/signature.
- Client: clinical-record.js (per-eye findings, sign/amend wrappers), ExamForm (status banner, Save & sign, amendment with reason), saveExam blocks edits to signed exams, report prints status/version/signer/time.
- Tests: rolled-back production assertions PASS (draft+author, direct sign refused, sync can't overwrite signed, direct edit/delete refused, amend needs reason, OS untouched when OD amended, history append-only, secretary refused); unit tests 1090/1090; build OK.
- Known residual: signed content is authoritative in Core; the legacy JSON mirror on a stale offline device could still differ until it syncs (the app refuses local edits once it knows the exam is signed). Sign/amend need connectivity by design.
- Rollback: docs/sql/phase3-packageA-clinical-records-rollback.sql

## Package C — specialty templates (client only; no DB change)
- Added 6 recording sheets to the existing special-sheets framework (flag `special_sheets` unchanged): AMD, RVO, RD, Cornea & dry eye, Cataract pre-op, Paediatric & amblyopia. Per-eye OD/OS fields; VA/IOP/refraction/CMT deliberately not repeated (they live in Package A / ophth). Stored in `exam.special` (old records untouched). No DDx rules attached: they are recording aids, not diagnostic tools.
- Tests: 1093/1093 (incl. i18n coverage ar/en), build OK.

## Package D — imaging chain (migration `phase3_packageD_imaging_chain`)
- New: append-only `iapp_imaging_link_audit`; `iapp_imaging_linkage_report()` (read-only, admin/doctor; suggestions only); `iapp_link_imaging_study()` (admin/doctor; same patient only; fills EMPTY links only; requires a verification note; audited); `iapp_imaging_history()` (longitudinal list). Stage 2 already made report versions writable + approved reports immutable.
- No storage migration; Cloudinary URLs untouched; private storage flag unchanged.
- Linkage report on live data (counts only): 6 studies (6 without order, 4 without visit), 47 orders (45 without visit, 47 without study); 0 studies have a same-patient candidate order → nothing can or was linked. No auto-linking performed; audit table empty.
- Tests (rolled back on production): report works, cross-patient link refused, note required, same-patient link audited, secretary refused. PASS.
- Rollback: docs/sql/phase3-packageD-imaging-chain-rollback.sql

## Package E — decision support review (client only)
- Existing rule-based, explainable, per-eye DDx kept. Added: versioned rule set metadata (`RULESET` 1.0.0) that states honestly "not yet clinically reviewed" (reviewer fields stay null until a named ophthalmologist signs off — Dr. Sakr should review the rules and set them); accept (adds to diagnosis by tap, recorded) / dismiss with required reason; append-only `exam.ddxReview` (rule-set version, who, when); dismissed items hidden with a toggle. No auto-diagnosis, no LLM involvement.
- Tests 1096/1096, build OK.

## Package F — AI Scribe consent (client only; Scribe + gemini-assist untouched and operational)
- Consent is now a per-recording record {version 'scribe-consent-v1', user, time}, created when the clinician ticks the disclosure for THAT recording, saved in `exam.aiScribe.consent` with the list of accepted fields; no longer hard-coded `true`; reset after each recording. No recording is sent without a valid record (client check). Disclosure text (ar/en) states audio is recorded, sent to Google Gemini, not stored, and enters the record only after review. Output was already a draft the clinician ticks and saves.
- Server review: `ai-scribe` v9 logs only status/latency/field count (no audio or clinical text); `gemini-assist` v10 (not in repo): verify_jwt on + admin-only check via service role, no content logging, wildcard CORS (token-protected). NOT modified (fixed decision: keep operational).
- Limitation / decision for the owner: both functions allow role `admin` only, so a doctor account cannot use the Scribe/Gemini (the panel is shown to admin only to avoid a guaranteed 403). Allowing `doctor` requires redeploying `ai-scribe` with `role in ('admin','doctor')`; not done to avoid touching the live function without your explicit go-ahead.
- Tests 1099/1099, build OK.
