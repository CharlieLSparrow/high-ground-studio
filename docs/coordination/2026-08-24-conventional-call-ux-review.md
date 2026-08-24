# Conventional Quipsly call UX review

Date: 2026-08-24

## Product decision

Quipsly should be inventive about recording quality, source recovery,
transcription, and follow-through—not about the mechanics of entering a call.
The cross-platform contract is therefore:

1. An invitation opens one familiar outer room or green room.
2. Mic and camera state plus one **Join call** action are primary.
3. Device selection, private sound check, and technical evidence are optional
   details, not prerequisites.
4. The Join action requests only the device access needed for that choice.
5. The operating system or browser remembers granted device access. Quipsly
   does not manufacture another recurring permission ceremony.
6. A denied permission gets one ordinary recovery action to the browser/site or
   iOS Settings. Internal diagnostics stay behind technical details.
7. Joining never starts recording. After joining, the next primary surface is
   one Session-scoped recording choice and then Record.
8. Recording consent is not device permission. It is retained for the exact
   Session and source choices, and Quipsly asks again only when that authority
   is absent or the person deliberately changes it.
9. A second-device or companion join keeps call audio off on that device to
   prevent echo while still allowing camera, chat, and local capture.
10. Camera failure must not destroy an otherwise usable audio call.
11. Automatic call reconnection remains quiet. If provider recovery is
    exhausted, the same surface offers one **Rejoin call** action using a fresh
    short-lived token and the person's remembered device choices.
12. A call-transport failure never ends, hides, or implicitly discards a
    participant-owned recording. Only a deliberate recording action controls
    that source.

## Research basis

- Google Meet uses a green-room self-check with mic, speaker, and camera
  controls before Join; device changes remain available during the meeting.
  <https://support.google.com/meet/answer/10409699>
- Teams exposes call audio/video in the pre-join screen and automatically mutes
  the second device's speaker and mic when someone joins on multiple devices to
  prevent echo.
  <https://support.microsoft.com/en-US/teams/meetings/join-a-meeting-in-microsoft-teams>
- Zoom makes video preview configurable, keeps join-with-video and
  join-without-video ordinary, and offers a separate optional speaker/mic test.
  <https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0061118>
  <https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0062765>
- Riverside puts name, headphones, preview, device choices, and Join in its
  lobby, then starts participant-owned high-quality capture only when the host
  records. Its documented stuck-Connecting recovery illustrates why the
  optional network/device test must not become invisible indefinite waiting.
  <https://support.riverside.fm/hc/en-us/articles/5252042203037-Join-a-Studio-as-a-Guest>
  <https://support.riverside.fm/hc/en-us/articles/8944718648733--Connecting-button-in-the-Lobby-is-stuck-never-turns-into-Join-Studio>
- Apple requires explicit camera/microphone authorization but remembers the
  person's system decision. Apps should check authorization before capture and
  request it at an appropriate user action.
  <https://developer.apple.com/documentation/AVFoundation/requesting-authorization-to-capture-and-save-media>

## Quipsly implementation audit

The existing implementation already satisfies most of the contract:

- web device preferences are remembered locally and silently reopened only
  when the browser reports that permission is already granted;
- a first-time browser is not prompted during page load—Join requests only the
  chosen mic/camera path;
- mic/camera/output settings, sound check, and technical measurements are
  collapsed and optional;
- audio-only join survives a camera startup failure;
- browser and iPhone both preserve a companion-device audio mode;
- iOS checks `AVAudioApplication.shared.recordPermission`, requests only from
  Join when undetermined, and relies on the remembered system result; and
- call join, participant-owned recording, and provider backup recording remain
  separate actions.

One connected-state ordering defect remained: the full device-settings panel
appeared before recording consent and Record. The browser now places the
participant-owned recording surface directly after the live call controls for
both coaching and Episode Sessions. Settings remain below it and collapsed.
After consent, the next normal action is therefore visible nearby instead of
requiring a hunt down the page.

The recovery path now follows the same separation of concerns. On the web, an
exhausted LiveKit reconnect keeps the participant-owned recorder and durable
coordinated-stop polling visible, clears stale remote media, and offers one
Rejoin action. Rejoin obtains a new room token and reuses the remembered mic,
camera, and companion choices.

On iPhone, programmatic CallKit cleanup after an exhausted reconnect is
explicitly distinguished from a person's lock-screen, headset, or system-call
hang-up. Programmatic cleanup preserves the local master and exposes **Rejoin
call**. A genuine system hang-up still protects the local source before leaving
the room. Rejoining while retained provider-PCM capture is active keeps the
same capture lease; the audio coordinator preserves the selected route and the
recorder represents the disconnected interval as timeline silence rather than
inventing or compressing time.

## Evidence and limits

- The 29-test focused web call-room suite passes, including exhausted reconnect
  while a retained participant source remains active and deliberate leave while
  that source is protected.
- The regression explicitly proves that the connected recording surface
  precedes optional device settings and that those settings remain collapsed.
- Strict Quipsly TypeScript passes.
- A generic iOS Simulator build passes for both simulator architectures after
  compiling the native reconnect, CallKit, and source-protection path.

This does not claim a minimally instructed two-person browser/iPhone flight.
That flight must still observe first grant, remembered re-entry, denial
recovery, companion-device echo prevention, camera failure fallback, recording
consent, Record, reconnect, and playable post-call source material.
