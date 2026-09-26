# Phases 43-70 (batch)
- 43-47: services/rpc (timeout, retry for reads, in-flight dedupe for writes), one shared Supabase client, visit/exam/prescription/investigation/imaging services, useRpc hook.
- 48-52: legacy runtime routes all 13 iapp_* rpc calls through IAppModules.rpc.safe (falls back to raw sb.rpc).
- 53-56: Patient File loads through IAppModules.patients.getPatient360 (falls back to the old inline chain).
- 57-60: unified timeout/retry/dedupe in services/rpc.js.
- 61-65: permission matrix (src/app/permissions.js). Auth already uses Supabase Auth; DEFAULT_USERS is empty; admin123 only flags migrated local users.
- 66-70: services/storage.js metadata + resolver abstraction. Cloudinary untouched.
- Not done: 71-80 and Final legacy removal (need real UI testing).
