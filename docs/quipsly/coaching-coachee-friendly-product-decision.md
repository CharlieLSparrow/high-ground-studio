# Coaching and capture: easiest useful path

Updated: 2026-07-07

## Decision

Build Homer's coaching workflow around one app-owned Quipsly coaching runway.

Homer should not need to think in provider dashboards. Coachees should not need
to understand Quipsly internals. Stripe, Google Calendar, Google Meet/LiveKit,
and transcription are evidence providers. Quipsly owns the friendly state:
request, booking, price, payment evidence, consent, room, recording,
transcript, notes, action items, and follow-up packet.

## Friendly default flow

1. Coachee requests coaching or Homer creates a session for them.
2. Quipsly creates or repairs the user's free account and Home Nest.
3. Homer confirms title, time, duration, notes, and price in one runway.
4. For paid one-to-one work, Quipsly creates a Stripe-hosted checkout link.
5. The coachee pays on Stripe, not inside a custom Quipsly card form.
6. Quipsly records payment as pending until webhook or provider evidence lands.
7. Quipsly creates the calendar receipt slot and meeting/capture room.
8. Before recording, every participant sees clear consent and recording state.
9. The native capture app records locally first, uploads verified chunks, and
   keeps local recovery until a verified prune policy exists.
10. Quipsly creates transcript, summary, action items, and packet evidence.
11. Homer reviews, edits, and sends the follow-up packet.

## Why this is the easiest path

- Stripe Checkout gives us a low-complexity hosted payment page for one-off and
  subscription payments while keeping card handling out of Quipsly.
- Stripe Payment Links are useful for very simple repeatable offers, but custom
  one-to-one coaching should usually use booking-specific Checkout Sessions so
  Quipsly can attach exact booking/payment evidence.
- Google Calendar events are provider receipts, not truth. Quipsly should store
  the booking first, then attach calendar IDs and meeting links as evidence.
- App Store readiness depends on visible consent, privacy/account-deletion
  surfaces, reviewer credentials, and live backend proof. Static checks are not
  enough for submission confidence.

## Homer and coachee friendliness rules

The visible product should read like a calm service desk, not a provider
integration console.

- Homer should see the next human action first: set up coach profile, hold a
  slot, create appointment, send payment link, start call, request consent, run
  transcript, review packet.
- Coachees should see only what they need to trust the session: who it is with,
  when it happens, what it costs, where to pay, where to join, whether recording
  is on, what they consented to, and where their follow-up notes live.
- Engineering state can stay detailed in the API, logs, ledgers, and admin
  surfaces. The coachee UI should translate it into plain language.
- Payment should feel familiar and boring. For first paid coaching sessions,
  use Stripe-hosted Checkout instead of a custom Quipsly card form.
- Scheduling should not require a coachee to create a Quipsly account before
  they understand the appointment. Quipsly can create or repair the account
  quietly behind the booking path, then invite/sign in when needed for capture,
  consent, and packet review.
- Calendar entries should reassure humans, not define truth. If Google Calendar
  changes or fails, Quipsly still needs the appointment, room, consent, payment
  evidence, and packet trail.
- Recording must never feel sneaky. The default visible state is "Recording is
  off"; the next state is "Recording starts only after consent."

## Current Nest surfaces

- `/coaching` is Homer's operational runway. It can set up coach records,
  create holds, create bookings, prepare payment requests, manage capture
  rooms, run transcription, and build packets when the signed-in user has the
  right role.
- `/coaching/sessions` is the coachee-friendly session view. It reads the same
  app-owned capture/session truth through `/api/mobile/capture/sessions`, but
  translates it into time, payment, consent, recording, and follow-up packet
  language.
- `/api/mobile/capture/sessions` remains the shared mobile/native contract.
  Native capture and the coachee page should both consume that truth instead of
  inventing parallel client-portal state.

## Product copy principle

Use calm plain language:

- "Pay securely with Stripe"
- "Homer has not confirmed the time yet"
- "Payment evidence is pending"
- "Recording is off"
- "Recording starts only after consent"
- "Transcript is ready for review"
- "Follow-up packet is ready to send"

Avoid internal language in coachee UI:

- provider receipt slot
- lifecycle evidence
- capture spine
- transcript job
- app-owned source of truth

Those are engineering truths. The coachee gets the human translation.

## Current proof status

Passed locally/live:

