# Native call audio routing

Date: 2026-08-25
Status: implemented and operated on iOS Simulator; physical-route listening remains deferred

## Outcome

Quipsly Capture now shows the microphone and listening destination as separate
facts in the outer room and connected call. A participant using this iPhone for
call audio gets Apple's standard route picker for available system destinations.
A persistent in-call **Speaker** control uses the supported
`AVAudioSession.overrideOutputAudioPort` boundary to switch the built-in speaker
override on or off.

Quipsly does not maintain a parallel Bluetooth or output-selection database.
CallKit and the process-wide `AVAudioSession` remain authoritative; Capture
observes route-change notifications and updates the rendered output name and
speaker state from the actual current route. Companion mode hides the route
picker because that iPhone deliberately owns neither remote audio subscription
nor microphone publication.

## Architecture

- `CaptureAudioSessionCoordinator` owns the shared local-recording, provider,
  CallKit, playback, and Shared Watch audio policy.
- The coordinator publishes normalized current input/output route truth and
  built-in-speaker state from `AVAudioSession.currentRoute`.
- Hardware and system changes refresh the snapshot through
  `AVAudioSession.routeChangeNotification`.
- `AVRoutePickerView` presents available external/system destinations; Quipsly
  styles and labels the control but does not synthesize routes.
- The connected dock's Speaker action changes only the built-in speaker
  override. Clearing it lets iOS restore its receiver or selected external
  route.
- Call route selection does not start recording, change consent, replace the
  participant master, or create a provider egress recording.

## Automated evidence

- Capture App Store static smoke: **1,226/1,226 passed**.
- The shipping app compiles as an unsigned universal iOS Simulator binary with
  `arm64` and `x86_64` slices at
  `/private/tmp/quipsly-audio-route-derived`.
- `CaptureExperienceUITests.testRecorderLeadsWithAStandardCallGreenRoom` passed
  **1/1** on iPhone 17 Pro / iOS 26.3.1 Simulator. It operated this-iPhone and
  companion audio choices, proved separate microphone/output labels, proved the
  system picker is reachable only when this endpoint owns call audio, and
  restored the route UI after returning from companion mode. Result:
  `/private/tmp/quipsly-audio-route-commit-green-room-20260825-020806.xcresult`.
- The retained signed-in provider-room journey now requires the route picker in
  the real lobby and the Speaker action after a successful connection. A
  Simulator that cannot activate CallKit still fails closed and cannot be
  represented as real route media evidence.

## Deferred validation, not inferred completion

On physical iPhones, use built-in receiver/speaker, wired headphones, AirPods or
another Bluetooth HFP device, USB audio where supported, and route removal while
joined and while a participant-owned source is recording. Confirm both displayed
route names, routed remote speech, routed microphone speech, Speaker toggle
behavior, mute state, reconnect behavior, Shared Watch safety, and that every
route transition preserves the local master and source-clock receipts. Repeat
with a companion iPhone to confirm no picker or echo. Simulator UI cannot prove
audibility, hardware routing, Bluetooth profile choice, or recording fidelity.

## Environment note

The first focused test retry failed before app launch because Xcode exhausted
the startup disk while writing a fresh module cache. Six explicitly named,
regenerable DerivedData directories from the preceding simulator lanes were
deleted, freeing about 8.8 GB. No source media, repository data, or retained
passing result bundle was removed. The identical current-source test then
passed.
