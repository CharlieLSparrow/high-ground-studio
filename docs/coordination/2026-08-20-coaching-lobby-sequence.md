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
- `git diff --check` passes.

Browser-side visual inspection was attempted against the running local app,
but both available browser-control connections detached before the local tab
could be claimed. This is not counted as rendered visual proof. The next live
browser flight must inspect narrow and desktop layouts before promotion.

## Release boundary

This is a Nest web change only. It does not alter the released Build 32 iPhone
binary or claim physical coach/client acceptance. The active release remains
unchanged until the web slice passes rendered operation and the broader
hands-off flight.
