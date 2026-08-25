# Native call reconnect recovery

Date: 2026-08-25
Status: race repaired and safe choices operated; real network/CallKit interruption remains deferred

## Outcome

An exhausted LiveKit reconnect can no longer be reclassified as an intentional
hang-up by CallKit's asynchronous end-action handler. Quipsly carries one
explicit call-end disposition through the CallKit transaction:

1. **Person ended** — protect/finish the participant-owned source and do not
   offer Rejoin.
2. **Programmatic cleanup** — close presentation without pretending the person
   ended or stopping an unrelated master.
3. **Reconnect exhausted** — close the stale native call presentation, keep the
   participant master running, preserve the transport-gap evidence, and expose
   **Rejoin call**.

This replaces two independently mutable booleans that could form contradictory
states. The CallKit handler consumes the disposition exactly once. A provider
disconnect and a system/headset hang-up therefore have intentionally different
recording and recovery semantics.

## Remembered re-entry

- The outer room already stores this-iPhone versus companion audio choice.
- Joining muted still defers microphone permission until Unmute.
- After a successful in-call Mute/Unmute, the actual resulting mute state is
  saved as the next Rejoin choice. A denied Unmute remains safely muted.
- After a successful in-call camera change, the actual publication state is
  saved as the next Rejoin choice.
- The current system audio route remains owned by CallKit/`AVAudioSession`.
- Rejoin always requests a fresh short-lived room packet and rechecks the stable
  signed-in owner and current Session authority.
- Rejoin does not start, stop, or claim a Quipsly recording.

## Source-survival boundary

Provider reconnecting opens a wall-clock `call-transport-gap` evidence span on
an active provider-input master. A recovered SDK connection or successful
manual Rejoin closes the span. The evidence deliberately does not call the
interval silence or lost audio; the original must be listened to. The provider
PCM writer remains the participant-owned local source and preserves elapsed
timeline while network transport is unavailable.

## Automated evidence

- Capture App Store static smoke: **1,235/1,235 passed**.
- The shipping app compiles as an unsigned universal iOS Simulator binary with
  `arm64` and `x86_64` slices at `/private/tmp/quipsly-reconnect-derived`.
- `CaptureExperienceUITests.testCallLobbyRemembersSafeDeviceChoicesAcrossRelaunch`
  passed **1/1** on iPhone 17 Pro / iOS 26.3.1 Simulator. It explicitly saved
  this-iPhone audio, microphone off, and camera off, terminated and relaunched
  Capture, then read those exact choices and the route picker back without a
  repeated setup ceremony. Result:
  `/private/tmp/quipsly-reconnect-choice-persistence-20260825-021615.xcresult`.
- Release invariants bind exhausted provider disconnect to
  `.reconnectExhausted`, require the CallKit handler to derive both source
  protection and Rejoin eligibility from that one disposition, and require
  in-call mic/camera results to become the next saved choices.

## Deferred validation, not inferred completion

During a real physical-iPhone recording, interrupt network long enough to see
SDK reconnecting recover once and exhaust once. Confirm the persistent master
continues, the call dock becomes Reconnecting, exhausted transport returns to
one Rejoin action, CallKit cleanup does not stop the master, and Rejoin uses the
latest mic/camera choices and current route. Repeat with background/foreground,
Bluetooth, a system/headset hang-up, camera publication, companion mode, and a
server-closed Session. Read back exact source bytes, segment/clock evidence,
upload, and beginning/gap/rejoined/ending playback. Simulator compilation and
preference relaunch do not prove network recovery, CallKit scheduling order, or
audible source continuity.
