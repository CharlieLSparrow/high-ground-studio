# Coaching Request Email Notification Result

## Files changed
- `apps/web/src/lib/server/email.ts`
- `apps/web/src/lib/server/coaching-notifications.ts`
- `apps/web/src/app/coaching/actions.ts`
- `docs/deploy/email-notifications.md`
- `docs/sessions/coaching-request-email-notification-result.md`

## Helper behavior
- Added a server-only Resend REST helper that sends email with server-side `fetch`.
- Kept provider-specific logic isolated in `apps/web/src/lib/server/email.ts`.
- Added a coaching notification helper that queries internal recipients and sends a practical coaching-request notification email.

## Recipient role logic
- Recipients are users with any of these roles:
  - `OWNER`
  - `TEAM_SCHEDULER`
  - `COACH`
- Recipient email addresses are deduplicated before sending.
- If no recipients are found, the helper returns a structured failure instead of throwing.

## Env vars required
- `RESEND_API_KEY`
- `HGO_EMAIL_FROM`
- `HGO_SITE_URL`

## Action wiring behavior
- The coaching request is still created first inside the database transaction.
- Notification email is sent only after the transaction completes.
- Email sending is not part of the transaction.
- If email sending fails, the server logs a concise error and the user still gets the normal success redirect.
- Redirect behavior remains unchanged for dashboard and public flows.

## Validation performed
- Ran `pnpm --filter web build`.
- Confirmed no manuscript or book files were modified.
- Confirmed no publish episode files were modified.

## Known limitations
- No retry queue.
- No notification status stored in DB.
- No email preference or opt-out for internal notifications yet.
- Provider is env-configured.

## Recommended next action
- Decide whether to keep SMS dormant, replace it entirely, or add dual-channel notification with clear environment-based gating once Twilio is production-ready.
