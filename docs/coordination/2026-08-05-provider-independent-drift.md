# Provider-independent capture drift

Date: 2026-08-05

Status: implemented and operated locally; cloud and physical-device release
gates remain open

## Decision

Provider recording remains optional. It can supply a useful room mix,
isolated-track bridge, transcription reference, or recovery witness, especially
when independently captured microphones share no usable acoustic event. It is
not the take identity, clock authority, protected master, or automatic episode
spine.

A provider-off take instead keeps these independent evidence layers:

1. one server-owned Session `captureGroupId` for intended-take identity;
2. immutable per-source UUIDs, bytes, START/STOP receipts, and monotonic
   start/stop boundaries;
3. opening, periodic, and closing server-clock observations for rough offset
   and rate-drift proposals;
4. same-device media timestamps for audio/video captured by one device;
5. shared audible/visible events when the sources contain them; and
6. waveform, playback, later-event, and named human review before placement is
   saved.

No one layer is mislabeled as sample-accurate synchronization.

## Implemented capture contract

- Browser and iPhone sources collect three opening samples.
- Active long sources collect one sample every five minutes.
- Stop records the monotonic stop boundary immediately, before any network
  wait, and then requests three closing samples.
- Network requests are bounded: five seconds in the browser and two seconds in
  Capture.
- Clock histories deduplicate by server-echo-bound sample ID and keep at most
  48 observations: the opening three plus the newest 45.
- Periodic or closing clock failure is non-fatal. It cannot stop, discard,
  relabel, or prevent finalization of protected media.

## Nest projection and editor boundary

Nest selects a clean opening sample and a clean sample from the latest
ten-second epoch at least 30 seconds into the source. It projects the source
start from both monotonic observations, then stores:

- observation interval;
- residual milliseconds;
- observed parts per million;
- conservative combined network and wall-clock uncertainty;
- exact opening/later sample IDs; and
- `sampleAccurateClaimed: false`.

Guided Sync presents this as **Device-clock drift witness**. **Use as comparison
start** copies the interval and residual into review fields, but deliberately
leaves **Later event compared** and **Approve this reversible placement**
unchecked. It does not move the timeline, stretch audio, or resample media.

## Operated evidence

The retained signed-in local Session `QA Provider-Off Sync Boundary 2026-08-05`
was opened through the rendered product with provider copy Off. Readback showed:

- zero provider commands created by viewing the Session;
- zero provider media assets created by viewing the Session;
- the server-owned capture group still visible;
- provider-off synchronization copy visible in the Live Session and coaching
  runway;
- protected local capture described as unaffected; and
- zero browser exceptions.

The implementation also passed:

- iOS simulator build;
- 84 native capture durability assertions;
- 24 coordinated podcast assertions;
- 35 focused editor, browser-clock, alignment, and compatibility tests; and
- Quipsly application/domain TypeScript checks.

## Open release proof

- Deploy and smoke the matching Nest revision after the build-cadence gate.
- Record one shared Session using a physical iPhone plus browser/MV7i source.
- Verify exact capture group, separate source IDs, opening evidence, late
  evidence, stop boundaries, upload, and editor readback.
- Compare a real opening event and a later event; listen and inspect waveforms.
- Decide whether the optional provider witness materially improves the workflow
  before enabling it for an episode.
