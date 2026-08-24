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
- Riverside's lobby exposes the selected microphone, camera, output, and
  headphone choice before Join without making a test recording mandatory.
  <https://support.riverside.com/hc/en-us/articles/5803232647965-Select-mic-and-camera-inputs-in-lobby>
- Browser output routing is an optional secure-context capability. Quipsly uses
  `setSinkId` only after a person chooses or tests an output and falls back to
  the operating-system output when the browser does not support routing.
  <https://developer.mozilla.org/en-US/docs/Web/API/Audio_Output_Devices_API>
- iOS record permission is a remembered system decision: an already granted or
  denied request resolves without presenting another prompt. Quipsly therefore
  must not add a recurring app-owned hardware-permission confirmation.
  <https://developer.apple.com/documentation/avfaudio/avaudiosession/requestrecordpermission%28_%3A%29>

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

One disconnected-state hierarchy defect also remained: the Join card appeared
above the camera stage, so the lobby felt like a vertical checklist instead of
one outer room. The browser now contains the participant preview, selected
mic/camera summary, familiar mic/camera toggles, and the single **Join call**
action in one `Ready to join` region. A camera that has not yet received its
first contextual grant says that it starts on Join; Quipsly does not claim a
preview or remembered setup that has not actually been proved. Device selectors,
the private sound check, refresh, and technical evidence remain in the one
collapsed settings disclosure immediately below the lobby.

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
same capture lease and the audio coordinator preserves the selected route.
Quipsly records the exact call-transport outage as a source-clock span. It does
not call that span silence or lost local audio: the participant-owned input can
continue independently, so the review surface requires listening across it.
Browser retained sources now keep the same contract in their durable IndexedDB
ledger. An open gap survives until rejoin or recorder stop, is merged into the
final exact-byte manifest beside MediaRecorder chunk timing, and projects into
the same Nest audio-evidence span as an iPhone source.

Rejoin also has a terminal boundary. Nest returns stable codes for expired
sign-in, changed room access, payment hold, and a room that is no longer open.
If a rejoin discovers that the call genuinely ended, the browser stops offering
an endless retry loop and shows one closed Session state while leaving the
retained source controls available. Transient provider/network failures keep
the ordinary one-action retry.
Capture decodes the same stable failure code and scopes the closed state to the
exact call room. The iPhone removes Rejoin and device setup for that closed
Session while retaining **Record without joining** and local source recovery;
another Session is not disabled by the old room's state.

The second audit closed the remaining confidence gap without creating another
required setup step. Once a browser preview is open, the green room now shows a
compact live microphone activity meter and an honest level state. It says
**Microphone level looks good**, not that a meter proved the room, mouth noise,
or retained-source quality. Full RMS/peak evidence and the private listen-back
check remain optional details.

Audio/video settings now include one conventional **Test speakers** action. It
plays a short locally synthesized two-note tone, routes it through the selected
output with `setSinkId` when supported, and otherwise uses the system output. It
does not open a microphone, retain bytes, call Nest, or affect recording
consent. The longer private microphone sample remains available for people who
want to hear mouth clicks, plosives, room sound, or routing delay.

The native audit confirmed that no new ceremony is needed. Join, camera
preview, sound check, and Record ask iOS only when their required hardware
permission is undetermined; a remembered grant proceeds immediately. A denial
gets one Settings recovery action. Session recording consent remains a
separate, once-per-person choice for the exact audio/video/transcript scope and
does not recur merely because the app reopened.

The post-Join status now follows the participant-owned recorder's canonical
preparation projection. Saving the recording choice immediately replaces the
old "recording is off" instruction with either **Waiting for the other
participant** or **Everyone is ready to record**. The call surface no longer
contradicts the consent/Record card underneath it.

