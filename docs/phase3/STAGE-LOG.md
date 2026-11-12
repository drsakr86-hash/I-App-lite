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
