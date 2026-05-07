# Donation And Calendar Links

Date: 2026-05-06

## Environment Variable

- `HGO_COACHING_DONATION_URL`

Recommended value:

- Use a Stripe Payment Link for now instead of full Stripe Checkout.

Example:

```bash
HGO_COACHING_DONATION_URL="https://buy.stripe.com/your-payment-link"
```

## Donation CTA Behavior

- The client dashboard shows a pay-what-you-can contribution CTA only when `HGO_COACHING_DONATION_URL` is configured.
- The CTA appears when the user has a converted coaching appointment or another scheduled/completed appointment available on the dashboard.
- If the env var is missing, clients do not see a broken or empty donation button.
- Team pages show a small configuration note so staff can tell whether the donation CTA is live.
- The app does not create Stripe Checkout sessions, store payment records, or process webhooks for this flow.
- The configured URL is treated as an external pay-what-you-can destination, usually a Stripe Payment Link.

## How To Test The Donation Button

1. Set `HGO_COACHING_DONATION_URL` in the active environment.
2. Sign in as a client with a converted coaching request or an existing appointment.
3. Open `/dashboard`.
4. Confirm `Make a Pay-What-You-Can Contribution` appears and opens the configured link in a new tab.
5. Unset the env var and confirm the client-facing button disappears.

## Google Calendar Link Behavior

- Calendar support is first-pass link generation only.
- The app builds a prefilled Google Calendar creation URL with:
  - title
  - UTC start/end dates
  - appointment details
  - location
  - optional guest email
- No OAuth is used.
- No Google Calendar API calls are made.
- No server-side calendar events are created or updated.
- `Appointment.googleEventId` exists in the Prisma schema, but this link-only flow does not write it.

## How To Test Calendar Links

1. Sign in as a client with a scheduled appointment and open `/dashboard`.
2. Click `Add to Google Calendar`.
3. Confirm Google Calendar opens a prefilled event draft in a new tab.
4. Repeat on `/team/coaching-requests` for a converted request.
5. Optionally repeat on `/team/appointments`.

## Future Path

- Add Google OAuth credentials and consent handling for staff-managed calendar access.
- Create server-side event creation/update/cancel flows.
- Persist external calendar ids and sync status.
- Add cancellation/update handling so appointment changes can propagate automatically.
- Add payment storage and webhook-backed donation reconciliation only after the lightweight link flow proves useful.
