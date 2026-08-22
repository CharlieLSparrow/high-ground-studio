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
- [Riverside's guest flow](https://support.riverside.com/hc/en-us/articles/5252042203037-Join-a-studio-as-a-guest) uses one invitation link, one device check, and one Join action; mobile links open the app and the same lobby supports front/back-camera choice.
- [Descript Rooms](https://help.descript.com/hc/en-us/articles/30293678303885-Managing-and-inviting-participants-to-a-Descript-Room) defaults invitees to Guest and keeps role configuration secondary, while a recording started from a project returns its sources to that project.
- [Google Calendar appointment schedules](https://support.google.com/calendar/answer/11608416?hl=en-au) center the ordinary booking path on available time and a shared link; conflict checks, reminders, payment, buffers, and availability policy are reusable settings rather than questions repeated for every appointment.
- [Zoom scheduling](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0060700) offers many meeting controls, but places waiting-room, join-before-host, authentication, and media defaults in secondary security and advanced sections rather than making them the basic date-and-time path.
- [Apple](https://developer.apple.com/documentation/uikit/requesting-access-to-protected-resources?changes=_2) requires camera and microphone permission at the protected-resource
  boundary and remembers the system response. Purpose strings should be concise,
  accurate, and specific.
- Recurring user complaints across meeting and remote-recording products concern
  forgotten device/mute choices, buried settings, preflight and in-call route
  disagreement, crashes or source loss, stuck uploads, and transcript timing
  drift that makes text edits cut the wrong media.
- Users also describe project-versus-room structure and repeated reinvitation as
  needless complexity. A Quipsly invitation should therefore become a durable
  route back to the exact Session after acceptance, while the canonical account
  and active participant record—not the link—remain the authority.

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
- Riverside also documents both [stuck local tracks](https://support.riverside.com/hc/en-us/articles/19135749320093-My-track-is-stuck-uploading)
  and [an editor that can remain blocked while a participant track is still
  processing](https://support.riverside.com/hc/en-us/articles/20320773272989-I-can-t-edit-my-recording-the-editor-is-blocked).
  Community reports add the human cost: uncertainty about whether a guest's
  source survived, reconnecting a guest only to finish an upload, and one held
  fragment preventing otherwise-ready work. Quipsly should let ready sources
  remain inspectable and editable while incomplete sources recover independently.
- [Descript users value text-based editing but report speaker omissions and want
  selection-level retranscription](https://www.reddit.com/r/Descript/comments/1sgi96c/transcript_often_missing_second_speaker/). Preserve each participant track, make speaker attribution correctable,
  and allow a bounded segment to be regenerated without replacing the trusted
  transcript wholesale.
- [Users also report word-alignment errors that can truncate word beginnings
  during text edits](https://www.reddit.com/r/Descript/comments/1tuqxj7/beginnings_of_words_now_being_marked_as_grey/). Text edits therefore need visible media boundaries, handles, audition,
  and reversible decisions rather than treating ASR timestamps as exact truth.
- [A Descript Rooms user reports that the mobile layout hid Join, a phone source
  did not appear, and recording defaults were not reusable](https://www.reddit.com/r/Descript/comments/1rntnu4/descript_rooms_and_squadcast/). Mobile call entry must therefore be a tested first-class path, not a
  responsive afterthought; safe preferences should persist without trapping a
  Session inside an editor-specific workflow.
- [Zoom's `Join Audio` wording is repeatedly interpreted as merely unmuting the
  microphone](https://www.reddit.com/r/Zoom/comments/11rthlg/do_i_have_to_join_audio_to_hear/). Quipsly should say `Join call`, start with the remembered mute choice,
  and never add a second audio-joining ceremony after the room opens.
- [Recent Riverside reports describe permission failures, dropped Sessions,
  slow uploads, and unrecoverable audio/video sync](https://www.reddit.com/r/RiversideFM/comments/1ulnezw/talking_to_riversides_community_director_if_you/). The competitive bar is not feature count: independent local masters,
  explicit synchronization evidence, resumable per-source upload, and recovery
  that does not discard already-safe participants are the product foundation.
- [Descript's own Rooms troubleshooting guide](https://help.descript.com/record/rooms-ts)
  documents stalled primary uploads, recovery links, partial editing sources,
  lower-quality fallback recordings, and a 20 GB free-space recommendation.
  Quipsly should check storage before recording, preserve an independently
  useful call-quality fallback, resume each primary automatically, and never
  hide the difference between fallback and master quality.
- [A Descript recorder request asks hosts to be warned when a guest's local
  capture stops](https://feedback.descript.com/feature-requests/p/notification-if-guests-local-recording-stops). Quipsly should turn endpoint acknowledgements into calm host-visible
  health: every expected participant is recording, one participant needs
  attention, or every retained source is safe. This is monitoring, not proof of
  media; verified bytes remain the authority.
- [Rooms users disagree about automatic editor creation](https://www.reddit.com/r/Descript/comments/1vs4y8m/please_for_the_love_of_your_customers_make_rooms/): some value instant project continuity, while others need direct individual
  masters for external DAWs. Quipsly should do both without a forked workflow:
  the Session receives a ready collaborative projection automatically, and
  every authorized participant master remains directly downloadable.
- The loudest recent Riverside criticism is that AI and editing additions do
  not compensate for unreliable source files. Quipsly therefore treats call,
  local capture, recovery, source health, and direct export as the release
  spine. Automation is allowed to delight only after those states are green and
  inspectable.
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

## Scheduling contract

1. The direct one-to-one path asks for the client's email and a start time.
   Duration starts from the coach's saved preference; Session name, client name,
   timezone override, a temporary hold, and optional payment stay under `More
   options`.
2. `Schedule and send invite` creates one canonical Session, one relationship,
   and one invitation attempt. Email delivery failure never loses the Session;
   copy and system-share remain available from the same result.
3. A first Session creates the minimal durable coach role, profile, and default
   offering automatically. Coach setup is not a prerequisite or a wizard.
4. Timezone is detected and shown in plain language. Duration and timezone are
   durable defaults, but actual appointment values remain explicit.
5. Calendar integration projects the canonical Quipsly appointment into the
   selected provider. Connecting Google or Apple Calendar, choosing a calendar,
   conflict policy, buffers, and reminders are preferences—not per-Session
   paperwork.
6. Charges, external calendar writes, and publication remain visible mutations.
   Remembering preferences must never turn those side effects into surprises.

## Implementation landed with this decision

- Moved the native audio-call green room to the top of the Record surface.
- Added an obvious `Join call` action, current microphone label, connected state,
  normal mute/unmute and Leave controls, and a remembered `Join muted` choice.
- Persisted safe local source-mode, camera, and video-quality choices.
- Removed empty upload and Studio handoff cards before the first take.
- Kept recording consent separate and Session-scoped; joining still never starts
  recording.
- Reduced first-time consent to the familiar default summary and one `Agree and
  continue` action on both browser and iPhone. Audio and transcription are the
  coaching defaults; camera is a podcast default. Less-common changes remain in
  a `Recording options` disclosure, and saved consent stays compact for the rest
  of that Session.
- Confirmed microphone and camera prompts are not requested when Capture launches
  or a Session opens. They occur only after Join, Record, Sound Check, or Prepare
  Camera. When iOS access was previously denied, the affected call or recorder
  surface now provides one direct `Allow ... in Settings` recovery action.
- Replaced the browser's four-step progress rail with one familiar green room:
  current devices, direct mic/camera state, preview, and one `Join call` action.
- Made that `Join call` action the normal first permission boundary. When a
  browser has not exposed usable device IDs yet, Join asks once for the selected
  microphone/camera scope, resolves the remembered or default devices, and
  continues without a separate permission ritual. A refusal becomes one short
  browser-settings recovery instruction.
- Replaced workflow-specific sales copy and a large recording-policy card in
  the green room with the Session name, standard mic/camera/Join controls, and
  one quiet `Joining doesn't start recording` reassurance. Quipsly's source,
  provider, and production explanation remains available under advanced details.
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
- Collapsed browser recovery into one saved-recordings summary. Healthy rows
  stay secondary, active uploads no longer offer a redundant Retry action, and
  only a genuinely interrupted or failed source opens automatically. One failed
  participant source explicitly leaves already-verified sources usable.
- Made iPhone upload recovery resume when its network path returns, in addition
  to launch and background-session reconciliation. Library now presents one
  calm `Uploading safely` / `Safe on this iPhone` card and one `Try again now`
  escape hatch instead of duplicate manual Retry controls.
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
- Made the Capture transcript open as a familiar two-sided conversation with a
  remembered Conversation/Timeline choice. A passage can switch directly into
  exact-time listening, correction, and source-backed follow-through without
  making the whole transcript a wall of editorial controls.
- Reframed the phone's old `Continue in Studio` handoff as `Advanced sync and
  edit`. The deeper waveform/timeline surface remains available, but users are
  no longer told that ordinary Quipsly work requires a separate product.
- Added a first-class phone `Review recording` card after a take. Basic trim,
  transcript removal, private verified playback, release, and revocation now
  stay inside Capture; Studio is needed only for genuinely advanced sync and
  timeline work. Authenticated preview bytes must match the server's exact
  size and SHA-256 receipt before playback, and an authorization change purges
  the protected temporary copy.
- Rebuilt invitation entry as one compact outer-room card with one contextual
  action: Continue, Continue to Session, or Switch account. Device choice and
  setup expectations are secondary and appear only after the identity boundary.
- Reduced host invitation setup to email plus one primary action. Name, role,
  expiry, raw URL, provider presence, join-key leases, and append-only access
  history remain available under progressive disclosure. Provider presence is
  polled only while that advanced view is open.
- Preserved the accepted invitation HMAC as a safe re-entry locator. Reopening
  the original email no longer dead-ends, but the token grants nothing: Quipsly
  still requires the exact accepting account and its active canonical Session
  participant. Removal immediately blocks re-entry; restoration can revive the
  same route without creating a second identity.
- Removed coach-profile setup as a first-Session gate. Scheduling now creates a
  minimal coach identity and reusable 60-minute/default-timezone preferences at
  the same durable boundary as the Session.
- Reduced the ordinary coaching scheduler to client email, start time, and the
  already-defaulted duration. Client name, Session name, hold behavior,
  timezone override, and payment remain available under `More options`.
- Made `Schedule and send invite` the default operation. The Session survives
  an email-provider failure and keeps copy/share/resend escape hatches.
- Converged an empty `/coaching/sessions` index on the canonical coaching
  scheduler instead of opening a second title/purpose/Nest wizard. The generic
  planner remains a deliberate secondary path for podcasts, interviews, and
  internal Sessions.
- Replaced calendar-receipt language with familiar `Add to Google Calendar`,
  `Update Google Calendar`, `Add to Apple or Outlook`, and `Remove from Google
  Calendar` actions. The explicit idempotent Add action no longer asks for a
  second confirmation; destructive removal still does.
- Kept the connected-call surface focused on mic, camera, Leave, participant
  media, and local source safety. The internal provider panel no longer opens
  merely because a call connected; it is now an optional `Cloud recording
  backup` and opens automatically only while recording or when attention is
  required.
- Made rescheduling a direct save and cancellation a single inline destructive
  confirmation. The ordinary surface now speaks in appointments, Sessions,
  dates, and duration rather than app-owned truth, provider evidence, or audit
  metadata. Switching live Sessions now remounts the room by its exact ID so an
  old transport cannot survive under a new Session title.
- Replaced transport and provider jargon in ordinary call status with familiar
  states: `Joining`, `You’re connected`, `Reconnecting`, `Reconnected`, and
  `The call ended`. The reconnect message still reassures participants that an
  independent local recording remains safe without making them learn the sync
  architecture.
- Kept the participant count visible beside call status even while advanced
  room details are closed. This preserves the familiar assurance that the
  other person actually arrived without reopening diagnostics.
- Replaced the browser recorder's long-lived OPFS writable stream with a
  dedicated worker using `FileSystemSyncAccessHandle` and `flush()` after every
  acknowledged MediaRecorder chunk. Browsers without that worker capability
  use a transaction-per-chunk OPFS fallback. The ledger advances only after the
  corresponding file size is durably observable.
- Bound transcript ripple edits to immutable provider-word timing fingerprints
  on the exact recording asset. A passage without precise word timing stays in
  the recording, and a passage that overlaps another participant's speech is
  visibly kept rather than silently cutting both people. Browser and iPhone use
  the same fail-closed contract; ordinary start/end trimming remains available.
- Added a separate edit-timing integrity measure beside provider confidence,
  measured WER, and human review coverage. It checks word ranges, segment
  containment, ordering, and overlap; it explicitly does not claim measured
  timing accuracy. Held passages link back to exact protected playback time.
- Enforced the familiar outer-room boundary in the browser. Before joining,
  people see only the green room, preview, normal device controls, and Join;
  the high-quality recorder and consent action appear only after the call
  connects. Internal states such as `preflight` are translated into ordinary
  labels such as `Ready to join` and `Needs attention`.
- Applied the same outer-room boundary to iPhone. The Record surface stops at
  the call controls before Join; consent, readiness, and recording controls
  appear after connection. A quiet `Record without joining` escape hatch keeps
  solo capture and provider-outage work available without mixing it into the
  normal call path.
- Made the native Join action the one-time microphone permission boundary.
  iOS remembers the decision, Quipsly requests it before minting a short-lived
  room token, and a prior denial becomes one Settings recovery action instead
  of another in-app ceremony. LiveKit reconnecting is now a distinct honest
  state with a calm progress label; it never masquerades as a fresh join or a
  finished disconnection.
- Removed the browser's duplicate pre-join permission ceremony. Missing device
  names no longer force advanced settings open or show normal-state diagnostic
  prose. Join remains the permission boundary; settings stay optional until a
  real failure needs one actionable recovery message.

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
