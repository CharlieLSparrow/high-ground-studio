# Session provider presence readback

Date: 2026-08-04

Branch: `codex/quipsly-product-20260724`

Scope: authorized, current LiveKit participant and track-state visibility beside
the durable Session access ledger

## Outcome

The Session manager now performs a separate LiveKit administrative readback and
shows which devices the provider currently reports in the room. Each safe
device row includes its canonical participant, role and current Quipsly access
state, browser/Capture device label, joined time, and whether audio and video
tracks are published or muted.

This closes the visibility gap without changing the meaning of existing
records:

1. invitation and access activity is durable history;
2. participant `accessStatus` is current Quipsly authorization;
3. an unexpired join-key lease is prepared device authority;
4. provider presence is a timestamped current observation.

None is substituted for another. Provider presence is never used as recording,
retained-source, speaking, consent, or authorization proof.

## Server boundary

`GET /api/sessions/<roomId>/presence` uses the narrower Session invitation and
participant-management authority. Authentication occurs before Prisma or
LiveKit access, and an unauthorized actor receives the same private 404 room
boundary used by participant management.

The server loads canonical participants and bounded provider-grant receipts,
then calls LiveKit `listParticipants` with server-only administrative
credentials. The projection:

- maps exact provider identities to canonical participants server-side;
- selects the latest device metadata for each exact identity;
- exposes an opaque SHA-256-derived row ID instead of the provider identity;
- reports published/muted audio and video state without track IDs;
- counts an unmatched provider device as attention without exposing its
  identity or provider-supplied name;
- marks a connected device whose canonical access is `REMOVED` as attention;
- returns `UNAVAILABLE` or `FAILED`, with unknown counts, rather than inferring
  presence from receipts when readback cannot run.

The response is private/no-store and explicitly records that it was read-only,
did not change participant access, did not change invitation history, and did
not change recording.

## Host UX

The access manager requests presence when opened and refreshes it every ten
seconds only while open. A manual `Read now` control remains available. It
shows:

- connected device and canonical-person counts;
- the exact observation time;
- browser versus Quipsly Capture device labels;
- audio published/muted/not-published state;
- video published/muted/not-published state;
- an explicit warning for unmatched devices or removed canonical access;
- honest unavailable and failed states.

The durable activity stream and unexpired join-key list remain visible beside
the live observation so a host can diagnose disagreement instead of seeing one
overloaded green dot.

## Operated proof

`pnpm quipsly:local:session-invitation` used two signed-in browser contexts,
loopback PostgreSQL, Firebase Auth, Nest, and self-hosted LiveKit. The operation
proved:

- the client roster and administrative readback both saw two connected devices
  mapped to two active canonical people;
- both fake-device participants published audio according to LiveKit;
- the safe response contained no provider identity, token JTI, participant
  token, API key, or API secret fields;
- canonical guest removal converged provider readback to host-only: one device,
  one person, and no device mapped to the removed participant;
- the guest browser observed the disconnect signal;
- restoration did not rejoin the guest or start recording;
- chat, access-history, join-key, and removal-denial proofs remained green.

Focused presence, route, and UI coverage passes 12 tests. Full Nest Jest passes
297 suites / 1,552 runnable tests with 38 suites / 110 tests intentionally
skipped. TypeScript and the optimized 172-static-page production build pass.

## Remaining gates

- Repeat the same observation/removal sequence on deployed LiveKit Cloud with a
  physical iPhone and a browser connected simultaneously.
- Verify real Canon R8 and MV7i publication, mute, route change, reconnect, and
  device-removal behavior through supported browsers.
- Add operational alerting when unmatched or removed-but-connected devices
  persist across observations.
- Keep participant-facing in-call roster latency separate from host-only
  administrative readback; neither should become retained source truth.
