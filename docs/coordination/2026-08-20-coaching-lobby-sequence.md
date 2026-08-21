# Coaching lobby sequence

Date: 2026-08-20
Status: verified local web slice; production promotion and physical call remain open

## Product change

The browser coaching lobby now presents one conventional progression:

1. Session context
2. Participant-owned recording and transcription choice
3. Microphone, optional camera, output, preview, and private sound check
4. Join
5. Record on this device after the conversation is connected

`BrowserSourceRecorder` remains the sole owner of the canonical consent and
retained-source state. `LiveSessionRoom` only controls presentation order and
passes conversation connectivity into that owner. The recorder stays mounted
through the transition so a saved choice is not replaced by parallel lobby
state.

Joining never starts recording. While the person is still in the lobby, the
record, recovery, storage, and Studio handoff controls are hidden and a short
next-step message replaces them. They become available after the call connects.
Sound check now sits inside device readiness before Join instead of below the
video and source evidence surfaces.

Missing capture-group copy was reduced to the one user-actionable fact and
recovery step. Detailed recording, provider, guardian, and source evidence
remain available in secondary surfaces.

## Evidence

- `live-session-room.test.tsx` proves the rendered DOM order is recording
  choice, device group, private sound check, then Join.
- The recorder consent contract proves the Record surface is hidden until the
  conversation is connected.
- Focused Jest suites pass 12/12.
- Quipsly TypeScript passes after route generation.
- The complete optimized production build compiles, typechecks, and generates
  all 194 routes.
- `git diff --check` passes.
- The retained rendered live-room operation signs in independent coach and
  client browsers at 1440x1000 and 390x844, respectively. It proves the lobby
  order, proves no Record action exists before Join, saves each participant's
  consent in the lobby, connects both participants through LiveKit, round-trips
  chat, records two participant-owned local masters, verifies both uploads,
  and measures 4,657 ms of source overlap. No provider recording starts.

Direct inspection of the already-open interactive browser tab was attempted,
but both available browser-control connections detached before the tab could
be claimed. The operated headless flight supplies rendered interaction proof,
but a human visual review of the exact narrow layout remains part of the next
live flight rather than being inferred.

## Release boundary

This is a Nest web change only. It does not alter the released Build 32 iPhone
binary or claim physical coach/client acceptance. The active release remains
unchanged until the web slice passes rendered operation and the broader
hands-off flight.
