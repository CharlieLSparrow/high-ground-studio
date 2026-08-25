# Fresh native coaching recovery proof

Date: 2026-08-24

Candidate: `82e4d1cd10e9d8b2f8e3d1c1b8d7059febd58dde`

Receipt:
`artifacts/coaching-acceptance/a8f95fab/native-capture-recovery-receipt.json`

## Operated result

One automation created a brand-new coach, client, engagement, booking,
invitation, and Session through rendered product UI. It transferred the two
generated passwords only through private parent/child IPC, saved ordinary
client recording/transcription consent, and started the iPhone Simulator app
with a fresh application container.

The invited-client native deep link passed 1/1 with the exact account and
canonical Session. Opening the link did not join the provider room or begin a
recording automatically.

The coach-side native recovery test passed 1/1 and operated:

- native Session selection and recording consent;
- an actual `AVAudioRecorder` take;
- a source-timed moment mark;
- terminal local save and immutable Library row;
- local playback;
- server byte-count and SHA-256 verification;
- a second take through the persistent recorder dock;
- forced application process death during that take;
- protected offline relaunch;
- retained finalized-source and crash-open receipts;
- offline playback of the finalized source;
- authenticated online re-entry; and
- in-app Studio handoff.

Server readback found a canonical production destination bound to the exact
Session and a required retained source with `VERIFIED` recording status,
exact-byte verification, released processing disposition, and a canonical
Studio media asset. Both Xcode result bundles reported zero failures and zero
skips, and the runtime warning audit reported no unexpected warnings.

## Honest boundaries

This was iPhone Simulator evidence with microphone permission pregranted by the
harness. It does not prove the first-run OS permission prompt, a physical
iPhone, natural speech, human listening quality, minimally instructed novice
use, TestFlight, or production scale. The crash-open source remains an
append-only recovery receipt and intentionally does not claim playable bytes.

The next independent call-readiness lane is an exact fresh-account LiveKit
provider join/leave operation. It must not infer real device acceptance from a
Simulator-only CallKit result.