The iPhone now preserves that same near-to-far hierarchy after Join. A compact
Record row remains pinned immediately above the ordinary Mute, Camera, and
Leave controls instead of disappearing behind the long Session workspace. It
reuses the authoritative audio/video capture controllers and shows one honest
state: ready, waiting for the other participant, waiting for the host, or the
one Session recording choice still needed. The full recorder, meters, Mark,
Pause, recovery, and production tools remain in the scrollable workspace.

Stop now has the same confidence hierarchy in the browser. The latest source
gets one compact live receipt in the primary recording flow: **Saving
recording**, **Saved on this device**, or **Saved and ready**. It names the
file and byte size, says **Keep open** until exact-byte verification finishes,
and says **Safe to close** only after Quipsly verifies the source. It does not
promise a transcript unless the Session permits transcription. Detailed
recovery and multi-device processing remain available under disclosures.
As soon as the verified receipt has its canonical recording identity, it also
shows **Review recording** and opens that exact source in the in-app Session
recording workspace. It does not wait for every other device or the Studio
assembly handoff before making the verified source inspectable.
The close boundary still considers every protected browser source, not only
the latest take. A verified latest recording may say **Saved and ready** while
the page continues to say **Keep open** if an older local upload still needs
the browser.

When exact-byte finalization also returns a transcript job, the receipt's one
next action becomes **Review transcript** and opens the exact source in the
Session transcript workspace. That workspace polls quietly while the job is
queued or running. If transcription was not created, the same slot remains
**Review recording**. Capture exposes no provider job ID and does not ask the
person to start a job that Quipsly already started automatically.

The iPhone already has the stronger native equivalent: coordinated Stop waits
for the local recorder to reach a terminal state, opens Library, and places the
new immutable source in the ordinary saved-source list before upload is called
complete. The release contract now protects both that navigation and its
runtime new-source assertion.

## Evidence and limits

- The 34-test focused web call-room, consent-transition, and speaker-test suite passes, including
  preview-first lobby order, contextual first-grant behavior, exhausted reconnect
  while a retained participant source remains active and deliberate leave while
  that source is protected.
- The speaker regression proves selected-output routing without a
  `getUserMedia` call; the lobby regression proves the compact activity meter
  appears only after the person has opened or automatically resumed a permitted
  preview.
- The regression explicitly proves that the connected recording surface
  precedes optional device settings and that those settings remain collapsed.
- Strict Quipsly TypeScript passes.
- A generic iOS Simulator build passes for both simulator architectures after
  compiling the native reconnect, CallKit, and source-protection path.
- The native release static contract now fails if a connected-call layout
  removes the persistent Record row or places it below Mute, Camera, and Leave.
- The 45-test live-room, stop receipt, exact review-route, multi-source exit,
  consent, and upload-recovery regression
  passes. Strict Quipsly TypeScript also passes.
- The combined live-room, Capture handoff, and Session review regression passes
  95/95. The Session parent test isolates source alignment, whose asynchronous
  behavior remains covered by its own focused component suite.
- Native and Nest evidence projections recognize a source-timed
  `call-transport-gap` span without adding its duration to media-segment totals;
  focused parser and audio-map tests preserve its beginning and ending.
- Focused tests cover browser ledger projection and call-room propagation. The
  stop path closes any still-open outage into that ledger before final
  exact-byte manifest construction without changing captured media bytes.
- Route and call-room regressions prove that a server-confirmed closed call
  ends rejoin without discarding or hiding a still-active local source.
- The generic iOS Simulator build compiles the same room-scoped terminal
  boundary through the native decoder, controller, and closed-Session surface.
- The 1,167-check Capture static gate, provider-room static smoke, and the full
  release-source consistency gate pass. The release gate now protects the
  deliberate CallKit video path plus the separate Record action instead of
  enforcing the retired audio-only call assumption.

This does not claim a minimally instructed two-person browser/iPhone flight.
That flight must still observe first grant, remembered re-entry, denial
recovery, companion-device echo prevention, camera failure fallback, recording
consent, Record, reconnect, and playable post-call source material.
