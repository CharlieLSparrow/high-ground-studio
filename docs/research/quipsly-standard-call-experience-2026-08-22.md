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
- [Fathom](https://help.fathom.video/en/articles/640768) automatically detects meeting action items and assignees, while [Otter](https://help.otter.ai/hc/en-us/articles/5093228433687-Conversation-Page-Overview) places generated action items on the conversation page and lets people assign them. Both establish immediate editable follow-through as the familiar post-call pattern.
- [Zoom scheduling](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0060700) offers many meeting controls, but places waiting-room, join-before-host, authentication, and media defaults in secondary security and advanced sections rather than making them the basic date-and-time path.
- [Apple](https://developer.apple.com/documentation/uikit/requesting-access-to-protected-resources?changes=_2) requires camera and microphone permission at the protected-resource
  boundary and remembers the system response. Purpose strings should be concise,
  accurate, and specific.
- [Apple's AVFoundation guidance](https://developer.apple.com/documentation/avfoundation/requesting-authorization-to-capture-and-save-media) confirms that iOS remembers each camera and microphone response, so an app
  should ask at the actual Join/Record boundary and must not build its own
  recurring permission ritual around the system choice.
- [Apple's privacy HIG](https://developer.apple.com/design/human-interface-guidelines/privacy) says the feature context should normally explain the request. If a custom
  pre-alert is genuinely necessary, it should contain one neutral `Continue`
  action that opens the system alert—not a second imitation permission choice.
  Quipsly therefore removes explanatory gates instead of styling them more
  attractively.
- [MDN's `getUserMedia` guidance](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia) requires an explicit browser permission at least once and permits browsers to
  offer persistent site access. Quipsly can remember device intent, but it must
  respect whether the browser grants one-time or ongoing access and cannot
  promise to suppress a prompt controlled by the browser.
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
- Meeting-assistant users repeatedly report [missed transcript sections and weak action-item extraction](https://www.reddit.com/r/ProductManagement/comments/1866ags/is_otterai_worth_it_for_meeting_minutes/) and say the useful test is whether the output preserves owners, dates, decisions, and enough source context to act. Quipsly should make every suggestion editable and source-linked without making source playback a prerequisite for reversible internal work.
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
- Positive reviews consistently praise the combination of a guest link,
  separate participant tracks, and local quality that survives a poor live
  connection. Negative reviews cluster around recordings stuck near completion,
  unusable post-call media, audio/video drift, and editors that obscure the
  underlying tracks. The product lesson is to make entry boring and source
  health unusually transparent—not to add more setup choices.
- [Current Riverside customer reviews](https://www.trustpilot.com/review/riverside.com) reinforce the same split: ease, transcription, and an integrated
  workflow earn praise; lost tails, silently stopped recording, and repetitive
  troubleshooting destroy trust. Reliability status therefore belongs in the
  everyday product surface, while diagnostic detail belongs behind it.
- Cross-product guest feedback keeps returning to the same minimum contract:
  one link, no technical homework before or after the call, an obvious Join
  action, and separate local tracks. Even useful setup tests become disliked
  when they are framed as gates instead of optional confidence tools.
- Recent Rooms feedback also describes transcription quality changing depending
  on whether the same media came through the room or was re-imported as separate
  files. Quipsly must bind transcription to the exact participant source and
  channel layout, expose that provenance, and never let the collaborative room
  mix silently replace better isolated masters.
- Chrome's modern Page Lifecycle guidance treats `visibilitychange` to hidden as
  the last reliably observable mobile boundary and explicitly warns against
  pretending `unload` can save work. Quipsly therefore journals source chunks
  continuously, requests one more encoder chunk when the page becomes hidden,
  and installs `beforeunload` only while a master is genuinely unsaved.
- The Screen Wake Lock API is now available across the major browser engines,
  but the OS may revoke or refuse it for visibility, battery, or power-policy
  reasons. Quipsly quietly holds it only during a joined call or active source,
  releases it immediately afterward, and treats refusal as a convenience loss,
  never a media failure.

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
- Renamed the iPhone readiness surface to `Call & recording check`; its ordinary
  state now says only `Ready to join`, `Connected`, `Reconnecting`, or `Call
  unavailable`. CallKit, LiveKit, provider-runtime, egress, and receipt language
  remains available under a collapsed `Technical details` disclosure for
  support rather than occupying the normal call path.
- Persisted safe local source-mode, camera, and video-quality choices.
- Removed empty upload and Studio handoff cards before the first take.
- Kept recording consent separate and Session-scoped; joining still never starts
  recording.
- Reduced first-time consent to the familiar default summary and one `Allow
recording` action on both browser and iPhone. Each signed-in participant owns
their choice; Quipsly verifies the all-party gate instead of asking one person
to police everyone else. Audio and transcription are the
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
- Added browser lifecycle protection without another setup surface. A joined
  call or active source asks the platform to keep the screen awake, releases the
  request as soon as work ends, and reacquires it after a visible-tab return.
  Active retained media alone installs the browser's standard leave/reload
  confirmation, and a hidden-page transition requests a fresh MediaRecorder
  chunk for the already-continuous durable journal. No `unload` callback is
  trusted to finalize or invent source safety.
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
- Remembered the person’s browser-or-iPhone Session route on that device. A
  returning browser user now goes directly to the ordinary call lobby; a
  returning iPhone user sees one `Open Capture` action because browsers rightly
  require a gesture before opening another app. `Use another device` remains a
  quiet escape hatch instead of recurring setup.
- Replaced the first visit's two equal device cards and extra Capture handoff
  screen with one contextual primary action. Desktop and ordinary browsers get
  `Join call`; iPhone gets `Open Quipsly Capture`. The alternate path remains a
  single secondary action, and the public beta link remains available without
  interrupting the happy path. The selected route is still measured and
  remembered, but the person no longer has to understand Quipsly's client
  architecture before entering a call.
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
- Removed the source-to-editor handoff as a normal post-call chore. Once the
  exact required track set is verified and has a Nest destination, Quipsly now
  performs the idempotent internal attachment automatically. The ordinary
  surface offers `Review recording` or `Edit recording`; source rosters,
  fingerprints, and a manual retry remain under `Recording processing` for
  exceptional diagnosis.
- Kept useful audio evidence visible without exposing measurement vocabulary as
  the primary UI. People see highest level, peak, and possible clipping, while
  sampling method, gaps, and post-capture analysis limits stay under `How this
was measured`.
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
- Aligned the browser and iPhone finishing path around the same ordinary verbs:
  trim the beginning and end, optionally remove transcript passages, create a
  private preview, listen, and share with the named client. Exact timing and
  source-track choices remain available under disclosure, while the duplicate
  iPhone share-attestation checkbox was removed because the named Share action
  is already the explicit consequential decision.
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
- Kept call-path RMS, peak, clipping, channel, and browser-processing evidence,
  but moved it behind `Audio and video settings` and a second `Technical device
details` disclosure. The green room now shows the selected device names,
  mute/camera state, preview, and Join—not a measurement console. The evidence
  remains reachable for support and serious recording setup without becoming
  routine homework.
- Removed Session recording consent as a prerequisite for the iPhone's private
  local sound check. Like a conventional pre-call microphone test, it can run
  before joining; its protected sample stays on the device, never becomes a
  Session source, and is deleted automatically. Actual Session recording and
  transcription remain independently consent-gated.
- Removed Preview as a prerequisite for the browser's private sound check.
  Record private sample now opens the chosen microphone itself when necessary,
  while Preview remains an optional camera-and-meter check for people who want
  it. This also works before a browser has revealed device names: the first
  meaningful action owns the standard microphone prompt and opens the default
  input, instead of disabling the sound check until a separate permission or
  device-selection ritual has run.
- Made the optional ten-second sample do useful work without becoming a gate.
  It now prompts normal speech, the loudest expected sentence, a plosive-heavy
  phrase, and a short quiet tail. Playback offers concise physical fixes for
  mouth sounds, noise/echo, and route/delay problems while clearly reserving
  those judgments for human listening; the live meter still claims only level,
  sample peak, clipping observations, and reported browser processing.
- Reordered Session transcript review around the familiar recording and linear
  transcript. Speaker identification and passage correction remain direct;
  waveform, spectral, timing, source-health, provider, and evaluation tools now
  lazy-load behind one clearly labeled `Audio, timing, and accuracy` control.
  This keeps the ordinary review path calm and avoids doing advanced analysis
  work merely because a person opened the transcript.
- Made provider voice-cluster assignment a compact `Voice labels` control above
  the transcript instead of a full diarization desk blocking the reading path.
  Unresolved and stale clusters remain visible, but the listening samples and
  assignment form mount only when someone chooses to identify or review voices.
- Collapsed the four note/task/goal/writing forms repeated under every
  transcript passage into one standard `Create from this moment` disclosure.
  Play, confirm, and correct remain immediate; Quipsly's source-linked workflow
  appears when wanted instead of turning a readable transcript into a stack of
  forms and policy prose.
- Connected coaching transcript review directly to the existing in-Session
  `Trim recording` surface. A coach no longer has to infer that `Outputs` is
  where basic range trimming, transcript-based passage removal, private preview,
  proof-listening, and client release live; Studio remains unnecessary for this
  everyday edit-and-share workflow.
- Removed the iPhone sound check and its internal receipt from the required
  readiness count. A selected coaching Session is now a valid recording
  destination without needing a podcast Episode binding, and internal receipt
  delivery stays automatic instead of appearing as another user task.
- Aligned the optional iPhone sound check with the browser: normal speech,
  expected emphasis, a plosive-heavy phrase, and a quiet tail. Running it can
  reveal a warning, but skipping it never blocks an otherwise valid recording.
- Stopped treating every podcast Session as if it required a script, shared
  clip, and headphones. Scripts and clips are optional; once a shared clip is
  actually selected, its local preparation and private listening route become
  real readiness requirements for that Session.
- Put the iPhone's familiar conversation transcript immediately after its
  recording status instead of making people pass evidence, voice identity, and
  automated follow-through panels first. Offline and saved-change states now
  use ordinary sync language; exact receipts and immutable provider evidence
  remain in the underlying contract rather than the happy-path copy.
- Treat post-call notes, goals, and tasks as reversible internal work rather
  than an external side effect. Fathom automatically extracts action items and
  Otter places generated action items directly on the conversation page; the
  useful convention is therefore immediate, editable suggestions—not forcing
  a person to replay every cited sentence before saving anything. Quipsly now
  records `provider-transcript` versus `human-reviewed` source state and keeps
  exact recording pointers, while allowing either source state to become an
  internal note, task, or goal. Client delivery, calendar mutation, reminders,
  and publication remain separate explicit actions.
- Roll the note contract out server-first. The response temporarily retains the
  legacy positive review acknowledgement expected by existing Capture builds
  while adding an explicit `humanReviewedSourceRequiredForInternalWork: false`
  capability for the new app. This compatibility field is internal and can be
  removed only after the older TestFlight cohort is retired.
- Preserve the source jump because complaint research consistently identifies
  missed nuance, wrong owners, and incomplete action extraction as the weak
  point of meeting assistants. The correction mechanism is quick editing plus
  “play this moment,” not a blocking verification ceremony.
- Keep that follow-through contract identical in Capture and Nest. Nest now
  presents one familiar `Session follow-up` checklist with suggested notes,
  goals, and tasks; provider transcript evidence can open every reversible save
  flow, while `Play this moment` remains adjacent and optional. The everyday
  surface says `Ready`, `Later`, and `Done`; packet, canonical, governance, and
  provenance terminology belongs in implementation contracts or optional
  history—not in the coach's happy path.
- Apply the same progressive disclosure to source health. The everyday Session
  view says whether each recording is `Safely stored`, `Still processing`, or
  `Needs attention`, and summarizes decoded audio as clear, quiet, or a count of
  exact moments worth checking. Hashes, cloud generations, capture boundaries,
  codecs, and signal measurements remain available under `Technical recording
details`; they prove the state without becoming homework. An audio warning
  links directly to its transcript/audio review surface instead of opening a
  separate diagnostics workflow. Deep links automatically reveal the otherwise
  collapsed audio evidence, so a warning never lands on a page that appears to
  contain no matching next step.
- Treat protected playback materialization as infrastructure, not a coach task.
  Current Capture finalization already registers verified sources with their
  permission-filtered playback route. When an older verified source lacks that
  projection, transcript review now prepares it once automatically and shows a
  plain `Try again` escape hatch only after the automatic path cannot finish.
  The everyday transcript surface says `Review and edit`, `Share transcript`,
  and `Refresh`; provider routing and receipts live under `Transcription
details`.
- Keep the iPhone's live safety monitoring, but translate its happy path and
  recovery guidance into ordinary recording language. Coaches now see `Ready
to record`, `Recording on this iPhone`, `Call disconnected`, or `This
recording needs attention`; retained-source, provider-path, and dBFS caveats
  remain implementation evidence or disclosed detail. Call audio is described
  plainly as conversation audio, while the saved iPhone file is the
  high-quality copy.
- Let information architecture explain itself through familiar destinations,
  not architecture prose. Session navigation now uses `At a glance`, `Before
the call`, `Saved privately`, `Listen and edit`, `Next steps`, and `Ready to
share`. The continuity panel says that the call, chat, recordings,
  transcript, notes, and next steps stay connected, then links directly to the
  related coaching, episode, research, or project space.
- Refresh remembered iOS microphone permission and current free space passively
  when the selected Session opens. This refresh never activates hardware or
  opens a system prompt. An undetermined permission is an optional readiness
  note, not a prerequisite wizard; iOS asks once when the person actually taps
  Join, Record, or Sound Check.
- Materialize every released Capture recording into its canonical project as
  part of finalization, whether or not the Session belongs to a podcast Episode.
  The protected playback identity, exact source attachment, registration job,
  and reversible-media receipt are Session infrastructure. Episode imported
  media remains an optional additional projection. A coaching user must never
  have to open a transcript or invent an Episode before the Session can offer
  playback, audio improvement, or editing.
- Put the first audio-mastery action on the recording inside its Session. The
  everyday control is `Improve audio`, not a route into Studio or a request to
  understand processing jobs. When the verified preview is ready, keep the
  original and improved listening copy side by side and say explicitly that
  neither has been replaced or published. Processor diagnostics stay behind a
  failure detail; the normal state remains a single familiar action.
- Start that full-source measurement automatically after a released participant
  audio master is attached to the Session. A coach should normally arrive to a
  completed `already balanced` result or an in-progress check, not remember to
  run recurring post-call administration. Automatic failure is retained once
  and shown as an ordinary retry; Capture finalization replay never creates an
  unbounded retry loop. Video-only sources are not presumed to contain a usable
  participant audio master. The original remains immutable and any derivative
  remains an unpublished preview.
- Added automatic audio readiness to the full fresh-user coaching flight. A
  clean exact-commit run now fails if the coach must click `Improve audio`, if
  the original source changes, if the Session cannot expose a calm completed or
  in-progress result, or if an improved listening copy is published implicitly.
  This turns the no-recurring-admin promise into a retained release assertion
  rather than a UI aspiration.
- Extended that flight through a full post-recording reload and ordinary rejoin
  for both participants. The same current Session consent must return as
  `Saved`, and the agreement prompt must stay absent. Quipsly asks again only
  when the participant, Session, requested audio/video/transcription scope,
  policy version, or recorded decision actually changes.
- Treat participant completeness as a first-class recording-health contract.
  A device-only list can look healthy while silently omitting the person whose
  recorder never started. The host now sees one conventional aggregate state
  (`Everyone is recording`, `Waiting for one person`, or `Needs attention`)
  plus every expected participant, including participants with zero endpoint
  receipts. Per-installation diagnostics remain collapsed. This status proves
  local recorder coordination only; exact-byte upload verification remains a
  separate downstream fact.
- Keep professional source planning optional for ordinary calls. A verified
  participant recording without an advance device plan is not an error and
  must not become recurring setup paperwork. Explicit plans still preserve a
  missing required master for complex productions, but Capture boundaries and
  exact-byte verification are sufficient for a normal coaching source.
- Never project a light-edit/share render as another participant master.
  Derived previews retain immutable lineage to their originals, but remain
  outputs; creating one must not add a false missing-source warning to the
  Session.
- Lead the post-call surface with `Recording protected`, `Finishing your
  recording`, or one plain attention count. Sources, transcript, and edit/share
  readiness stay visible at a glance. The former five-stage finishing cockpit,
  source-plan checkpoints, and evidence identities remain available under a
  collapsed `Recording details` disclosure for support and professional review.
- Treat simultaneous participant finalization as the normal case. Nest-level
  quota serialization may briefly delay one upload reservation, but Quipsly now
  waits and retries transaction-start contention on the server and retries the
  same idempotent reservation in the browser. The local master stays protected;
  a transient database or network delay must not become a manual post-call job.
- Keep the manual retry available as recovery, not routine procedure. This
  follows the lesson in Descript's stalled Rooms workflow: recovery links and
  fallback media are valuable safety nets, but a participant should not have to
  return merely because two expected local masters finalized together.
- Make the transcript the first post-call working surface. Packet generation,
  consent evidence, evaluation labs, and downstream automation remain useful,
  but must not appear before the recording and editable words a person came to
  review. Basic trim, transcript exclusions, private preview, and recipient
  release now open inline from Transcript instead of forcing a mode or app
  switch; original participant masters remain immutable.
- Give people two ordinary editing views instead of one expert-only layout:
  `Transcript` keeps a familiar linear reading flow, while
  `Recording + transcript` places protected playback beside the same timed,
  correctable passages on a wide screen and stacks safely on a phone. Switching
  views never creates another copy, changes the URL, or breaks the link between
  words and source time. Audio forensics and voice-label administration remain
  collapsed below the primary editing work.
- Do not turn transcript correction into compliance theater. Choosing
  `Correct` now starts the exact passage, records the real playback timestamp,
  and unlocks `Save correction` after playback actually begins. The former
  repeated "I listened" checkbox is gone. A correction remains a reversible
  overlay with source provenance; `Mark correct` appears only after that
  passage has been played, so ordinary users see fewer controls without
  weakening the evidence boundary.
- Apply that same observed-playback rule consistently. AI transcript proposals
  and voice-label samples now unlock from the protected passage Quipsly
  actually started, not from another user-ticked attestation. Rejecting an AI
  proposal remains immediate and reversible; accepting words or applying a
  voice identity still requires source playback and retains its exact source
  timestamp.
- Treat server-session creation as a quiet idempotent handoff, not another login
  decision. Quipsly now distinguishes an unreadable request from bad credentials
  and retries one malformed or transient handoff automatically. Verification,
  credential, and access denials still fail immediately; the retry never turns
  a policy refusal into repeated background attempts.
- Reopening an edit must mean "continue from what I heard," never "start over."
  Quipsly now restores the verified revision's trim range, title, and transcript
  exclusions when the coach edits it again. `Cancel changes` discards only the
  unsaved UI choices; the current private or released derivative and every
  participant master remain unchanged.
- Before rendering, translate text selections into an ordinary editorial
  consequence: passages removed, time cut, and expected preview length. The
  estimate uses the same exact-source word boundaries and merged exclusions as
  the server-side edit plan; `about` remains explicit because the verified
  renderer still owns codec duration and click-safe crossfades.
- Prepare reversible internal follow-up automatically when the completed,
  released transcript is ready. Building a source-bound summary and suggested
  notes, tasks, and goals is an idempotent derivation with no external side
  effects, so it is routine system work rather than a user decision. Quipsly
  now performs that step once and shows a plain `Try again` only after failure.
  Assigning work, messaging a participant, scheduling, and releasing or sharing
  material remain explicit because those actions affect other people.
- Apply the same boundary to audio quality. A verified source can be measured
  and, when useful, given a separate balanced listening derivative without
  asking the user to initiate routine processing. Quipsly now starts that
  idempotent check automatically, exposes progress as ordinary audio health,
  preserves the original, and stops after one failed attempt with a plain
  retry. Replacement, promotion, publishing, and delivery remain explicit.
- Keep Apple delivery verification strict instead of making synthetic test
  audio pass by weakening the product profile. Apple's current creator guidance
  recommends roughly -16 dB LKFS with +/-1 dB tolerance and no more than -1 dB
  true peak, measured using ITU-R BS.1770-5. A browser MediaRecorder WebM may be
  standards-valid and completely decodable while omitting container duration;
  Quipsly now recovers duration from a complete FFmpeg decode, then still
  independently verifies the output against the delivery target. Sources:
  https://podcasters.apple.com/support/893-audio-requirements and
  https://tech.ebu.ch/publications/r128.

## Acceptance consequences

### Operated local resilience evidence

The retained local two-browser operation passed against the real Quipsly app,
PostgreSQL, and LiveKit development room. Two independent participant endpoints
joined, exchanged chat, acknowledged the coordinated Record directive, retained
separate browser sources, uploaded both sources, and verified overlapping source
time. All recording and transcription consent receipts were present. Provider
cloud recording was deliberately not part of this participant-master proof.

The browser source crash-durability operation also passed after deliberately
terminating the OPFS writer before its normal close action. Both acknowledged
chunks were recovered in order and byte-for-byte from the persisted partial
file; the recovered file size exactly matched the last acknowledged committed
offset. This proves the transaction boundary for synthetic bytes. It does not
claim that a particular human microphone, browser process crash, or physical
device has passed release acceptance.

The full two-browser operation then returned a deliberate HTTP 503 for the
coach's first source upload while the client's independent master completed
normally. The coach reloaded the Session, Quipsly remembered the browser route,
the coach used the ordinary Join action, and automatic recovery verified the
same protected source without a recovery wizard or duplicate recording. Both
participant-owned masters were read back from PostgreSQL as verified, with
distinct participant ownership and 4.369 seconds of measured overlap. This is
real local application, database, LiveKit, OPFS, upload, and verification
evidence over synthetic media; natural speech and human comprehension remain
unclaimed.

A second two-browser operation killed the coach page while MediaRecorder was
actively writing instead of allowing any Stop or component-cleanup callback.
After ordinary re-entry, Quipsly reconstructed the source only from contiguous
acknowledged chunks, inferred the stop from the last durable chunk rather than
the later reload time, hashed and uploaded the preserved bytes, and retained an
explicit interruption-recovery profile. The client's independently stopped
master remained verified, both endpoints eventually acknowledged the shared
STOP boundary, and the recovered and clean sources overlapped by 2.1 seconds.
`ffprobe` recognized the interrupted source as 48 kHz stereo Opus; a lossless
FFmpeg remux produced a verified 4.02-second WebM without touching the original.

Exact-byte verification alone does not call that interrupted source
editor-ready. The Session projection and Studio promotion boundary now hold it
as `interrupted ending · repair queued` until a separate repair derivative has
its own verified receipt. Transcription may continue against the preserved
source where the provider can decode it, but Studio cannot silently treat a
missing container tail as a clean master.

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
