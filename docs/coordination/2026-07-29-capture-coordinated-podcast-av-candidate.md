# Quipsly Capture Coordinated Podcast A/V Candidate

Date: 2026-07-29

## Exact source

- Branch: `codex/quipsly-product-20260724`
- Feature commit: `5920e525`
- Commit subject:
  `feat(capture): coordinate local podcast audio and video`
- App Store version/build in source: `1.0 (8)`
- Release decision: do not upload or assign this feature as Build 9 until its
  physical-iPhone gate is complete. Build 8 remains the honest external
  rehearsal lane.

## Product outcome

The iPhone Record surface now has four explicit source modes:

1. **Audio** — one local microphone master; may coexist with LiveKit.
2. **Podcast audio + video** — separate AAC microphone and video-only MOV
   masters under one capture-group identity; may coexist with LiveKit.
3. **Solo video** — one camera-and-microphone MOV; LiveKit is blocked.
4. **Podcast camera** — one video-only MOV beside LiveKit or another audio
   recorder.

Podcast A/V uses one visible Start/Stop action but never hides the two source
identities. Each source has its own UUID, durable START/STOP boundary,
server-clock burst, monotonic clock, file, recovery state, upload job, and
editor lane. The sources share only the capture-group identity and Session
authority. Final synchronization remains a clock/waveform proposal that a
human reviews.

Pause closes and validates the current movie boundary before calling the group
paused. Resume starts the camera first, waits for AVFoundation's delegate
confirmation, and then resumes audio. Flip leaves the microphone master
running while it closes the current movie and opens the other camera as a new
video source in the same group.

The app observes camera-session interruptions and runtime errors, closes
recoverable fragments, and never silently restarts or claims continuity. A
partial startup or unexpected source ending closes and preserves its partner.
Provider join, leave, mute, and route controls remain locked while the
audio-bearing group is active.

## Privacy and pipeline corrections

- The bundled privacy manifest now declares Apple's specific
  `NSPrivacyCollectedDataTypePhotosorVideos` category as linked,
  non-tracking, app-functionality data.
- The LiveKit simulator validator now uses an explicit disposable DerivedData
  path instead of silently growing a developer's global Xcode cache.
- The default mobile preflight runs the coordinated-capture contract.

## Verified evidence

- `scripts/quipsly-mobile-capture-preflight.sh`: passed end to end.
- Quipsly TypeScript: passed.
- Privacy manifest lint: passed.
- App Store static gate: **721/721**.
- Coordinated podcast capture contract: **20/20**.
- Capture durability contract: **73/73**.
- Account isolation contract: **15/15**.
- Universal iOS simulator build with LiveKit and Google dependencies: passed
  for the canonical simulator architectures.
- Deterministic UI test:
  `CaptureExperienceUITests.testVideoModesExplainAndExposeTheExactLocalSourceBeforeCameraPermission`:
  passed on the booted iPhone 16e simulator.

The UI test proves that the four-mode picker is reachable and that Podcast A/V
shows the separate microphone status and two-source truth before asking for a
camera permission. A simulator cannot prove real simultaneous camera,
microphone, route, LiveKit, thermal, or storage behavior.

## Physical-iPhone gate

Do not call this production-qualified until one real iPhone proves:

1. Join the exact Nest-issued LiveKit Session with headphones.
2. Prepare Podcast A/V and read back the actual microphone route and camera
   profile.
3. Start once and confirm the app claims two-source recording only after both
   sources are active.
4. Speak while viewing remote-room audio; verify no provider disconnect or
   route theft.
5. Mark, pause, resume, and Flip front/back while audio remains continuous
   across the camera boundary.
6. Stop and play every local source from Library.
7. Verify distinct audio/video source UUIDs and one shared capture-group UUID.
8. Verify START/STOP receipts, upload jobs, exact cloud verification, relaunch
   recovery, and preservation of local originals.
9. Import the sources into the Episode timeline, review clock placement and
   waveform sync, and audition the assembled result.
10. Exercise backgrounding, route loss, camera interruption, constrained
    storage, and a warm-device stop without accepting a false success state.

Only after that gate should the release lane bump to Build 9, create an archive
from an exact committed SHA, verify the IPA/privacy/entitlements/source
receipt, upload it, and deliberately assign it to the external rehearsal group.

## Architecture

The full implementation and acceptance contract is
[`../quipsly/ios-coordinated-podcast-capture.md`](../quipsly/ios-coordinated-podcast-capture.md).

Apple boundaries used by the design:

- [AVAudioSession playAndRecord](https://developer.apple.com/documentation/avfaudio/avaudiosession/category-swift.struct/playandrecord)
- [AVAudioSession voiceChat](https://developer.apple.com/documentation/avfaudio/avaudiosession/mode-swift.struct/voicechat)
- [AVCaptureMovieFileOutput](https://developer.apple.com/documentation/avfoundation/avcapturemoviefileoutput)
- [AVCaptureSession runtime errors](https://developer.apple.com/documentation/avfoundation/avcapturesession/runtimeerrornotification)
- [App privacy data types](https://developer.apple.com/documentation/bundleresources/app-privacy-configuration/nsprivacycollecteddatatypes/nsprivacycollecteddatatype)
