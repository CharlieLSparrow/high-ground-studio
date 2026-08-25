# Native pre-join camera lobby

Date: 2026-08-25
Status: implemented and operated on iOS Simulator; physical-camera/provider validation remains deferred

## Outcome

Quipsly Capture now gives an iPhone participant the conventional camera choice
before joining a call. Camera starts privacy-safe in the remembered off state.
Turning it on is the explicit camera-permission boundary, opens a real local
preview, and exposes one front/back switch. Join remains available if the camera
is denied or unavailable.

After a successful room connection, a prepared camera-on choice publishes the
same authoritative AVFoundation frames used by Quipsly's local preview and
potential retained movie. It never opens LiveKit's competing convenience camera
session. Live call video remains a lower-bandwidth presentation track;
participant-owned 4K/24 recording remains a separate explicit action and the
source of truth.

## Product behavior

- Call audio, microphone publication, and camera publication are three separate
  remembered choices in one outer room.
- Camera access is requested only after the person turns Camera on.
- A real self-preview appears only after the exact camera profile is prepared.
- Front/back switching re-prepares the one authoritative camera graph before
  Join.
- Join succeeds as audio/muted audio even when camera preparation fails.
- A camera-on choice publishes only after provider-room connection succeeds.
- Turning Camera off releases an unowned lobby preview without creating or
  deleting source media.
- Leaving the Record tab closes an unjoined call preview, preventing hidden
  camera use. An active retained source or connected call keeps its own explicit
  lifecycle.
- Starting and stopping a Quipsly recording remains separate from Join and live
  camera publication.

## Automated evidence

- Capture App Store static smoke: **1,213/1,213 passed**.
- The shipping app compiles as an unsigned universal iOS Simulator binary with
  `arm64` and `x86_64` slices at
  `/private/tmp/quipsly-prejoin-camera-derived`.
- `CaptureExperienceUITests.testRecorderLeadsWithAStandardCallGreenRoom` passed
  **1/1** on iPhone 17 Pro / iOS 26.3.1 Simulator. The operated lobby includes
  the privacy-safe Camera off control alongside call-audio and microphone
  choices. Result:
  `/private/tmp/quipsly-prejoin-camera-commit-green-room-20260825-015227.xcresult`.
- The retained signed-in provider-room journey now requires the ordinary camera
  choice to be reachable before Join while deliberately leaving it off in the
  microphone-permission flight.

## Deferred validation, not inferred completion

On a physical iPhone, operate first-use Allow, denial and Settings recovery,
front/back preview, rotation, background/foreground, tab departure, join with
camera on/off, camera failure with surviving audio, in-call camera changes,
rejoin, and simultaneous participant-owned 4K/24 recording. With a real second
participant, verify remote framing, latency, mute/camera state, no competing
camera session, no source interruption, and playable exact-source upload
readback. Simulator UI and static frame-ownership contracts do not prove camera
hardware, provider transport, or retained-media quality.
