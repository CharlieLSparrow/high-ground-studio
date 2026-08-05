# Session capture group and clock

Date: 2026-08-04

Status: implemented locally; next Capture build and cloud migration pending

## Decision

One canonical Quipsly Session represents one recording encounter/take and owns
one server-generated `captureGroupId`. Every retained source intentionally made
for that Session uses that group while preserving its own immutable
`captureId`, upload identity, participant, device, source profile, and
START/STOP receipts.

This is the cross-device rendezvous key. It lets a browser MV7i source, an
iPhone camera source, a Canon card import, and an optional provider safety
recording arrive independently and still be recognized as evidence from the
same take. A retake is a new Session; Quipsly does not silently rotate or reuse
the identity inside an already-recorded Session.

## Why provider recording remains optional

A LiveKit/provider recording can be valuable as a conversation-reference or
safety track. It may make waveform correlation easier and can preserve what
participants actually heard. It is not the synchronization authority and is
never the only master by implication.

Synchronization uses three layers:

1. the server-owned Session capture group identifies the intended take;
2. each device preserves an NTP-style clock burst plus wall and monotonic source
   start evidence for a deterministic first-placement proposal;
3. waveform/opening-cue correlation and a later drift check determine the
   reversible editor placement.

Clock placement always retains uncertainty and always says
`sampleAccurateClaimed: false`. Missing provider media therefore cannot bungle
grouping or block upload. Missing or weak clock evidence makes the source
review-required; it does not fabricate alignment.

## Implemented boundary

- `CallRoom.captureGroupId` is an additive UUID with a unique database index.
- The browser Session recorder receives that exact value instead of minting a
  private group, measures three bounded clock samples, and keeps partial
  evidence when Nest is temporarily unavailable.
- Quipsly Capture receives the same value in its authorized Session projection
  and uses it for audio, video, and coordinated audio/video capture.
- Session imports and Episode Room live recording use the same canonical value.
- Source/upload IDs, exact bytes, participant ownership, consent, START/STOP,
  proxy, transcript, and alignment states remain independent.

## Compatibility and rollout

Build 27 and older protected sources remain valid. Those clients may have
minted one-source or device-local groups; Nest continues to preserve and process
them under the original evidence rather than rewriting history. They simply do
not gain the new automatic cross-device grouping claim.

The next Capture build and the corresponding Nest release must be qualified
together. Before promotion, verify:

1. a browser and iPhone authorized for the same Session receive the same group;
2. their capture and upload IDs remain different;
3. each source retains its own clock samples and START/STOP receipt;
4. the editor proposes a shared-clock placement but still requires waveform and
   late-drift review;
5. old Build 27 uploads still finalize without a forced metadata rewrite; and
6. provider recording can remain off without changing any of the above.

## Explicit non-claims

- This local pass did not record ambient microphone/camera media or accept a
  browser permission prompt.
- It did not physically prove iPhone clock quality, thermal behavior, upload,
  or cross-device drift.
- It did not enable LiveKit egress or promote a cloud revision.
- It does not make a timestamp subtraction sample-accurate synchronization.
