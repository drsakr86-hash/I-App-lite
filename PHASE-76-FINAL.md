# Phases 76-Final
- 76: appointments mapper/diff -> src/modules/appointments (tested).
- 77-80: prescription / investigation / imaging payload builders -> src/modules/* (tested).
- Final: removed the inline fallbacks; app-runtime.js now requires the Vite bridge (window.IAppModules) and shows a reload message if it is missing. Patient 360 loads only through getPatient360.
- Still in app-runtime.js (intentionally untouched): iapp_store / sbMutate / offline queue / UI components. Migrate one screen at a time with manual testing.
- DB: policy allow_all on iapp_store was dropped manually; disable public sign-ups in Supabase Auth.
