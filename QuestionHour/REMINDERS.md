# Daily reminders

Users can opt in on each device and choose 8:30 AM, 12:30 PM, or 5:30 PM.
The reminder uses the device's IANA time zone at the time it is enabled or
updated. If the device changes time zones, open the site and update the
reminder. This is separate from the shared Los Angeles calendar day used for
questions. A notification says: "Would you like your daily dose now?"

## Server configuration

1. Generate a VAPID key pair once from the application directory:

   ```powershell
   npx web-push generate-vapid-keys
   ```

2. Set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (for example
   `mailto:your-operator@example.com`), and a long random `CRON_SECRET` in the
   API server's environment. Keep the private key and cron secret private.
   Reuse the same VAPID keys across deployments; changing them invalidates
   existing subscriptions.
3. Give the Neo4j account permission to create uniqueness constraints. The
   server creates constraints for the daily question and reminder IDs.
4. Configure a trusted scheduler to send a **GET** request to
   `https://YOUR-API-HOST/api/reminders/dispatch` every minute with the header
   `Authorization: Bearer YOUR_CRON_SECRET`. The endpoint returns counts and a
   non-success status when delivery fails. Monitor scheduler failures.

The in-process question cron is not a reliable scheduler on serverless hosts.
The first request after a serverless instance starts also attempts daily
generation. The Neo4j lock prevents concurrent instances from creating separate
daily questions; existing records are reused. The direct endpoints for replacing
or manually generating a current question return 409. The standalone historical
tester remains separate.

Vercel Hobby cron jobs cannot run every minute; use a trusted external scheduler
or a hosting plan/service that supports minute scheduling. No scheduler is
automatically configured by this repository. For local development, the API is
at `http://localhost:3001`; a scheduler must be able to reach it. Reminders are
best-effort: a missed scheduler minute or a failed push is not retried that day,
and device/browser settings can delay or block delivery.

## Browser requirements and privacy

Web Push requires HTTPS (localhost is allowed), a supported browser, and explicit
notification permission. On iOS/iPadOS 16.4 or newer, add the site to the Home
Screen and open the installed web app before enabling notifications. Users can
turn reminders off on each device or revoke browser permission. The server stores
the push endpoint, encryption keys, selected time, and time zone; no account or
precise location is needed. Expired subscriptions are removed on failed delivery.
Clearing browser data or revoking permission may leave a subscription until the
push provider reports it expired.

The user must keep the application installed and browser/device notifications
enabled. If the server's `VAPID_*` settings or scheduler are absent, reminders
cannot be delivered.