- Public coaching/payment contract smoke.
- Mobile capture contract smoke.
- Coaching lifecycle static smoke.
- iOS capture App Store static smoke.
- Capture reviewer runway static smoke.
- Live anonymous boundaries return calm JSON 401s.
- Live generated coaching/capture runway smoke:
  `scripts/quipsly-live-coaching-generated-auth-smoke.sh`.
  This creates temporary staff/client Firebase users, proves free account and
  Home Nest onboarding, creates/releases a hold, converts a hold into a booking
  and capture room, proves the invited coachee can see the mobile capture
  session, verifies `/coaching/sessions` is reachable, verifies consent is
  requested and recording is held until consent, proves the invited coachee can
  decline consent and keep recording locked, proves granting consent unlocks the
  local capture fallback for a confirmed session, proves reschedule/cancel
  visibility, and cleans up generated records.

Still needs live human/reviewer proof:

- Store one reviewer credential via local password file or macOS Keychain.
- Create/repair the reviewer account from `/admin/users`.
- Create a reviewer-safe booking and capture room from `/coaching`.
- Run signed-in reviewer and native-auth smoke scripts against
  `https://nest.quipsly.com`.
- Run actual device/TestFlight smoke before claiming App Store-ready.

## Secret-safe reviewer credential setup

Preferred local setup:

```bash
read -s QUIPSLY_REVIEWER_PASSWORD
security add-generic-password -U \
  -a reviewer-capture@dev.test \
  -s quipsly-capture-reviewer \
  -w "$QUIPSLY_REVIEWER_PASSWORD"
unset QUIPSLY_REVIEWER_PASSWORD
```

Then run:

```bash
QUIPSLY_CAPTURE_REVIEWER_EMAIL=reviewer-capture@dev.test \
node scripts/quipsly-capture-reviewer-session-smoke.mjs \
  --base-url=https://nest.quipsly.com \
  --password-keychain-service=quipsly-capture-reviewer \
  --password-keychain-account=reviewer-capture@dev.test \
  --json
```

Native contract proof:

```bash
QUIPSLY_MOBILE_CAPTURE_AUTH_EMAIL=reviewer-capture@dev.test \
node scripts/quipsly-mobile-capture-native-auth-smoke.mjs \
  --base-url=https://nest.quipsly.com \
  --password-keychain-service=quipsly-capture-reviewer \
  --password-keychain-account=reviewer-capture@dev.test \
  --json
```

Generated no-human-password proof:

```bash
scripts/quipsly-live-coaching-generated-auth-smoke.sh
```

This is the fastest broad confidence check for the Homer/coachee runway because
it does not require a shared human password. It does not replace device or
TestFlight review, but it does prove the app-owned booking/capture/mobile
visibility loop against live Nest.

## Payment friendliness decision

For paid one-to-one coaching, Homer owns the operator action that creates the
Stripe checkout link. Once that checkout evidence exists, the coachee session
page may show a direct "Pay securely with Stripe" action.

Rules:

- Coachees should not have to ask Homer to paste a link if Quipsly already has
  the latest checkout URL.
- Quipsly should not collect card details directly.
- Stripe payment remains provider evidence until webhook or receipt evidence
  lands back in Quipsly.
- Payment, consent, recording, transcript, and follow-up packet states stay
  visible as separate human steps.

## Payment smoke boundary

The generated live coaching smoke always proves that Quipsly can create an
app-owned paid one-to-one booking and keep it held for payment. It does not
create a Stripe Checkout Session unless the operator explicitly asks for that
provider-side evidence.

Use the default smoke for normal auth, booking, consent, and capture checks:

```bash
scripts/quipsly-live-coaching-generated-auth-smoke.sh
```

Use the opt-in checkout smoke only when it is safe to create a disposable Stripe
test Checkout Session:

```bash
QUIPSLY_COACHING_SMOKE_CREATE_STRIPE_CHECKOUT=1 scripts/quipsly-live-coaching-generated-auth-smoke.sh
```

The opt-in mode should prove:

- Homer/staff can create a paid one-to-one booking.
- The booking stays held for payment.
- Stripe Checkout evidence is created by an explicit operator action.
- The coachee session API exposes the latest checkout URL.
- Recording remains locked until payment and consent state allow capture.

## Research references

- Stripe Checkout: https://docs.stripe.com/payments/checkout
- Stripe Payment Links: https://docs.stripe.com/payment-links
- Google Calendar events insert: https://developers.google.com/workspace/calendar/api/v3/reference/events/insert
- Apple App Review Guidelines: https://developer.apple.com/app-store/review/guidelines/
- Apple App Privacy Details: https://developer.apple.com/app-store/app-privacy-details/
