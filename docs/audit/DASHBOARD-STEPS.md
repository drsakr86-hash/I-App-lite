# Dashboard-only steps (cannot be done from code or SQL) — F-11 and F-08

## F-11 — Leaked-password protection (Supabase Auth)
1. Supabase Dashboard → project `mofdveiwlaymlabvsypu` → **Authentication → Sign In / Providers → Email** (older UI: Authentication → Policies).
2. Turn on **"Prevent use of leaked passwords"** (checks new passwords against HaveIBeenPwned). Also set **Minimum password length** to 10 or more.
3. Save. Existing accounts and sessions are not affected; the rule applies to the next password set/change.
4. If the switch is disabled/greyed: the feature needs the Pro plan (it is a plan limit, not a bug). Then keep the risk accepted: the 4 staff passwords should be unique and long, and nobody can self-register (confirm **"Allow new users to sign up"** is OFF in the same page — staff access is also gated by the `iapp_staff` allow-list).
5. Verify: Supabase → Advisors → Security: the warning "Leaked password protection disabled" disappears.

## F-08 — Cloudinary unsigned upload preset (`iapp_clinic`, cloud `daihhusnc`)
Why: the cloud name and preset name are visible in the page source, so anyone can upload arbitrary files to the clinic's Cloudinary account (cost/abuse), and a leaked image URL is public.
Quick hardening that needs NO code change (Cloudinary Console → Settings → Upload → Upload presets → `iapp_clinic` → Edit):
1. **Signing mode** stays Unsigned for now (the app uploads from the browser). Do not delete the preset or uploads break.
2. **Allowed formats**: `jpg, jpeg, png, webp, heic, pdf, mp4` (nothing else).
3. **Max file size**: 10 MB for images (the app already limits images client-side; the server limit is the real guard); videos only if you really use them.
4. **Folder**: set the fixed folder to `iapp` and tick **"Use filename or externally defined Public ID" OFF** + **"Unique filename" ON**; **"Overwrite" OFF** (stops replacing existing images).
5. **Delivery type**: if your plan has it, set the preset **Access mode = authenticated** and enable **Settings → Security → "Restricted image types"** and **"Strict transformations"** (blocks arbitrary transformation URLs / hotlink abuse).
6. **Usage alerts**: Settings → Account → set a monthly credits alert so a flood is noticed.
7. Verify: upload one test image from the app (patient file → add image, and Imaging Center → upload a study). Both must still work; then try the preset with a `.exe`/large file from curl — it must be rejected.
Proper long-term fix (needs a decision, new architecture): signed uploads through a Supabase Edge Function (staff-only, issues a short-lived signature), then the preset can be switched to Signed and the public preset removed. Not implemented — rule: no new storage architecture without explicit need.
