# Quipsly standard call experience

Date: 2026-08-22

## Product rule

Joining a Quipsly call should feel unsurprising to anyone who has used Meet,
Zoom, Teams, or Riverside. Quipsly earns its originality after the call begins:
high-quality local sources, trustworthy sync, audio visibility, transcripts,
notes, goals, tasks, and collaborative follow-through.

## Evidence reviewed

- Google Meet exposes a pre-call self-check with a camera preview, microphone,
  speaker, and device selectors.
- Zoom makes its speaker-and-microphone test optional, supports changing devices
  during a meeting, and can remember automatic computer-audio joining.
- Microsoft Teams keeps the common audio source and mute controls in pre-join,
  with advanced settings secondary.
- Riverside presents a device check, preview, microphone/camera toggles, and one
  `Join Studio` action. Guests receive a deliberately simplified workspace.
- Apple requires camera and microphone permission at the protected-resource
  boundary and remembers the system response. Purpose strings should be concise,
  accurate, and specific.
- Recurring user complaints across meeting and remote-recording products concern
  forgotten device/mute choices, buried settings, preflight and in-call route
  disagreement, crashes or source loss, stuck uploads, and transcript timing
  drift that makes text edits cut the wrong media.

## Quipsly interaction contract

1. **One obvious entry.** The Session shows `Join call` before production,
   transcript, chat, and project tools.
2. **A small green room.** Show the current microphone, camera state when video
   calling exists, a remembered `Join muted` choice, and one primary action.
3. **Ask just in time.** Let iOS show its standard permission alert when the
   person first joins or records. Do not precede it with policy prose.
4. **Remember safe choices.** Preserve join-muted, source mode, camera, and video
   quality on the device. Fall back safely if remembered hardware is absent.
5. **Consent is not hardware permission.** Save recording/transcription consent
   for the exact Session and participant. Do not ask again unless the Session,
   participant, requested media scope, consent policy, or prior decision changes.
6. **Joining never records.** Recording begins only after an explicit Record
   action and current consent/readiness verification.
7. **Normal controls stay visible.** Mute/unmute and Leave remain direct controls.
   Diagnostics, provider details, clocks, receipts, and recovery evidence are
   available, but never occupy the happy path.
8. **Failures name one next action.** Prefer `Microphone access is off — Open
   Settings` to multi-paragraph state explanations.
9. **Local source truth is durable.** A crash, network loss, or incomplete upload
   must not erase a recoverable local recording. Upload progress and preservation
   state must be obvious after re-entry.
10. **Transcript edits are media edits only with evidence.** Word timing,
    speaker attribution, source identity, and edit boundaries remain reviewable;
    uncertain timing must never silently delete extra audio or video.

## Implementation landed with this decision

- Moved the native audio-call green room to the top of the Record surface.
- Added an obvious `Join call` action, current microphone label, connected state,
  normal mute/unmute and Leave controls, and a remembered `Join muted` choice.
- Persisted safe local source-mode, camera, and video-quality choices.
- Removed empty upload and Studio handoff cards before the first take.
- Kept recording consent separate and Session-scoped; joining still never starts
  recording.

## Acceptance consequences

Automated previews should prove hierarchy, persistence keys, accessibility
identifiers, and failure states. A release candidate still needs deferred
physical proof of permission prompting, remembered choices after relaunch,
route consistency, interruption recovery, two-person joining, recording,
upload/readback, and account isolation. Human availability never blocks further
implementation work; these checks remain on the release evidence ledger.
