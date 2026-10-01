# Security review (Phase F)

Nothing in this file was executed against any database.

## Findings
1. **High — roles are enforced in the browser only.** `src/modules/auth/staff-login.js` resolves roles from `iapp_users` (a key/value record in `iapp_store`, writable by any staff session) and auto-provisions: a preset email (`DEFAULT_ROLES`) or `ADMIN_EMAILS`, or *any* login when no accounts exist, becomes `admin`. The README states DB access is "any account in `iapp_staff`" (`iapp_is_staff()`), i.e. no per-role RLS. A secretary/employee session can therefore call the same tables/RPCs directly. Hidden buttons are not security.
2. **Medium — `can()` matrix is unused by the UI** (`src/app/permissions.js` is only exposed on the bridge); the only guards are the accounting tab and `navItemsForRole`. Unit-tested here only as a matrix.
3. **Medium — PHI in localStorage is not purged on logout** (`sbSignOut` removes only `iapp_sb_auth`). Purging would also drop the offline cache the clinic relies on, so this needs a product decision (a safe variant would purge only non-dirty keys).
4. **Medium — Cloudinary:** unsigned preset `iapp_clinic` hard-coded; delivery URLs are public. Anyone holding a URL can view the image.
5. **Info — keys:** only the Supabase *publishable* key is in the bundle; no `service_role` string or JWT found (grep of `src`, `public`, `index.html`).
6. **Info — kiosk:** `queue-display.html` reads a public queue view only (per README).

## Not verified (needs the live project)
Actual RLS policies, grants on RPCs, whether anon can execute `iapp_*` functions. Run the read-only queries in `docs/security-recommendations.sql` first.
