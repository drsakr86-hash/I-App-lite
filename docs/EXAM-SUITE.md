# Exam suite (branch `feature/exam-suite`)

Feature flags are **on by default since 2026-11-10** (switch one off on a device with `?ff=-name`; to ship them off again set `fallback: false` in `src/modules/feature-flags/index.js`). Enable for a test session with
`?ff=atlas,private_storage,special_sheets,ddx`.

| Flag | What it adds | Roles |
|---|---|---|
| `atlas` + `private_storage` | Drawing step in the exam (blank canvas, free drawing, external image, 18 retinal stamps); doctor approves each drawing; stored in the private bucket `clinical-private` | doctor / admin only |
| `special_sheets` | Neuro-ophthalmology, uveitis, squint, glaucoma and DR sheets inside the exam (`exam.special`, no DB change) | whoever edits the exam |
| `ddx` | Differential-diagnosis assistant in the diagnosis step. Reads **structured fields only** (never free text). Writes to the plan only when the doctor taps; append-only | doctor / admin only |

## Printing drawings
The patient-file report prints, at the end of the **last exam**, only drawings that are approved **and** marked
"include in report" (default off), at most 6, for doctor/admin only. Images are fetched through the signed-URL
cache and embedded as data URLs (png/jpeg/webp only), so printed pages never depend on an expiring link.
A drawing that cannot be loaded is skipped; printing never fails because of it. When no drawing is selected the
print path is unchanged and synchronous.

## Never shown to
Secretary, employees and the patient portal never receive clinical drawings (`stripClinicalDrawings`, role checks).

## Sync
Exam records are merged per record (local edit wins). Approved drawings are append-only, so the three-way merge
(`sync/merge.js`) and `saveExam` (`preserveDrawings`) always keep the union of both sides' drawings.

## Rollback
Turn the flags off (or do not pass `?ff=`). No Supabase change belongs to this branch; the `clinical-private`
bucket was created earlier with approval (rollback: drop policies `clinical_private_{read,insert,update,delete}`
and delete the bucket if empty). Old Cloudinary images are untouched.

## Needs doctor review before clinical use
Plate hotspot positions, stamp glyphs, DDx rule thresholds, origin/licence of the 7 supplied plate images.
