# Coaching Request SMS Notification Result

## Files changed
- `apps/web/src/lib/server/sms.ts`
- `apps/web/src/lib/server/coaching-notifications.ts`
- `apps/web/src/app/coaching/actions.ts`
- `docs/deploy/sms-notifications.md`
- `docs/sessions/coaching-request-sms-notification-result.md`

## Helper behavior
- Added a server-only Twilio SMS helper that uses direct REST `fetch` with Basic Auth.
- Added a server-only coaching notification helper that formats a short internal alert and sends it to the configured internal phone.
- Both helpers return structured success/failure results instead of throwing on normal SMS failures.

## Env vars required
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_FROM_PHONE`
- `HGO_COACHING_NOTIFY_PHONE`
- `HGO_SITE_URL`

## Action wiring behavior
- Coaching request creation still happens first and remains the source of truth.
- SMS is sent only after the database transaction completes.
- SMS is not sent inside the transaction.
- If SMS fails, the server logs the failure with `console.error`, but the user redirect still succeeds.
- Dashboard and public success redirects remain unchanged.

## Validation performed
- Ran `pnpm --filter web build`.
- Confirmed no manuscript or book files were modified.
- Confirmed no publish episode files were modified.

## Known limitations
- No SMS retry queue.
- No notification status stored in the database.
- No client-facing SMS yet.
- No opt-out system because this is internal notification only.

## Recommended next action
- Add a lightweight delivery log or background retry mechanism if internal SMS becomes operationally important enough that missed alerts need stronger guarantees.
