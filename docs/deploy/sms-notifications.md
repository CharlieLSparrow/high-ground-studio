# SMS Notifications

## Purpose
This document covers the internal SMS notification used for new coaching requests.

The current SMS behavior is intentionally narrow:
- notify Scott or the internal coaching phone when a new coaching request is submitted
- do not message the client yet
- do not include sensitive client notes in SMS
- do not block request creation if SMS fails

## Required Environment Variables
Set these in local `.env.local` when testing locally and in Vercel project environment variables for deployed environments:

```bash
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_FROM_PHONE=
HGO_COACHING_NOTIFY_PHONE=
HGO_SITE_URL=
```

### Meaning
- `TWILIO_ACCOUNT_SID`: Twilio account SID
- `TWILIO_AUTH_TOKEN`: Twilio auth token
- `TWILIO_FROM_PHONE`: Twilio phone number used to send outbound messages
- `HGO_COACHING_NOTIFY_PHONE`: internal destination number for coaching request alerts
- `HGO_SITE_URL`: canonical site URL used to build the team queue link in the SMS

## Vercel Setup Reminder
Add the variables above in the Vercel project settings for the environments that should send SMS.

Recommended minimum:
- Production
- Preview, only if you explicitly want preview submissions to send real texts

If preview environments should not send real SMS, leave the vars unset there.
The notification helper will fail soft and request creation will still succeed.

## Local Development Reminder
If you want to test SMS locally, add the variables to `.env.local`.

If the vars are missing locally:
- coaching requests will still be created
- SMS notifications will not send
- the server will log the notification failure reason

## Current Behavior
On successful coaching request creation:
1. the request is committed to the database first
2. the app attempts to send an internal SMS notification
3. if SMS fails, the failure is logged with `console.error`
4. the user is still redirected to the normal success page or dashboard state

This means SMS delivery is best-effort and non-blocking by design.

## Privacy Rule
Do not include sensitive client notes, coaching goals, or long-form intake text in the SMS.

Current SMS content should stay limited to:
- client display name
- preferred contact method
- phone presence/value
- email
- a short request reference
- a link to `/team/coaching-requests`

## How To Test
### Local
1. ensure the env vars above are set in `.env.local`
2. run the app locally
3. submit a coaching request from `/dashboard?intent=coaching`
4. verify:
   - the request is created in the database
   - the redirect succeeds
   - the internal destination phone receives a text

### Deployed environment
1. confirm the environment variables are set in Vercel
2. submit a test coaching request
3. verify the request appears in `/team/coaching-requests`
4. verify the internal destination phone receives a text

## Failure Expectations
SMS failure should not block coaching request creation.

If Twilio is unavailable or env vars are missing:
- the coaching request should still be saved
- the user should still see the normal success redirect
- the server log should contain the SMS failure details
