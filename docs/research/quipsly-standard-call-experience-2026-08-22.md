# Quipsly standard call experience

Date: 2026-08-22

## Product rule

Joining a Quipsly call should feel unsurprising to anyone who has used Meet,
Zoom, Teams, or Riverside. Quipsly earns its originality after the call begins:
high-quality local sources, trustworthy sync, audio visibility, transcripts,
notes, goals, tasks, and collaborative follow-through.

## Evidence reviewed

- [Google Meet](https://support.google.com/meet/answer/10409699?hl=en) exposes a pre-call self-check with a camera preview, microphone,
  speaker, and device selectors.
- [Zoom](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0062765) makes its speaker-and-microphone test optional, supports changing devices
  during a meeting, and can remember automatic computer-audio joining.
- [Microsoft Teams](https://support.microsoft.com/en-us/teams/meetings/manage-audio-settings-in-microsoft-teams-meetings) keeps the common audio source and mute controls in pre-join,
  with advanced settings secondary.
- [Riverside](https://support.riverside.com/hc/en-us/articles/5251967324573-Join-a-studio-as-a-host) presents a device check, preview, microphone/camera toggles, and one
  `Join Studio` action. Guests receive a deliberately simplified workspace.
- [Apple](https://developer.apple.com/documentation/uikit/requesting-access-to-protected-resources?changes=_2) requires camera and microphone permission at the protected-resource
  boundary and remembers the system response. Purpose strings should be concise,
  accurate, and specific.
- Recurring user complaints across meeting and remote-recording products concern
  forgotten device/mute choices, buried settings, preflight and in-call route
  disagreement, crashes or source loss, stuck uploads, and transcript timing
  drift that makes text edits cut the wrong media.

## Complaint pressure test

Community reports are anecdotes rather than product telemetry, but several
failure shapes recur often enough to influence the architecture:

- [Zoom users report microphones changing or becoming unavailable between
  rooms](https://community.zoom.com/meetings-2/external-microphone-stops-working-with-every-room-switch-20972), even after a successful device check. Quipsly should remember intent but
  continuously display the actual active route and fall back visibly when the
  preferred device disappears.
- [Riverside explicitly warns that unfinished local tracks live in browser
  storage](https://support.riverside.fm/hc/en-us/articles/17932486715549-Troubleshooting-Recording-stopped-because-of-low-storage), while users describe the anxiety of a participant track appearing lost
  after a disruption. Quipsly must preserve participant-owned media first,
  expose byte/upload/recovery state after re-entry, and never equate cloud
  receipt creation with source safety.
- [Riverside's own upload guidance asks hosts to watch per-participant upload
  progress](https://support.riverside.fm/hc/en-us/articles/5287442440093-Confirm-that-participants-tracks-are-uploading). Quipsly should summarize this as a calm persistent state—safe on this
  device, uploading, verified in Nest, or needs attention—without requiring the
  host to babysit percentages.
- [Descript users value text-based editing but report speaker omissions and want
  selection-level retranscription](https://www.reddit.com/r/Descript/comments/1sgi96c/transcript_often_missing_second_speaker/). Preserve each participant track, make speaker attribution correctable,
  and allow a bounded segment to be regenerated without replacing the trusted
  transcript wholesale.
- [Users also report word-alignment errors that can truncate word beginnings
  during text edits](https://www.reddit.com/r/Descript/comments/1tuqxj7/beginnings_of_words_now_being_marked_as_grey/). Text edits therefore need visible media boundaries, handles, audition,
  and reversible decisions rather than treating ASR timestamps as exact truth.
- A positive pattern is equally clear: users praise an immediately synced,
  transcribed project and timeline comments, even when they retain separate
  local masters for final quality. Quipsly should make the fast collaborative
  projection feel instant while keeping the independent source masters easy to
  inspect and replace.

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
- Replaced the browser's four-step progress rail with one familiar green room:
  current devices, direct mic/camera state, preview, and one `Join call` action.
- Put browser device selection and the optional audio confidence check behind
  secondary disclosures when the remembered setup is usable.
- Remembered browser camera and join-muted choices alongside microphone, camera,
  and output identity, with label fallback when browser device IDs rotate.
- Applied pre-join mute before publishing browser call audio, avoiding a brief
  open-microphone interval during connection.
- Added debounced hot-plug recovery that reconciles browser device lists with
  the actual LiveKit microphone and camera routes. A lost source now either
  switches the published call to an available device or visibly mutes/turns it
  off; the UI never claims a fallback that the call did not start.
- Preserved the person's preferred studio hardware through an automatic
  fallback, exposed a secondary `Refresh devices` action, and automatically
  retries recovery after a protected retained recording releases its source
  lock. A recording in progress is never silently relabeled to new hardware.
- Made resumable browser recordings actually resume without a recovery ritual:
  complete local sources continue on Session reopen, and transient network
  failures retry when connectivity returns. Retries are idempotent by the
  existing upload-session identity, attempted once per recovery event, and
  never loop on incomplete, verified, policy-held, or corrupt sources.
- Replaced raw ledger states with the user-facing safety model people need:
  `Safe on this device`, `Uploading safely`, `Verified in Quipsly`, or
  `Needs attention`. Manual download and retry remain available as escape
  hatches, not the normal path.
- Separated transcript correction from media editing. Accepted corrections
  remain versioned text/speaker overlays on immutable provider evidence;
  removing a passage creates a separate source-hash-bound edit decision.
- Upgraded private Session recording shares to ordered kept ranges with
  click-safe joins. The renderer produces and verifies a new AAC copy while
  leaving participant masters untouched, and a stale transcript selection
  fails closed instead of cutting against changed text.
- Added transcript passage controls directly to the Session recording surface.
  Coaches can make another private edit after a first preview, listen before
  release, and still keep release/revocation distinct from rendering.

## Acceptance consequences

Automated previews should prove hierarchy, persistence keys, accessibility
identifiers, and failure states. A release candidate still needs deferred
physical proof of permission prompting, remembered choices after relaunch,
route consistency, interruption recovery, two-person joining, recording,
upload/readback, and account isolation. Human availability never blocks further
implementation work; these checks remain on the release evidence ledger.

The physical route check must include unplugging and reconnecting a USB
microphone, camera, and headphone output both before joining and during a live
call. Verify the audible/visible route, the displayed route, mute/camera state,
remembered preference after reload, and retained-source identity separately.
