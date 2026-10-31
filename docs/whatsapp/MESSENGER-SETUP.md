# Messenger + Instagram in the secretary inbox

Facebook Messenger and Instagram Direct messages land in the same inbox and the same assistant as WhatsApp.
Nothing changes for WhatsApp.

## What the assistant does on Messenger / Instagram

- Answers clinic info and shows free slots exactly as on WhatsApp.
- Booking: always a **request** (never a direct booking), and it asks for the patient's mobile number,
  because a Messenger/Instagram id is not a phone. The secretary confirms by calling that number.
  The request appears in the normal booking-requests screen with the note "ماسنجر" or "إنستجرام".
- It cannot look up, cancel or move an existing appointment there (no verified phone). It hands the chat to the secretary.
- No reminders and no templates on these channels.
- A reply typed in Meta Business Suite counts as a human reply (the assistant stops), same as the WhatsApp Business app.

## Order of deployment (each step is backward compatible)

1. Apply `docs/sql/messenger-channels.sql` (tested locally: `npm run test:whatsapp-sql`). Rollback: `messenger-channels-rollback.sql`.
2. Redeploy the worker (`dist-fn/whatsapp-worker.js`, live slug `quick-task`).
3. Deploy `dist-fn/messenger-webhook.js` as a new function `messenger-webhook`, `verify_jwt = false`.
4. Merge to main (inbox shows the channel badge; it also works before step 1).

## Meta setup (owner)

1. Same Meta app as WhatsApp → add the **Messenger** product (and **Instagram** → "API setup with Facebook login").
2. Link the clinic's Facebook Page (and the Instagram professional account connected to that Page).
3. Generate a **Page access token** with `pages_messaging` (+ `instagram_basic`, `instagram_manage_messages`).
   Save it as Edge secret `META_PAGE_TOKEN`. Optional: `META_APP_ID` (the app id, to ignore our own echoes faster).
4. Webhook: callback `https://<project>.supabase.co/functions/v1/messenger-webhook`, same verify token as WhatsApp.
   Subscribe the Page to `messages`, `messaging_postbacks`, `message_echoes`; Instagram to `messages`.
5. App Review: `pages_messaging` and `instagram_manage_messages` need **Advanced Access** before strangers' messages arrive.
   Until approved, only people with a role on the app (admins/testers) can test.
6. Put the ids in the database (not secrets): `update wa_config set page_id = '<PAGE_ID>', ig_account_id = '<IG_ID>' where id = 1;`
