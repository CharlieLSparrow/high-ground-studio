# Quipsly conventional call UX boundary

Status: accepted product constraint
Date: 2026-08-23

## Decision

Quipsly calls use the interaction grammar people already know from Meet, Teams,
Zoom, FaceTime, and ordinary phone calls. Quipsly earns differentiation after
that boundary through source-owned recording, audio confidence, transcript-linked
editing, coaching follow-through, and collaboration—not through novel permission,
consent, lobby, device, or hang-up ceremony.

## The standard path

1. A Session link opens one private pre-join room.
2. The person sees who they are, which Session they are joining, camera preview
   when enabled, a moving microphone meter, and one primary **Join** button.
3. Microphone/camera access is requested only when the person chooses a feature
   that needs it. Previously granted access is reused by the platform.
4. Device selection is available but secondary. Known-good/default hardware is
   selected automatically.
5. Recording consent is one clear Session decision, separate from operating-system
   microphone/camera permission, and is remembered until revoked or policy changes.
6. The live-call controls remain visible and spatially stable: microphone, camera,
   participants, content/clip controls where applicable, and a visually distinct
   leave button. Recording state and local-source health remain visible without
   moving those controls.
7. Reconnect attempts happen automatically. Recovery language says what is safe,
   what is still local, and what needs action; it does not turn into an admin form.
8. A second device joins with its microphone and speaker off by default to prevent
   echo while allowing an intentional camera/source role.
9. Leaving ends the call participant connection but never implies that local
   recording/upload work was discarded. The post-call screen says plainly which
   sources are safe, uploading, or need attention.

## Research basis

- Google Meet's private green room puts peripheral selection, microphone movement,
  speaker test, camera preview, and **Join now** in one place:
  <https://support.google.com/meet/answer/10409699?hl=en>
- Microsoft Teams uses one pre-join screen for audio source and microphone state,
  keeps the same microphone control during the call, and applies changes immediately:
  <https://support.microsoft.com/en-US/teams/meetings/manage-audio-settings-in-microsoft-teams-meetings>
- Teams supports joining from a second device and automatically mutes that device's
  speaker and microphone to prevent echo:
  <https://support.microsoft.com/en-us/teams/meetings/join-a-meeting-in-microsoft-teams>
- Apple recommends requesting capture authorization when the feature needs it and
  letting the system preserve the resulting choice:
  <https://developer.apple.com/documentation/AVFoundation/requesting-authorization-to-capture-and-save-media>
- Current Descript feedback repeatedly praises the editor while criticizing glitchy
  recording, audio cuts, high resource use, and restart-heavy recovery. This is a
  product-feedback source, not an objective reliability benchmark:
  <https://feedback.descript.com/feature-requests/p/improved-quality>
- Current Riverside App Store reviews include frustration with unclear scheduling
  and upgrade states. Individual reviews are anecdotes, but the failure mode is
  directly relevant: ordinary scheduling controls must never disappear behind an
  unexplained commercial/admin state:
  <https://apps.apple.com/gb/app/riverside-record-edit-share/id1554443872?platform=iphone&see-all=reviews>

## Product constraints

- No long vertical checklist as the primary join experience.
- No repeated in-product permission paperwork after the operating system has granted
  access.
- No email-based recording-consent round trip.
- No hidden record authority: explain an unavailable record button beside the button.
- No mode where advanced audio/source status displaces mute or leave.
- No second-device echo trap.
- No generic “something went wrong” when Quipsly can distinguish call transport,
  local capture, upload, transcript, or source-verification state.
- No claim that a recording, upload, transcript, or share succeeded without its
  corresponding receipt.

## Where Quipsly should surprise people

- live microphone confidence and route-change visibility;
- high-quality local participant masters with resumable source-safe upload;
- obvious post-call source safety and synchronization;
- transcript corrections that stay attached to exact immutable timing;
- reversible text-based trim/cut editing;
- audio mastery suggestions with audible, reversible before/after evidence;
- coach/client mentor reports, notes, goals, and tasks derived from the same source;
- collaboration that carries the Session from scheduling through follow-through.

These capabilities may be unusually deep. Their entry points and state language
still use ordinary nouns and familiar controls.

## Acceptance checks

- A minimally instructed client can join from a link and talk without scrolling
  through setup paperwork.
- A returning participant with unchanged device/policy state is not asked to repeat
  permissions or consent.
- A moving meter identifies the selected microphone before join and remains available
  during the call.
- Mute, camera, and leave never move when recording/source detail expands.
- A second device defaults to no call audio.
- Interrupt network, app, camera, and upload separately; each recovery view names the
  exact affected layer and preserves local work.
- Verify these behaviors in browser, iPhone, and mixed-device calls. Automated proof
  is necessary but does not replace minimally instructed human observation.
