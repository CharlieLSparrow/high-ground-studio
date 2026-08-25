# Capture native session availability repair

Date: 2026-08-24

## What the fresh flight found

The fresh coach/client native recovery flight created and accepted an ordinary
coaching invitation, saved client recording/transcription consent, and then
failed while opening the exact Session in a newly installed iPhone Simulator
app. Firebase email/password exchange succeeded. The Nest log recorded the
actual failure as `Connection terminated due to connection timeout` while
building `/api/mac/session-check`.

The route previously converted every exception into HTTP 401 with a Firebase
sign-in instruction. That made a database availability fault look like bad
credentials, encouraged unnecessary sign-in attempts, and withheld the
retryable nature of the failure from Capture and support evidence.

## Repair

- Firebase bearer verification now distinguishes token rejection from Quipsly
  identity resolution. A database failure after Firebase success retains its
  original availability evidence.
- Shared service-availability classification covers connection refusal,
  connection timeout, Prisma transaction-pool timeout, and the observed
  connection-timeout messages.
- `/api/mac/session-check` returns:
  - `401 NATIVE_SESSION_AUTHENTICATION_REQUIRED` only for invalid or missing
    Firebase bearer identity;
  - `503 QUIPSLY_SERVICE_UNAVAILABLE` with `Retry-After: 1` for a database
    availability failure;
  - `500 NATIVE_SESSION_CHECK_FAILED` for an unexpected server failure.
- Capture retries a `503` session check twice with a short bounded backoff. It
  does not retry invalid credentials and does not loop indefinitely.
- The browser session route uses the same shared database-availability
  classifier, preserving its existing 503 behavior while also recognizing the
  timeout shape observed in this flight.

## Verification

- 7 focused Jest tests passed across native session-check, Firebase bearer,
  and browser session boundaries.
- Strict Quipsly TypeScript passed.
- The complete unsigned iPhone Simulator `build-for-testing` passed with the
  pinned LiveKit and Google Sign-In dependency graph.
- The App Store static contract passed 1,177/1,177 checks.

This is local automated evidence. It does not replace physical-iPhone,
TestFlight, live-service, or minimally instructed human acceptance.
