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
