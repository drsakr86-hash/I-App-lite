# Patient 360 — data model, contracts and data flow

## Data flow

```mermaid
flowchart LR
  subgraph Sources
    L1[iapp_exams / iapp_prescriptions<br/>(iapp_store JSON)]
    L2[iapp_visits (row table)]
    L3[iapp_imgmeta_&lt;patientId&gt;<br/>(iapp_store JSON)]
    C[Core 360 RPC<br/>iapp_get_patient_360_timeline → summary → by_code]
  end
  L1 & L2 & L3 & C --> N[normalizePatientFile()<br/>src/modules/patient-file/normalize.js]
  N --> R[exams · requests · visits · rxList · images<br/>each with _sources / _coreId / _legacyId / _coreVisitId]
  R --> T[buildPatientTimeline()]
  R --> UI[Patient file tabs]
  T --> UI
  UI -- save --> W[patients-orchestration.js<br/>exam-core-sync.js · request-workflow.js]
  W --> L1 & L2
  W --> CW[Core write RPCs<br/>iapp_sync_*_core / iapp_create_*]
```

```
legacy stores ┐
Core 360 file ├─► normalizePatientFile ─► records (de-duplicated, provenance)
image meta    ┘                           └─► buildPatientTimeline ─► Timeline tab
```

## Canonical records (as used in the UI)

| Record | Identity keys used for de-duplication | Encounter link | Notes |
|---|---|---|---|
| Visit | `core:<coreId>`, `lid:<legacy id>`, shadow alias `exam-visit:N ↔ exam:N`, `radiology-visit:N ↔ radiology:N`, `rx-visit:N ↔ rx:N`, `core-visit:<uuid>` | – | The `iapp_visits` row mapping does not persist `_coreId`, so the alias is what prevents shadow+Core duplicates after a reload. |
| Examination | `core:<id>`, `lid:<legacy_id or id>` | `_coreVisitId` (from `visit_id`) | Carries diagnosis / treatment plan / follow-up as text. |
| Investigation request | `inv:<coreInvestigationOrderId>`, `img:<coreImagingOrderId>`, `src:<source legacy id>` | `visitId` | Legacy requests are stored in `iapp_exams`. |
| Prescription | same as examination | `_coreVisitId` | Core `medicines` (array) is converted to text. |
| Image | `pid:<public_id>`, `id:<id>`, `src:<url>` | `orderId` (local link), `coreOrderId` | Metadata store wins over Core copy. |
| Diagnosis / treatment / follow-up | Core rows only; hidden when they mirror an exam on the same `visit_id` with identical text/date | `visit_id` | Create-only RPCs: no update path known. |

Never used for matching: patient name, date alone, test name, approximate text.

## Precedence and provenance

* Same record in both sources → the **legacy (local) record wins** (it may hold edits not yet written through); Core adds `_coreId`, `_legacyId`, `_coreVisitId`; `_sources = ['legacy','core']`.
* Core-only → appended, `_sources = ['core']`. Legacy-only → `_sources = ['legacy']`.
* Core rows with an explicit different `patient_id`, or a Core payload whose `patient_code` differs from the open patient, are dropped (never relabelled).
* Missing/malformed fields stay empty; nothing is fabricated.

## Timeline

One event per clinical record (key `<kind>:<id>`), newest first, undated last. Each event has `source = {tab, id}`; "فتح السجل" switches tab and highlights the card (`data-rec`). Offline-only local records are no longer hidden when the Core journey exists (the old code replaced the whole timeline with the journey).

## Write contracts (RPC names/params exactly as already used in the code)

| Action | Calls | Safety |
|---|---|---|
| Save examination | local store → `iapp_sync_examination_core(p_exam,p_patient_code)` → `iapp_create_diagnosis_core` / `iapp_create_treatment_core` / `iapp_create_followup_core` | create-RPCs only for new/changed values (`exam._coreSync` markers + device marker map); each step reported; no auto-retry |
| Investigation request | `iapp_create_clinical_visit(p_legacy_id=investigation:<draftId>)` → `iapp_create_investigation_workflow_order(p_source_exam_legacy_id=<draftId>)` → local exam record → `iapp_imaging_orders` upsert by id | one draft id per draft, reused on retry; result `saved | local-only | partial | failed`; explicit "resync" for `coreSyncError` |
| Save visit / Rx | local store → `iapp_sync_visit_core` / `iapp_create_prescription_core` | structured result shown in the status bar |

## Verification still required (backend not in this repository)

1. Exact columns returned by `iapp_get_patient_360_timeline`: `visit_id` on examinations/prescriptions, `legacy_id` on visits, `source_exam_legacy_id` on orders, field names of `diagnoses`/`treatments`/`followups`. The mapper reads these defensively; if absent, the corresponding de-duplication/linkage is simply not applied.
2. Whether `iapp_create_clinical_visit`, `iapp_create_investigation_workflow_order`, `iapp_create_prescription_core` treat `p_legacy_id` / `p_source_exam_legacy_id` as an idempotency key (upsert). The client now sends stable ids, but duplicate protection on a retry is only guaranteed if the server enforces uniqueness.
3. Whether update/delete counterparts exist for diagnosis/treatment/follow-up (editing the diagnosis text creates a new Core row; the old one stays).
4. RLS policies per role (see SECURITY.md).
