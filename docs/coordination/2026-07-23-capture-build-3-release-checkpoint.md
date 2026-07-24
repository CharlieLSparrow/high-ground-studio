# Capture build 3 release checkpoint

**Date:** 2026-07-23  
**Status:** Uploaded and processing; production API promotion, compliance, and
physical-iPhone proof remain open

## What changed

Quipsly Capture `1.0 (3)` is the first uploaded candidate that contains the
personal-work destination introduced in `a4d13a3`:

- Note, Task, and Goal can explicitly target the signed-in creator's private
  Home Nest even when a session is selected.
- Canonical project tags, task due dates, reminder intent, recurrence, and
  offline request identity remain part of the existing native contracts.
- Preview mode still refuses to claim that it persisted work.

Build 2 remains useful historical evidence for the camera-purpose-string fix,
but it predates this Home Nest behavior and is not the current product
candidate.

## Exact candidate

The candidate was generated from clean Capture source revision
`b6f955c09f97f025408ac6517bc2ae127d174e9d`:

- archive:
  `/tmp/quipsly-capture-release/b6f955c09f97/QuipslyCapture-1.0.3.xcarchive`;
- IPA:
  `/tmp/quipsly-capture-release/b6f955c09f97/QuipslyCapture-1.0.3.ipa`;
- receipt:
  `/tmp/quipsly-capture-release/b6f955c09f97/QuipslyCapture-1.0.3-release-receipt.json`;
- IPA bytes: `17,573,763`;
- IPA SHA-256:
  `83c4a1d93f186295c781bfd2709f82415f048f30407f154e16853913fe970f6f`.

The receipt hash and an independent `shasum -a 256` readback agree.

The exported IPA verifier proved:

- Apple Distribution signing for team `585GUXMY5M`;
- App Store profiles for app and Share Capture extension;
- `get-task-allow = false` and `beta-reports-active = true`;
- strict nested signatures;
- matching app/extension version `1.0 (3)`;
- packaged privacy manifest, bounded microphone/camera purposes, and background
  audio.

## Simulator proof

The exact build-number source passed the serial deterministic lane on iPhone 17
Pro Simulator, iOS 26.3.1:

- 20/20 Capture journeys;
- 2/2 login journeys;
- 3/3 Share Capture extension journeys;
- 25 passed, 0 failed, 0 skipped.

The finalized result bundle is:

`/tmp/quipsly-capture-ui-tests/a905f797083a/HighGroundCapture.xcresult`

The suite includes private Home Nest note/task routing while a session is
selected, canonical tags, due dates, reminder permission/relaunch recovery,
recurrence, goal evidence, transcript truth boundaries, explicit recording
consent, accessibility, account login/recovery, and protected Share Capture
outbox recovery.

## Upload truth

The signed-in Xcode account uploaded the verified archive directly with
`xcodebuild -exportArchive` and `destination=upload`. Apple reported:

- upload reached 100%;
- uploaded package began processing;
- `Upload succeeded`;
- `Uploaded HighGroundCapture`;
- `EXPORT SUCCEEDED`.

This is upload proof, not processing, compliance, TestFlight-install, or App
Store-review proof. The local release receipt records the upload completion at
`2026-07-24T02:53:01Z`.

LiveKit's binary WebRTC and Rust frameworks do not include all matching dSYMs,
so Apple emitted third-party symbol-upload warnings. LiveKit documents that the
WebRTC warning does not block App Store submission or review. App-owned dSYMs
are present; crashes inside those vendor binaries may have incomplete
symbolication.

## Nest compatibility gate

Build 3 defaults to `https://nest.quipsly.com`. Its matching Home Nest server
contract was deployed and operated on the tagged preview revision:

- source `a4d13a3538839794c5724b17f0476d3aab77e510`;
- Cloud Run revision `studio-00398-cuz`;
- tag URL `https://quipsly-preview---studio-hm2odnvjga-uc.a.run.app`;
- signed reviewer and real Note/Task/Goal/tag readback passed;
- first saves were not replays, exact repeated request IDs were replays;
- no provider, Stripe, Calendar, recording, or external side effects occurred.

Production traffic still points to older known-good revision
`studio-00331-kll`. Do not distribute Build 3 as a working Home Nest candidate
until the matching preview is intentionally promoted, production traffic and
source metadata are read back, and the signed mobile contract is repeated
against `https://nest.quipsly.com`.

## Open release gates

1. App Store Connect must finish processing Build 3.
2. The account holder must answer export compliance. The binary links
   LiveKit/WebRTC and uses transport security and integrity hashing; no legal
   encryption attestation was guessed.
3. Promote the validated Nest revision intentionally, then prove production
   auth and Home Nest Note/Task/Goal/tag readback.
4. Make the unlocked, trusted iPhone visible to CoreDevice. Current USB and
   CoreDevice inventories contain no iPhone.
5. Install Build 3 from TestFlight and repeat real permission, recording,
   offline/relaunch, reminder, upload, and Nest readback drills.
6. Complete current App Store metadata, screenshots, privacy labels, support
   and privacy URLs, age rating, and final review notes.
7. Approve a deletion SLA and retention policy. Apple's manual deletion path
   can take time, but the app must state the expected duration and confirm
   completion. The current request workflow does not yet close that operating
   loop.

The upload is a major delivery checkpoint. It is not approval to submit the
candidate for App Review.
