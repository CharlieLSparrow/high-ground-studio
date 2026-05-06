# Email Notifications

## Purpose
This document covers internal email notifications for new coaching requests.

Current behavior:
- a coaching request is created first
- the app attempts to email internal scheduling/coaching staff afterward
- if email delivery fails, request creation still succeeds

## Required Environment Variables
Set these in local `.env.local` when testing locally and in Vercel project environment variables for deployed environments:

```bash
RESEND_API_KEY=
HGO_EMAIL_FROM=
HGO_SITE_URL=
```

### Meaning
- `RESEND_API_KEY`: API key for the Resend account that will send notification emails
- `HGO_EMAIL_FROM`: verified sender identity, for example `High Ground Odyssey <notifications@highgroundodyssey.com>`
- `HGO_SITE_URL`: canonical site URL used to build the internal queue link

## Vercel Setup Reminder
Add the variables above in the Vercel project settings for every environment that should send notifications.

Recommended minimum:
- Production
- Preview, only if you explicitly want preview submissions to send real emails

If preview environments should not send real email, leave the vars unset there.
The notification helper will fail soft and request creation will still succeed.

## Local Development Reminder
If you want to test notifications locally, add the variables above to `.env.local`.

If the vars are missing locally:
- coaching requests will still be created
- internal email notifications will not send
- the server will log the failure reason

## Recipient Rules
Notification recipients are users with any of these roles:
- `OWNER`
- `TEAM_SCHEDULER`
- `COACH`

Recipients are deduplicated by email before send.

## Resend Setup Reminder
Resend requires a verified sending domain or sender identity.
Before production use:
- verify the domain used in `HGO_EMAIL_FROM`
- confirm DNS is set correctly in Resend
- send a live test from the production environment

## How To Test
### Local
1. ensure `RESEND_API_KEY`, `HGO_EMAIL_FROM`, and `HGO_SITE_URL` are set in `.env.local`
2. run the app locally
3. submit a coaching request from `/dashboard?intent=coaching`
4. verify:
   - the request is created in the database
   - the redirect succeeds
   - internal recipients receive the notification email

### Deployed environment
1. confirm the environment variables are set in Vercel
2. submit a test coaching request
3. verify the request appears in `/team/coaching-requests`
4. verify internal recipients receive the notification email

## Failure Expectations
Email failure should not block coaching request creation.

If Resend is unavailable or env vars are missing:
- the coaching request should still be saved
- the user should still see the normal success redirect
- the server log should contain the email failure details
