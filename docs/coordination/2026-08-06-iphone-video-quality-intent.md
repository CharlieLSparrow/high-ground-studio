# iPhone production-video quality intent

Date: 2026-08-06
Status: implemented and simulator-operated; physical-camera qualification open

## Decision

Quipsly Capture treats video quality as creator intent with inspectable
resolution evidence:

- default production: UHD 3840×2160 at exactly 24 fps;
- motion production: UHD 3840×2160 at exactly 30 fps;
- endurance: 1920×1080 at exactly 24 fps.

The app queries the selected front or rear camera. It evaluates every advertised
`videoSupportedFrameRateRanges` interval rather than flattening intervals into a
possibly false minimum/maximum span. It prefers unbinned UHD over a larger 4K
shape when both fulfill the request. It does not substitute another cadence.
An exact-cadence lower-resolution result can remain usable, but the UI and
source receipt call the original intent unfulfilled.

Apple requires active format and frame durations to be configured together
while the device is locked. Apple also identifies camera system pressure as a
runtime constraint that can stop capture. Quipsly therefore locks the resolved
format and equal minimum/maximum frame duration during session configuration,
then exposes camera pressure separately from process thermal state.

References:

- <https://developer.apple.com/documentation/avfoundation/avcapturedevice/format/videosupportedframerateranges>
- <https://developer.apple.com/documentation/avfoundation/avcapturedevice/activeformat>
- <https://developer.apple.com/documentation/avfoundation/avcapturedevice/activevideominframeduration>
- <https://developer.apple.com/documentation/avfoundation/avcapturedevice/systempressurestate-swift.class>
- <https://developer.apple.com/documentation/avfoundation/avcapturemoviefileoutput>

## Source boundary

Source-profile schema v5 retains:

- requested quality intent and whether the resolved resolution fulfilled it;
- actual configured width, height, cadence, codec, color space, camera identity,
  orientation, and audio shape;
- camera system pressure observed immediately before arming;
- the existing monotonic clock and durable room/source receipts.

Quipsly does not lower quality inside a source. Fair or serious camera pressure
becomes visible evidence; serious pressure asks the creator to cool the phone.
Critical or shutdown pressure safely closes the fragmented MOV. Pause, camera
switch, and a new quality choice require a new immutable source boundary.

## Local evidence

- `bash apps/mobile-capture/HighGroundCapture/scripts/test-video-capture-quality-policy.sh`
  passes seven selection cases, including disjoint advertised ranges and UHD
  preference.
- The generic iOS Simulator build passes without warnings from this slice.
- The complete local mobile preflight passes, including Quipsly TypeScript,
  capture/static contracts, ingestion idempotency, session evidence, provider
  room checks, and both simulator architectures.
- Two focused iPhone 17 Pro simulator journeys pass: explicit quality choices at
  normal text size and reachability plus accessibility audit at accessibility
  XXXL.
- Result bundle:
  `/tmp/quipsly-video-quality-derived/Logs/Test/Test-HighGroundCapture-2026.08.06_18-50-12--0600.xcresult`.

## Remaining physical gate

On a supported iPhone, record each profile on front and rear cameras. For every
take, read back the saved MOV's actual encoded/presentation dimensions, nominal
frame rate, transform, codec, audio-track expectation, duration, and complete
decode. Exercise pause/resume, front/rear switch, foreground loss, serious and
critical pressure where safely reproducible, low storage, relaunch, local
playback, resumable upload, exact cloud verification, capture-group
materialization, and editor playback. Until that passes, this work is not
described as physical-camera or TestFlight qualified.
