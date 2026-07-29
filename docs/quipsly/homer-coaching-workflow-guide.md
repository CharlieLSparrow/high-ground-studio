# Homer coaching workflow guide

Status: beta handrail for Homer and trusted coaching testers.

Quipsly's job is to make coaching logistics calm: who the session is with, whether payment is handled, whether recording consent is clear, what can be recorded, and what follow-up material is ready.

The goal is that Homer does not need this guide for long. If the interface makes him memorize steps, the interface still needs work.

## The whole flow in one page

1. Sign in to [Nest](https://nest.quipsly.com).
2. Open `Coaching`.
3. Create or review the coaching session.
4. If it is paid one-to-one coaching, create the Stripe payment link.
5. Copy the client session link and send it to the coachee.
6. The client pays if payment is required.
7. The client grants or declines recording consent.
8. Record only after consent is granted.
9. Quipsly uploads, transcribes, and prepares review material.
10. Homer reviews notes, action items, and follow-up before anything is sent.

## What Homer should open

Use the coaching runway in Nest.

It should answer these questions without detective work:

- Who is the client?
- What is the session title and time?
- Is this free/manual or paid one-to-one?
- If paid, is payment pending, ready for checkout, or paid?
- Is there a client session link?
- Is recording consent missing, granted, declined, or revoked?
- Is recording allowed right now?
- Is a recording uploaded?
- Is a transcript ready?
- Is a follow-up packet ready for review?

If one of those answers is unclear, that is product feedback, not Homer failure.

## The simplest beta workflow

### 1. Create the session

Create the appointment in the coaching runway with:

- Client email
- Session title
- Date and time
- Price if it is paid one-to-one coaching
- Session type or offering if available

Quipsly should create the app-owned booking, capture room, participant, and consent state. Stripe and calendar are evidence providers, not the source of truth.

### 2. Send the client session link

Use `Copy client session link` from the session card.

That link sends the coachee to one calm page for:

- Payment status
- Stripe checkout link when needed
- Recording consent
- Recording status
- Transcript/follow-up status later

The link does not grant access by itself. The client still signs in with the email Homer invited or used on the booking.

### 3. Request payment if needed

For paid one-to-one coaching:

1. Check that the session details and price are correct.
2. Click `Create payment link`.
3. Send the client session link or the Stripe payment link.
4. Wait for payment evidence before treating the session as paid.

Important truth rule:

Stripe handles the card form. Quipsly owns the booking, room, consent, recording, transcript, packet, and payment evidence record.

### 4. Get recording consent

The client session page should clearly say that recording is optional and consent-based.

Client options:

- Grant recording consent
- Decline recording
- Revoke consent after granting

Practical language Homer can use:

> This session can be recorded and transcribed so we can prepare better follow-up notes. You can say yes or no. If you say no, we can still meet without recording.

Recording must stay off until consent is visibly granted.

### 5. Record the session

Before recording, confirm:

- Correct client
- Correct session
- Payment is resolved if required
- Recording consent is granted
- The capture app/session page says recording is allowed

Then record through the approved capture path.

Do not record under a random local label when a real scheduled session exists.

### 6. Review the follow-up packet

After recording and transcription:

1. Review transcript quality.
2. Correct obvious speaker or wording issues if needed.
3. Build or open the follow-up packet.
4. Review notes, themes, and action items.
5. Mark what is actually approved.
6. Send or summarize only reviewed material.

Quipsly can prepare candidate notes and action items. Homer owns the coaching judgment.

## What the statuses mean

- `No payment required`: this session does not need Stripe inside Quipsly.
- `Payment pending`: paid session exists, but Quipsly does not have payment evidence yet.
- `Payment link ready`: Stripe Checkout exists and can be sent.
- `Paid`: Stripe payment evidence is attached.
- `Consent needed`: do not record yet.
- `Consent granted`: recording can be enabled for this session.
- `Consent declined`: meet without recording.
- `Recording uploaded`: media exists; transcription can run or continue.
- `Transcript complete`: review and packet preparation can happen.
- `Packet ready`: review before sending or acting on it.

## If something looks wrong

### Client says they paid, but Quipsly still says pending

Do not panic. Treat it as evidence not synced yet.

1. Open the Stripe link or receipt if visible.
2. Refresh the coaching runway.
3. Keep the session marked pending until Stripe evidence lands or an admin reconciles it.

### Client cannot see their session

Check:

- Did they sign in with the same email on the booking?
- Did Homer copy the client session link, not only the Stripe link?
- Does the booking have the correct client email?

### Recording button is unavailable

Check:

- Is consent granted?
- Is the session canceled?
- Is the capture room ready?
- Is payment required but unresolved?

### Transcript or packet is missing

Check:

- Was a recording uploaded?
- Is transcription queued or complete?
- Is the packet built from completed transcript evidence?

## What is ready now

- Firebase sign-in works on Nest.
- Users can land in Quipsly with free-tier access and a Home Nest.
- Coaching booking records exist.
- Manual/free bookings and paid one-to-one booking state are wired.
- Client session pages can show payment, consent, recording, transcript, and packet state.
- Recording consent can be granted, declined, and revoked.
- Recording stays locked until consent is granted.
- Stripe checkout evidence is wired as the paid one-to-one payment path.
- The guide and UI distinguish payment, consent, recording, transcript, packet, and publication/share states.

## What still needs polish before this is guide-optional

1. Run a full opt-in Stripe test checkout smoke and prove payment evidence lands end-to-end.
2. Make scheduling more calendar-grade and less form-like.
3. Smoke the capture app on a real device against a real coaching session.
4. Make transcript and packet review feel like a coaching workspace, not a developer board.
5. Decide email/calendar reminder behavior.
6. Add a client recovery path for payment or login confusion.
7. Continue simplifying labels until Homer can run the session from the runway without remembering the sequence.

## Product standard

Homer should feel like Quipsly is quietly keeping track of the logistics while he focuses on coaching.

The app should lead him through:

- Create the session.
- Request payment if needed.
- Confirm payment evidence.
- Ask for recording consent.
- Capture the call.
- Review transcript.
- Prepare follow-up.
- Send reviewed next steps.

If a state is uncertain, Quipsly should say what is known, what is missing, and the next safe action.
