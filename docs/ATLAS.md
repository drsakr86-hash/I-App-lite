# Anatomy Atlas (Phase 1)

Feature branch: `feature/anatomy-atlas`. Behind the `atlas` feature flag (off by default). No database, storage or Edge Function changes.

## Turning it on / off
- On this device: open the app once with `?ff=atlas` (remembered); `?ff=-atlas` turns it off again.
- For a whole build: set `VITE_FF_ATLAS=1` at build time.
- The tab appears under **More** for `admin` and `doctor` only (`atlas` resource in `src/app/permissions.js`).
- With the flag off nothing changes: the nav array `NAV`, existing tabs and bundles are untouched; the atlas is a lazy chunk.

## What is in Phase 1
Seven bilingual (AR/EN) plates, original vector artwork drawn for this project: general eye anatomy, retinal layers, vitreoretinal interface, extraocular muscles, visual pathway, anterior segment and angle, lens and pupil (82 selectable structures).
Select a structure for its description; zoom/pan (wheel, drag, pinch, buttons); labels (names, numbers, hidden, both languages); pen/arrow/text annotations; PNG/SVG export of the whole plate; search across all plates.

## Data & provenance
- Plates are plain data in `src/modules/atlas/plates/*.js`; `validatePlate` (tests) enforces bilingual text, bounds, whitelisted shape attributes and a licence/author on every plate.
- All artwork is original (no third-party images). Every plate is `status: 'draft'` and the UI says so, until a doctor approves the content.
- Annotations are stored per plate in this browser only (`iapp_atlas_ann_v1:<plate>`), contain no patient data and are not synced.

## Not in Phase 1 (needs approval first)
Linking drawings to patients/exams/reports, any new table or Migration, Supabase private storage / signed URLs, the disease library, AI reasoning, changes to deployed functions or to the Scribe.

## Phase 2 - attach an approved drawing to an exam (flags `atlas` + `private_storage`)

- Visible only to doctor/admin. Pick patient, pick exam, press "Approve & attach". Nothing is saved before that click.
- The PNG goes to the private bucket `clinical-private` (`atlas/<patientId>/<uuid>.png`, plus a 320 px thumbnail); only the path is stored.
- The record is kept in `atlasDrawings[]` on the exam record (a sibling of `ophth`: the structured-exam form rebuilds `ophth` and would drop unknown keys).
  Each item holds who/when/visit/exam, the vector annotations, a per-drawing "include in report" switch (off by default) and an append-only `revisions` list.
- An approved drawing is never edited in place: a new approval creates a new version and the old one stays as "previous version".
- Never shown to secretary/employee (storage policy + no permission) or the patient portal (the portal strips `atlasDrawings`).
- A stale exam form cannot erase drawings (`preserveDrawings` in `saveExam`).
- Not yet: showing the included drawings in the printed report; migration of old Cloudinary images (deliberately out of scope).
