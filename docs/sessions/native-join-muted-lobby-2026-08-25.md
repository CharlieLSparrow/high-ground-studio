# Native join-muted call lobby

Date: 2026-08-25
Status: implemented and operated on iOS Simulator; physical-device provider-media validation remains deferred

## Outcome

Quipsly Capture now treats listening to a call and publishing the iPhone
microphone as separate decisions. A participant can join the ordinary call on
this iPhone with the microphone off, hear everyone else, and grant microphone
permission only if they later tap **Unmute**. Selecting another device for call
audio remains a distinct companion mode that neither subscribes to remote call
media nor publishes the iPhone microphone.

The call lobby remembers both choices independently. Rejoining therefore keeps
the person's selected call-audio endpoint and microphone state without turning
recording on. Starting a retained Quipsly recording remains a separate,
deliberate action.

## Shipping behavior

| Lobby choice | Remote call audio | iPhone microphone | Permission boundary |
| --- | --- | --- | --- |
| This iPhone + Microphone on | Subscribed | Published after Join | Join, only when iOS has not already remembered the decision |
| This iPhone + Microphone off | Subscribed | Not published | First explicit Unmute |
| Call audio on another device | Not subscribed | Not published | None on this iPhone |

If microphone access was denied, joining muted does not lead with Settings
paperwork. The participant stays connected and can listen. A Settings recovery
action appears when they try to use the microphone, while the call and any
separately running participant-owned recording remain intact.

## Architecture boundary

- `CapturePhoneShell` persists and exposes call-audio and microphone choices as
  separate pre-join controls.
- `CaptureExperienceModel` requests microphone permission only for an
  immediate microphone-on join and carries `joinMuted` separately from endpoint
  role.
- `ProviderRoomController` keeps LiveKit subscription and publication
  independent: a muted primary endpoint subscribes but does not publish; a
  companion endpoint does neither.
- Unmute rechecks the stable signed-in owner after the asynchronous permission
  boundary before publishing media.
- CallKit/audio-session presentation, provider-room membership, and retained
  source recording remain separate responsibilities.

## Automated evidence

- Capture App Store static smoke: **1,199/1,199 passed**.
- Focused outer-room UI operation:
  `CaptureExperienceUITests.testRecorderLeadsWithAStandardCallGreenRoom` passed
  **1/1** on iPhone 17 Pro / iOS 26.3.1 Simulator. It operated iPhone call
  audio, microphone off/on, companion mode, and restoration of the microphone
  control. Result:
  `/private/tmp/quipsly-join-muted-green-room-final-20260825-013607.xcresult`.
- The shipping app compiled as a signing-independent universal Simulator
  binary with both `arm64` and `x86_64` slices at
  `/private/tmp/quipsly-join-muted-derived-final`.
- The retained provider-room runtime journey now explicitly turns the
  microphone on before exercising the permission-on-Join branch, so remembered
  user preferences cannot make that release test order-dependent.

## Deferred validation, not inferred completion

On a physical iPhone and a real two-participant provider room, verify that a
muted primary participant can hear remote speech, is visibly muted to both
participants, receives the system microphone prompt only after tapping
**Unmute**, can speak after granting access, and rejoins with the saved choices.
Repeat with denial and Settings recovery, Bluetooth/wired audio, a second-device
companion, temporary network loss, and a separately active local recording.
Confirm no echo, no unintended microphone publication, no stopped master, and
playable retained source readback. Simulator compilation and UI operation do
not prove those media observations.
