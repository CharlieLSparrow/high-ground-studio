# Quipsly Capture Build 27 qualified candidate

Date: 2026-08-03

Status: sealed no-upload TestFlight candidate; physical-iPhone and provider distribution remain open

## Outcome

Quipsly Capture 1.0 (27) is a signed, exported, independently verified release
candidate from exact committed source. It has not been uploaded to Apple, added
to a TestFlight group, installed from TestFlight, or represented as physically
accepted.

The candidate deliberately batches a meaningful product increment beyond the
Build 26 public baseline:

- complete multi-segment transcript evidence spans and direct Session packet
  review;
- playback-reviewed packet materialization into canonical work;
- canonical iPhone focus planning with a protected retry-safe outbox;
- iPhone-only binary compatibility and App Store presentation corrections;
- a hard iOS 26 tab-bar/content boundary for dense scrolling surfaces; and
- a corrected packet-note workflow that permits purpose/audience inspection
  before playback review while keeping the canonical Save action locked.

## Qualification defect found and repaired

The first exact-source attempt used commit
`c3feb46f6cd6de2b30058031fbdb1d6c8f363be3`. Its release qualifier executed all
54 serialized Capture, login, and Share Extension journeys and stopped with
53 passes and one failure. It did not archive, export, or upload an app.

The failure was product truth, not release noise. The packet-note card disabled
**Review & save note** until every source segment had playback confirmation,
even though opening the review creates nothing and the actual Save control
already enforces the complete-review requirement. That prevented a person from
inspecting purpose and audience early.

Source `56f3e85d8934bb5a50f929f019e1bd6e08a0a46a` separates those decisions:

- **Review note details** remains available before full playback review;
- the warning still requires listening through and confirming every source
  segment;
- title, body, purpose, and audience can be inspected without a write; and
- **Save source-linked note** remains disabled until the complete evidence span
  is reviewed.

The repaired focused compiled-app journey passed 1/1 at:

`/Volumes/My Passport/Quipsly QA Artifacts/Build 27/Fix Validation/Results/PacketNoteReview.xcresult`

The retained failed qualification bundle is:

`/Volumes/My Passport/Quipsly QA Artifacts/Build 27/UI Tests/c3feb46f6cd6/20260803T044037Z-68368/HighGroundCapture.xcresult`

## Exact candidate identity

- source revision:
  `56f3e85d8934bb5a50f929f019e1bd6e08a0a46a`
- source isolation: detached committed worktree
- version/build: `1.0 (27)`
- IPA bytes: `22,555,819`
- IPA SHA-256:
  `ae6a9cd654c2a8ed8b3f263c71a71bdba0056aa51dff98696ca7f6f33d3a4a84`
- upload attempted: `false`
- physical TestFlight install read back: `false`

The mode-0600 release receipt is:

`/Volumes/My Passport/Quipsly QA Artifacts/Build 27/Releases/56f3e85d8934/20260803T052844Z-86343/QuipslyCapture-1.0.27-release-receipt.json`

The signed archive and sealed IPA are colocated with that receipt. The UI
result bundle is:

`/Volumes/My Passport/Quipsly QA Artifacts/Build 27/UI Tests/56f3e85d8934/20260803T052844Z-86343/HighGroundCapture.xcresult`

## Evidence

- deterministic compiled-app qualification: 54 passed, 0 failed, 0 skipped;
- source verifier: passed at app and extension version `1.0 (27)`;
- signed archive: succeeded;
- App Store export: succeeded;
- app identifier: `com.highgroundodyssey.HighGroundCapture`;
- Share extension identifier:
  `com.highgroundodyssey.HighGroundCapture.ShareCapture`;
- app and extension: Apple Distribution team `585GUXMY5M`, App Store profiles,
  distribution-safe entitlements, and strict nested signatures;
- packaged platform: iPhone only, `UIDeviceFamily = [1]` and
  `CFBundleSupportedPlatforms = ["iPhoneOS"]`;
- packaged privacy manifest, camera/microphone purpose strings, audio/VoIP
  background modes, and export-compliance declaration: passed; and
- independent post-lane byte count, SHA-256, result summary, and complete
  artifact verifier rerun: passed.

## Release decision and remaining boundary

Build 27 is qualified for the separately guarded sealed-candidate upload lane.
It is not yet a distributed TestFlight build and is not App Store ready. No
provider action was taken in this checkpoint.

Current CoreDevice/USB readback did not enumerate an iPhone. It listed only the
previously paired Layla and Morbo iPads as unavailable. That absence does not
invalidate the signed candidate, but it leaves physical installation, capture,
interruption/route-loss recovery, upload, assembled playback, timeline
alignment, cross-device readback, and final screenshot approval open.

The next provider decision is whether to upload this exact sealed IPA without
rebuilding it. After Apple processing, promotion still requires independent
Build 27 identity readback, deliberate tester assignment, and the complete
physical-iPhone operation. App Privacy publication, DSA trader determination,
Mac/Vision opt-out, production disposable-account deletion, and approved final
screenshots remain separate App Store gates.
