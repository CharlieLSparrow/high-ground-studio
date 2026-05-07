# SMS Notifications

## Purpose
This document records the current SMS/Twilio status for coaching workflows.

Current product truth:
- SMS/Twilio notification sending is not wired into the active coaching request flow.
- `apps/web/src/lib/server/sms.ts` exists as a server-only Twilio REST helper.
- No current coaching action imports or calls `sendSmsNotification()`.
- `submitCoachingRequestAction()` currently attempts only the Resend email notification helper after the request transaction commits.
- The dashboard request form includes SMS consent copy when a user chooses text follow-up, but that consent copy does not mean outbound SMS is currently automated.

## Dormant Helper Environment Variables
The dormant helper reads these variables if a future call site uses it:

```bash
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_FROM_PHONE=
```

- `TWILIO_ACCOUNT_SID`: Twilio account SID
- `TWILIO_AUTH_TOKEN`: Twilio auth token
- `TWILIO_FROM_PHONE`: Twilio phone number used to send outbound messages

These variables are not part of the active local setup path today and are not listed in `.env.example`.

## Current Coaching Notification Behavior

On successful coaching request creation:
1. the request is committed to the database first
2. the app attempts a best-effort internal Resend email notification
3. if email fails, the failure is logged with `console.error`
4. the user is still redirected to the normal success page or dashboard state

No SMS is sent in that path.

## Privacy Rule
If SMS is wired later, do not include sensitive client notes, coaching goals, or long-form intake text in the SMS.

Future SMS content should stay limited to minimal routing details such as:
- client display name
- preferred contact method
- phone presence/value
- email
- a short request reference
- a link to `/team/coaching-requests`

## How To Test

There is no end-to-end SMS notification test for the current coaching workflow because there is no active SMS call site.

To verify the current truth:
1. inspect `apps/web/src/app/coaching/actions.ts`
2. confirm it imports `notifyTeamOfNewCoachingRequest`
3. confirm it does not import `sendSmsNotification`
4. submit a coaching request and verify the request appears in `/team/coaching-requests`
5. verify any notification side effect through `docs/deploy/email-notifications.md`, not this SMS document

## Future Wiring Checklist

Before enabling SMS:
- add an explicit destination source or recipient derivation
- preserve request creation even if Twilio fails
- keep SMS content minimal
- update `.env.example`
- update `docs/runbooks/local-dev.md`
- add a fresh session note under `docs/sessions/`
