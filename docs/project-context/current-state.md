# Current State

Date: 2026-08-24

## Cloud coaching recording render checkpoint

- The clean release train passed the complete local HGO/Quipsly conductor and
  the Capture release-source contract. A disposable detached worktree at
  `f81fd0470b4bde6b3dec5dd2bea6197b3373516f` then recreated the locked 28-package
  dependency graph, passed the full Capture preflight, resolved pinned LiveKit
  `2.15.1`, and produced the real arm64/x86_64 iOS simulator app with its share
  extension. This is committed-source build evidence, not TestFlight or
  physical-device acceptance.
- Live cloud readiness is deferred because both gcloud user and Application
  Default Credentials had expired at the read-only auth check. No project,
  Firebase, preview, deployment, or promotion result is inferred from the local
  pass.

- The built-in coaching recording editor no longer depends on a Mac-local
  renderer in production. Exact released participant generations now queue a
  create-once private GCS render through the existing media Cloud Run Job.
- The worker independently checks metadata and complete SHA-256 for every
  participant source, renders the reviewed trim/text-edit decision, verifies
  AAC format and duration, decodes to EOF, uploads create-once, and downloads
  the exact output generation for byte-level readback before completion.
- Session output and workflow rows commit before the cloud outbox. Lost-response
  replay reuses the same output, job, and manifest. Originals remain immutable;
  the result stays coach-private until the existing proof-listen and explicit
  release gate is satisfied.
- Derived Session playback now pins its registered GCS generation in addition
  to byte count and SHA-256. Private previews and downloads now verify that
  receipt and stream range requests from the exact generation, so timeline
  seeking does not buffer a whole long recording through Nest. The renderer
  also hashes files incrementally rather than retaining an entire export in
  Node memory.
- Focused contract, worker, outbox, object-reader, recording-share service, and
  UI tests plus strict shared, worker, and Quipsly TypeScript pass. Live
  two-source rendering, proof listening, recipient readback, revocation, and
  cost measurement remain deferred release evidence. Detailed decision record:
  `docs/coordination/2026-08-25-cloud-session-recording-share.md`.
- Release IAM now includes dedicated Session audition/share control folders and
  a create/read-only recording-share derivative folder. The processor cannot
  overwrite derivatives; Nest can queue/reconcile work and read the result but
  cannot create it. Both new worker lanes are deterministic manifest proofs.
- Recording-share cloud qualification now has an explicit opt-in, synthetic-only
  GCS fixture with generation-pinned sources, real FFmpeg editing, output
  readback, create-once replay, and cleanup confined to its random job identity.
  Its credentialed run remains deferred; the static guard, manifest audit, and
  worker/FFmpeg suites pass locally.
- Camera-audition qualification has the same guarded fixture boundary using a
  generated 24 fps video-with-audio source. It proves the exact-generation
  extraction, compact complete-decode AAC receipt, immutable source readback,
  replay, and job-confined cleanup without touching real Session media.
- Compact audition outputs now live in their own derivative managed folder.
  The processor has create/read only and Nest has read only, so the cloud
  identity cannot overwrite a completed audition even though unrelated proxy
  workers retain update authority in their separate folder.

## Conventional call progression checkpoint

- Quipsly's call-entry contract now matches familiar Meet, Teams, Zoom, and
  Riverside patterns: one green room, mic/camera state, one Join action,
  optional collapsed settings and sound check, and remembered browser/iOS
  device authorization.
- Device permission remains contextual and OS-owned. Recording consent remains
  a separate Session-scoped decision; neither is presented as recurring Quipsly
  administration.
- Before joining on the web, the camera stage now lives inside the same outer
  room as the selected mic/camera summary, familiar toggles, and one Join
  action. Optional settings remain collapsed below it. The ordinary surface
  never claims a preview or remembered setup unless the browser actually
  opened the selected devices.
- After joining on the web, the participant-owned recording consent/Record
  surface now appears directly after call controls for coaching and Episode
  Sessions. Optional device settings no longer interrupt the primary
  join-to-record progression.
- After joining on iPhone, a compact participant-owned Record row remains
  pinned above Mute, Camera, and Leave. It reports ready, participant-waiting,
  host-waiting, or recording-choice-needed state while the detailed recorder
  and production workspace can scroll independently.
- Existing camera-failure fallback, second-device no-audio mode, live device
  recovery, and separate local/provider recording boundaries remain intact.
- Browser Stop now presents one visible latest-source receipt from local save
  through upload and exact-byte verification, including an honest Keep open or
  Safe to close boundary. A verified receipt opens its exact canonical source
  in the in-app Session recording workspace immediately; multi-device Studio
  assembly continues independently. Safe to close still requires every local
  browser source to be settled, so an older upload cannot be hidden by a newer
  verified take. Detailed recovery remains secondary.
- When exact finalization creates a transcript job, Capture changes its one
  next action to Review transcript and opens the exact source in the polling
  Session transcript workspace. Without a transcript job, it keeps Review
  recording. No manual start or provider job identifier enters the happy path.
- The normal fully allowed transcript workspace omits permission administration
  and leads with Transcript and Follow-up. Recording choice appears only for a
  real waiting/held state, with its reason visible and counts collapsed.
- Queued transcripts are background work, not a manual start step. The Session
  workspace polls queued/running/processing jobs and reserves Start/Retry for
  missing, failed, or held work.
- Native Stop already waits for terminal local save and opens Library on the
  new immutable source; the release gate now protects that transition and its
  runtime assertion.
- Forty-five focused call/handoff/stop tests and strict Quipsly TypeScript
  pass.
- The combined call, Capture, and Session review regression passes 96/96; the
  parent workspace test now isolates independently tested source-alignment
  background work instead of counting unrelated fetches.
  The two-person browser/iPhone flight is retained as human/device evidence.

## Automatic post-call transcription checkpoint

- A consented, exact-byte verified Capture upload now starts the durable
  transcript worker outbox automatically after canonical finalization. The
  coach no longer has to discover and press Run transcription on the happy
  path; that action remains available for explicit retry and version repair.
- Recording release and all-party transcription release remain separate gates.
  Held consent, missing/non-queueable jobs, and provider configuration failures
  cannot leak transcript text or undo the retained recording.
- Interrupted browser containers wait for independently verified repair. Once
  verified, the transcript provider reads the exact repair derivative while
  the job remains bound to the original RecordingAsset, participant, room, and
  consent authority. Original media bytes remain unchanged.
- The shared transcript contract permits only canonical recording objects and
  the dedicated repair namespace. Queue-time and reconciliation-time checks
  bind derivative/original generation, size, type, SHA-256, and repair-worker
  lineage metadata.
- Thirty-three focused transcript/finalization tests plus strict Quipsly and
  shared media-processing TypeScript pass. Live worker execution and real
  source-timed readback remain deferred flight evidence.

## Automatic private follow-through checkpoint

- Server Session reads now reconcile durable transcript completion and prepare
  or reuse the deterministic source-bound review packet. This no longer depends
  on a particular browser tab remaining open or a person finding Build packet.
- New transcript jobs retain the recording actor as requester. Packet authorship
  resolves to the assigned coach for booked coaching, then the requester for
  non-booked work, then the room creator for legacy evidence—never from the
  account that happened to poll or merely uploaded a client's source first.
- Automatic output remains author-private and candidate-only. Canonical tasks,
  goals, shared notes, client deliveries, messages, calendar events, edits, and
  publications still require an explicit reviewed action.
- The packet route now applies Session-note visibility policy before loading
  packet notes. A client with Session access cannot read another author's
  private review packet; project-team visibility still requires an active
  owner/editor grant.
- Exact Session reads reconcile their latest transcript, while the Capture
  Session list performs a capped latest-job-per-room sweep. Fifty-seven focused
  tests and strict TypeScript pass; live two-account negative visibility and
  automatic worker-to-packet readback remain deferred evidence.

## Native audio mastery evidence-comparison checkpoint

- Capture Recording Quality now decodes complete source and verified preview
  loudness measurements instead of offering an unexplained improved-file play
  button. It shows integrated LUFS, true peak, loudness range, and the named
  delivery target in the same simple card.
- Original and Improved playback begin at the same selected source time and
  stop one another, making the comparison useful without mixing two players.
  The improved file still requires account-bound download plus exact SHA-256
  and byte-count verification.
- Fair comparison is the default and attenuates only the improved player's
  monitoring level by the measured LUFS delta; Final volume restores the
  verified delivery level. Neither mode changes media bytes.
- The original remains source truth. Opening, measuring, or playing the card
  does not approve, promote, replace, publish, or delete media, and measured
  levels do not claim a person listened or preferred the result.
- The mobile source contract, Swift parsing, deterministic preview assertions,
  and complete unsigned two-architecture Simulator `build-for-testing` pass.
  Physical-device listening and authenticated live derivative playback remain
  release evidence rather than automated claims.

## Source-bound follow-through speaker checkpoint

- Participant-isolated source recordings now carry their exact participant
  display snapshot and stable `RecordingAsset.participantId` through transcript
  packet projection. Coaching notes, task candidates, goal candidates,
  highlights, and review lanes no longer lose a known speaker merely because
  diarization was correctly disabled for the isolated master.
- Effective speaker precedence is explicit: accepted human correction,
  reviewed group-source attribution, exact isolated-source binding, provider
  label, then unresolved. Source ownership does not claim provider text was
  human reviewed.
- Transcript packet snapshots are version two and bind speaker authority plus
  stable source participant identity. Version-one packets become visibly stale
  and rebuildable instead of being silently reused with incomplete provenance.
- Nest and Quipsly Capture follow-through cards now explain speaker-name
  evidence with compact conventional badges: reviewed name, reviewed voice
  attribution, participant recording, automatic label, or needs review.
  Speaker identity and transcript word review remain separate decisions.
- Deliberately materialized notes, tasks, goals, writing drafts, and merge
  receipts retain the same speaker authority and isolated-source participant
  identity in their immutable transcript anchor. Legacy anchors remain
  readable; a new source-binding claim without its participant ID fails closed.
- Saved Notes, Work tasks and goals, and Calendar focus plans now expose that
  same evidence in plain language. They no longer call every saved transcript
  source "reviewed," and they never expose the internal participant ID.
- Capture decodes the same additive authority fields and reuses the same native
  badge on Today tasks/goals, Session notes, merged evidence, and released
  follow-up sources. Preview UI coverage reaches participant-recording badges.
- The client-facing web follow-up shows the evidence during coach selection and
  after release, and retains the plain-language authority in its deterministic
  Markdown download without exposing internal participant IDs.
- Next-Session continuity shows the same evidence on both the current task's
  latest transcript support and an intentionally saved prior private brief,
  alongside exact transcript returns rather than copied or inferred history.
- Nest and Capture now decode and display the authority on each primary
  transcript turn before correction or follow-through. The internal stable
  participant ID remains available for integrity checks but is never rendered.
- Studio transcript review now labels a selected imported-media speaker as
  human reviewed, automatic, or unresolved. It intentionally does not claim
  participant-owned source binding when a generic Studio import has none.
- Quipsly TypeScript, 132 focused packet/review tests, 101 focused durable UI
  tests, 17 focused continuity/follow-up tests, 31 focused transcript-desk
  tests, 18 focused Studio speaker-evidence tests, the mobile Capture
  source-contract smoke, a complete unsigned generic iOS Simulator build and
  UI-test build, and all 1,143 App Store static checks pass. This is local
  automated evidence; live
  deployment, physical-device readback, and minimally instructed human
  acceptance remain future release evidence.
- Capture's encoded AAC approval/rejection path now journals the exact account,
  media lineage, listening evidence, timestamp, note, and stable idempotency ID
  under iOS file protection before transmission. Relaunch retries the identical
  request; retryable failures stay queued; semantic or lineage conflicts are
  visibly held. A deterministic harness covers relaunch, account isolation,
  exact acknowledgement, and corrupted-ledger recovery. The focused delivery
  server suite passes 12/12, both Capture static gates pass, and the app builds
  for arm64 and x86_64 Simulator. Physical-iPhone interruption and cross-account
  readback remain explicitly deferred release evidence.
- The Session-owned versioned Episode output graph remains the canonical
  packaging surface; Recording Quality stays reusable and asset-scoped. Packet
  selection now rejects approved audio that belongs to another Episode in the
  same Nest, proving either exact derivative Episode metadata or a matching
  canonical Call Room binding before reading approval evidence. Browser packet,
  withdrawal, and encoded-program review retries reuse one exact UUID and body
  until acknowledgement. Seventeen focused tests and strict Quipsly TypeScript
  pass; authenticated two-Episode and lost-response browser flight evidence is
  deferred without blocking independent work.
- Session producers can now complete the packet's conventional Episode details
  in place: title, description, type, and optional numbering/release intent.
  Saving creates and selects a new immutable packet version rather than
  mutating the selected packet. It retains the predecessor and exact approved
  audio SHA, fails a stale-tab write, and leaves hosting, upload, RSS, and
  publication explicitly false. Five additional focused service/route/graph
  tests plus an unchanged-metadata no-op regression pass with strict Quipsly
  TypeScript; authenticated browser review and
  lost-response readback remain in the deferred validation ledger.

## Cross-device transcript-readiness checkpoint

- Canonical Session consent projections now carry separate audio, video, and
  transcription participant counts plus all-party readiness. Recording can be
  ready without misleadingly claiming that transcription is ready.
- Nest refreshes the signed-in participant's transcript choice and the room's
  all-party transcript readiness while the call is open. A locally changed but
  unsaved checkbox is protected from background refresh until the person saves
  or changes Sessions.
- Quipsly Capture decodes the same canonical fields after Session load, consent
  save, and room-state updates. Its compact consent strip distinguishes
  “waiting before recording” from “recording is ready; transcript is waiting,”
  while keeping policy detail out of the primary call controls.
- The focused consent/session suite passes 33 tests; Quipsly TypeScript, the
  Capture contract, all 1,143 App Store static checks, and an unsigned generic
  iOS Simulator build pass. A two-person physical cross-endpoint change and
  readback remains human/device evidence for a later release train.

## Reviewed recording source-continuity checkpoint

- Reopening a reviewed Session recording edit now restores its exact persisted
  source manifest on both Nest and Quipsly Capture. It no longer silently
  returns to today's default participant tracks when the prior edit deliberately
  used a camera track or another verified source.
- Native `Make another private edit`, web edit/cancel, and transcript-focus
  entry points also restore the retained transcript exclusions, trim range, and
  title. A new preview therefore starts from the reviewed revision instead of
  quietly resurrecting text-based cuts.
- If a retained source is no longer present in the verified Session take, both
  surfaces keep the remaining exact selection empty or partial, show a warning,
  and require deliberate recovery. Neither surface substitutes a different
  recording merely because it belongs to the same participant.
- The focused web recording/share/consent suite passes 20 tests; Quipsly
  TypeScript, both Capture static contracts, and a complete unsigned generic
  iOS Simulator build pass. Physical iPhone playback, TestFlight readback, and
  two-account Session acceptance remain release evidence, not claims from this
  local checkpoint.

## Native device-folder executor-custody checkpoint

- Mac folder follow, exact LRV preparation, and in-place INSV verification now
  use version-two receipts that bind the originating `AgentNode` and opaque
  storage scope. The native app derives the same identity as the local media
  worker from the canonical worker root and filesystem identity; local paths
  remain withheld.
- Nest accepts the observation or receipt only while that exact executor/scope
  is online and unchanged. Device-library locators, durable workflow intent,
  local replicas, proxy jobs, verification evidence, and readiness counts all
  preserve the same custody.
- A second Mac may follow and verify the same camera package independently,
  but it cannot inherit the first Mac's replica, proxy, or verification-ready
  projection. Version-one receipts are rejected rather than silently recorded
  as global local availability.
- Twenty-one receipt/folder contract tests, the PostgreSQL two-executor
  operation, the existing external-proxy operation, Quipsly TypeScript, and a
  complete unsigned QuipslyMac Debug build pass. Direct Swift/Node readback
  produces identical node and storage-scope IDs after canonicalizing macOS's
  `/var` alias to `/private/var`.

## Shared Insta360 Drive-root refresh checkpoint

- A fresh read of the shared Insta360 root confirms eight direct capture-batch
  folders and 33 currently visible files totaling 440,033,618,057 bytes. Sixteen
  exact INSV/LRV segment pairs are now ready; eight expected segments remain
  held across two empty batches and one zero-byte/incomplete batch.
- The January 28 batch changed in place from three originals without browse
  companions to three complete INSV/LRV pairs. The retained real-root package
  regression now represents that provider transition rather than freezing an
  obsolete inventory.
- Version-two source-unit metadata describes the actual camera contract: one primary
  original and one browse companion are required, a secondary original is
  optional, and the exact observed roles are retained separately. Single-INSV
  cameras are no longer mislabeled as if a nonexistent second original were
  required for readiness or future explanation.

## Versioned Episode-to-Advanced-Studio handoff checkpoint

- The canonical Episode editor no longer opens Advanced Studio with only a
  project and episode slug. Its handoff envelope binds the exact shared-edit
  branch identity, optimistic revision, branch-state fingerprint, canonical
  timeline SHA-256 digest, canonical source-projection fingerprint, and current
  Episode-sequence playhead. The URL never carries the full canonical timeline
  manifest. Optional Story card and placement identities are retained solely
  for the return path.
- Advanced Studio treats every route value as an untrusted handoff hint. It
  re-reads the permission-checked Episode editor projection, compares the
  Episode, branch, revision, edit intent, timeline, and source identities, and
  applies the sequence focus only after every value matches. Focus changes no
  media and creates no edit decision.
- A changed branch, timeline, source projection, mismatched Episode, malformed
  envelope, or inaccessible projection fails visibly. Studio keeps its normal
  editor state, refuses to guess another source or branch, and offers a return
  to the current canonical Episode workspace. Legacy branches without a state
  fingerprint continue to open Studio but are not mislabeled as verified
  versioned handoffs.
- Twenty-five focused contract, interaction, and route tests pass alongside the
  Episode-edit store test and a retained-database operation. That operation
  loaded a real local Episode through the permission-checked projection,
  round-tripped its bounded handoff, verified the exact revision, and refused a
  deliberately newer revision. Quipsly typecheck and the complete 194-route
  production build pass.

## Source-select to Episode-editor continuity checkpoint

- A promoted Source Story placement now continues into the canonical shared
  Episode workspace rather than bypassing it for the global Advanced Studio
  surface. The handoff carries the exact Story card and exact timeline
  placement as stable URL identities alongside the Episode identity.
- The Episode editor opens its retained Story bin, resolves the requested
  placement only inside the current Episode, selects the owning board, cues the
  saved track time, highlights and focuses the exact card, and explains that
  its immutable source range remains linked. A placement-only deep link derives
  the card from that verified placement rather than losing focus.
- Missing, withdrawn, inaccessible, or mismatched identities fail visibly and
  leave the library open without guessing another source. The local Studio link
  remains available from the Episode editor for advanced conform and rendering;
  it is no longer the first hop from source organization into editorial work.
- Twenty-two focused interaction and route tests prove encoded navigation,
  server-to-client identity forwarding, exact cue/highlight behavior, and the
  existing Story-bin editing contract. Quipsly TypeScript remains clean.

## Source-library visual-map checkpoint

- Source-library cards now distinguish a checksum-bound contact-sheet sprite
  from an ordinary thumbnail. Camera packages preserve the derivative grid and
  exact source-time samples in their logical library projection rather than
  flattening the complete sheet into one unreadable image.
- Grid cards show representative first, middle, and last source-clock cells;
  compact list cards show the endpoints. They reuse one protected derivative,
  add no copied media or per-card thumbnail jobs, and expose an accessible
  description of the sample count and covered source-time range.
- The full source viewer remains the deliberate inspection surface: opening a
  card reveals every retained filmstrip frame, waveform, and exact In/Out
  transport. The browse map is an orientation aid, not an editing decision.
- Read-only inspection of a real eight-batch shared Drive library confirmed the
  existing intake boundary matches working Insta360 storage: one root may own
  direct capture-batch folders, each batch may contain multiple INSV/LRV
  segments, zero-byte or not-yet-uploaded members stay held, and completed
  packages remain logical camera units instead of loose files.

## Real Episode 5 source-navigation checkpoint

- The retained Episode 5 segment-4 source story now addresses its source by
  stable capture key (`VID_20260402_080506_004`) instead of whichever Insta360
  package happened to be created most recently. The generic visual and audio
  operations also accept an exact source-set id and reject conflicting
  selectors.
- The complete 81.76-second collaboration proxy produced an eight-sample 4x2
  visual overview and a complete-decode audio map with 273 public waveform
  windows and six measured frequency bands. The visual receipt identifies
  derivative `svoderivative_6330e151796e4cc862768b6301800f6233200a12c1ca45cc`;
  its 53,369-byte JPEG is 1140x328 and has SHA-256
  `c4da484fe4fa730221add93f76cca67516392889742e508fa4f9bf4aab7c8b9b`.
- Human inspection confirms the overview honestly shows the unstitched dual
  fisheye camera pixels and Homer beside the lake at dusk. Quipsly does not
  present that image as an equirectangular look-around or invent a camera
  direction before a reviewed stitched master exists.
- Retained authenticated replay proves the Source Room, writing context,
  canonical Episode handoff, eight visual sample times, waveform and frequency
  projections, protected prefix and suffix byte ranges, invalid-range refusal,
  outsider denial, exact source hashes, and idempotent placement. The app proof
  checks structured counts rather than concatenated React server-rendered text.
- The visual/audio navigation rail now owns the source-range transport too. A
  creator can mark In or Out at the current picture/sound playhead, see the
  selected span on the waveform, play only that exact range, select the whole
  take, or clear it before writing the reusable card. The existing I/O and JKL
  keyboard path remains available; this adds a discoverable touch/mouse path.
- Two interaction tests prove the exact callbacks and refuse range playback
  when Out is not after In. The retained Episode 5 page also proves the new
  range and whole-take controls at the authenticated rendered boundary.

## Google Drive OAuth installation boundary checkpoint

- Google user-data OAuth client creation remains an explicit Google Auth
  Platform console action; the similarly named IAM OAuth-client CLI cannot
  request Drive `drive.file` access and is not used as a false automation
  substitute.
- Once the administrator downloads the Web application credential, the new
  `quipsly:drive:oauth:install` boundary validates both production/local
  JavaScript origins and callbacks before any cloud write. It refuses installed
  or iOS client JSON and malformed or oversized credential files.
- The installer proves the existing Picker/state/encryption prerequisites,
  creates or rotates only the client ID and client secret in Secret Manager,
  never prints either value, and retains only a SHA-256 client fingerprint and
  non-secret project choice locally. Exact replay is idempotent and adds no
  secret version.
- The ordinary local launcher now reads that machine-wide non-secret choice and
  continues loading provider secrets only inside durable child processes. The
  source JSON is never copied into Git or lifecycle state and is deliberately
  not deleted for the operator.
- The authenticated connection projection now reports OAuth and Picker
  readiness without exposing configuration values. Source Story does not offer
  a live Connect or Browse action when that action would fail; it explains that
  provider setup is being finished and explicitly preserves existing sources.
- Installer tests pass 3/3, OAuth tests pass 4/4, local lifecycle tests pass
  16/16, Quipsly TypeScript, the production build, shell syntax, and diff checks
  pass. Real installation remains pending the downloaded Web application
  credential; no OAuth client or secret version was invented.

## Checksum-bound source visual overview checkpoint

- Source Story can now request a durable 4x2 JPEG contact sheet for a video
  source without reading or rewriting its original media. The job is bound to
  the exact source-revision identity, exact collaboration-proxy generation,
  SHA-256, byte length, profile, and output locator.
- The local media worker claims the job under a lease, re-verifies the proxy
  before and after FFmpeg sampling, probes the generated JPEG, and records an
  append-only `StudioMediaDerivative` plus a structured result receipt. Exact
  replay returns the existing derivative instead of spending work twice.
- The source-library projection exposes the ready overview and its current job
  state. Source cards render the protected derivative as their thumbnail and
  provide an explicit `Build 8-frame visual map` action when one is absent.
- A retained HGO operation generated derivative
  `svoderivative_3fa494b25aebd44ddb4dd6e6804c9b0f258cbeffce574a2a`
  for the complete Insta360 package. Its 61,800-byte, 1140x328 JPEG contains
  eight ordered source-time samples; its SHA-256 and dimensions match the
  worker receipt; the input proxy remained byte-for-byte unchanged; and a
  second request replayed the same derivative.
- Signed-in Chrome operation loaded that protected image at its natural
  1140x328 dimensions, rendered the checksum-bound status in the 19-source
  library, and retained a 1920-pixel layout without horizontal overflow.
- Media-contract tests, worker tests, PostgreSQL integration, TypeScript, both
  media package builds, and the complete 194-page Quipsly production build
  pass.

## Cursor-paged source library and durable collections checkpoint

- Source Story no longer depends on three silent 500-row media windows. One
  versioned cursor advances camera packages, standalone connected files, and
  Quipsly assets independently, merges them on a stable `createdAt + kind + id`
  order, and resumes only the streams actually emitted on the prior page.
- Package members are excluded at the database query boundary, so an Insta360
  take remains one library item even when its originals, LRV, and Quipsly asset
  registrations all exist. Server-side search spans the complete source
  library, including package-member filenames, while exact deep links pin an
  older source beside the first current page.
- `StudioSourceCollection` is a distinct filing kernel, not an overload of
  tags, personal research promotion, story boards, or media bytes. A collection
  is personal or Nest-shared; every item references exactly one canonical
  source set, external reference, or media asset; PostgreSQL checks the stable
  target key against that foreign key.
- Create, file, and unfile operations are client-request idempotent,
  optimistic-revision checked, serializable, and append-only. Personal
  collections are owner-only; shared collections remain bounded by the
  existing Nest read/write authorization surface.
- Source Story now searches all sources after a short debounce, loads further
  pages deliberately, creates personal/shared collections, and files the
  selected source without copying it or changing tags, cards, boards, writing,
  timelines, or media.
- Prisma format/validate/generate, Quipsly TypeScript, 31 focused tests against
  real PostgreSQL, and the complete 194-page production build pass. The local
  schema has all 104 migrations applied.
- A retained signed-in HGO operation created personal collection
  `cmsj7y4hl0003s7xlpwzxlcrq`, filed the complete Insta360 package, replayed
  both requests without adding revisions or items, and traversed all 19
  canonical sources one item per page without loss or duplication. Rendered
  operation then selected the collection, reduced the bin to its one package,
  returned to All, searched the complete library for `Insta360`, and received
  one match across 19 sources. The 1920-pixel workspace had no horizontal
  overflow; the remaining browser console noise came from Chrome extensions
  and the deliberately replaced pre-login local session, not Source Story.

## Source bin checkpoint

- Source Story now opens with a package-aware Source bin rather than three
  disconnected media lists. It projects Working, All, and Attention
  collections; thumbnail and list views; source-date/type/location grouping;
  media and readiness filters; search and sorting; and exact select, chosen,
  and board-use counts.
- Working is derived from durable story-card and board use rather than a second
  manually synchronized folder. Browse readiness is distinct from final-render
  readiness, and a multi-file Insta360 take remains one item with expandable
  package health and exact-member roles.
- The client renders at most 60 source items before an explicit reveal and uses
  rendering containment. The server reports loaded, matching, and canonical
  totals; opaque cursor paging and server-wide search now replace the former
  500-row boundary. The next scale-and-UX boundary is checksum-bound visual
  derivatives so large libraries can be scanned by contact sheet, waveform,
  and filmstrip without opening each source.
- The retained authenticated High Ground Odyssey readback projects 19 source
  items, 4 working sources, 4 exact selects, 1 complete Insta360 package, and a
  ready spatial browse proxy. Browser operation selected Working and List,
  reduced the visible source cards from 19 to 4, and kept the viewer, binder,
  and writing controls legible in the same desktop workspace. The final stitch
  master remains honestly pending.
- The source projection tests, 13-case PostgreSQL Source Story suite,
  TypeScript, and full 194-page production build pass. Research and architecture
  rationale are recorded in
  `docs/research/2026-08-07-source-bin-story-binder-editor-research.md`.

## Source Story binder checkpoint

- Source Story now has first-class durable binder controls: create an empty
  section, name and summarize it, move it through the outline, open its shared
  writing, and archive it after its cards are moved or unfiled.
- Board revision owns section membership and ordering; section revision owns
  title, synopsis, writing link, and lifecycle. Card arrangement no longer
  derives or resets binder order, so filing a new clip cannot silently reorder
  a writer's outline.
- Every new section begins with an append-only creation receipt. PostgreSQL
  independently restricts operation kinds and contiguous revision transitions.
  Archived sections retain their document and history and cannot be implicitly
  revived by a card-placement write.
- Contract and real PostgreSQL integration coverage exercises idempotent replay,
  request collisions, stale authority, exact-section order, occupied-section
  archive refusal, writing retention, and card-order independence.
- The retained High Ground Odyssey board `52996a24-e0ba-4ad7-be07-7e9a481168fc`
  now contains the productive section `Insta360 selects — editorial spine` at
  binder position two with shared document
  `a71e8df3-1829-412e-985c-a27828fc024e`. An isolated QA section completed
  create, update, writing-link, and archive revisions 1–4; it disappeared from
  the active projection while its document and receipts remained.
- The operated rerun caught and repaired historical replay ordering: a valid
  `open-section-writing` request now replays after a later archive, while a new
  request against the archived section still fails closed. Authenticated Story
  and Writing pages returned 200 with the expected binder context, while the
  signed-out shell omitted the private section. Re-run with
  `pnpm quipsly:retained:story-binder`.

## Source Story to Episode timeline checkpoint

- A source-backed Story card can now enter the existing canonical Episode
  timeline without creating a second editor or flattening its source identity.
  Promotion retains the exact card revision, immutable source range and clock,
  source and package checksums, collaboration derivative, 360 reframe recipe,
  actor, and explicit no-render/no-publication boundaries on the normal
  `TimelineClip`.
- Episode artifact v6 preserves visual transform keyframes and the
  `quipsly-source-story-timeline-binding-v1` through save and browser hydration.
  The browser edits against a provider-neutral proxy descriptor; final render
  remains obligated to resolve and verify the exact retained source/package.
- Source Story exposes Episode duration/fingerprint projections, deliberate
  append or exact-time placement, video-track selection, editor navigation,
  active-placement history, and withdrawal. Promotion and withdrawal are
  serializable, request-idempotent, optimistic-fingerprint protected, and
  recorded in an append-only operation ledger. Withdrawal removes only the
  canonical clip and now-unused imported-media descriptor; it keeps the card,
  source range, package, and history.
- Ordinary editor saves now reconcile Source Story placements in the same
  serializable transaction as the Episode artifact. Moves/trims become
  `timeline-reconcile`, editor deletion becomes `editor-withdraw`, and exact
  restoration becomes `editor-restore`; provenance stripping, duplication,
  source substitution, and trimming outside the retained range fail closed.
  The selected-clip inspector shows retained versus current source clocks,
  proxy-versus-final-conform boundaries, card revision, 360 framing, and a
  direct link to the highlighted source card and discussion.
- The retained High Ground Odyssey card `231ea3c6-c0bf-49a7-9541-320a63e4c6a6`
  is actively placed as `fddb3f8f-3f94-4d3c-8a1c-645a5ba2e56f` in QA Episode
  `source-story-spatial-promotion-qa-20260807`. Authenticated app readback
  returned the Story projection, editor shell, and canonical Episode clip;
  protected first/suffix ranges returned 206, an unauthenticated range returned
  404, and both retained Insta360 originals kept their exact SHA-256 values.
- The sixteen-case PostgreSQL smoke covers create/revise/rebind, promotion,
  replay, request collision, artifact hydration, spatial transforms,
  withdrawal, editor reconciliation and rejection paths, ledger order, and
  source/card survival. This is a local
  production-shaped checkpoint, not a cloud deployment or final
  Insta360-quality render claim.
- `pnpm quipsly:retained:source-story-editor-handoff` operates the HGO path
  through the authenticated web API and exact-card page. The retained QA
  placement is active at revision 4 after move/trim, delete, and restore; a
  provenance-stripped save returned `SOURCE_STORY_BINDING_REMOVED`, and the
  exact Source Story deep link returned HTTP 200 without changing source media.

## Insta360 source-to-story checkpoint

- Spatial rendering now has a versioned two-stage contract. Raw `.insv`
  packages must first pass through an official Insta360 MediaSDK stitch into a
  checksum-bound 5760x2880 equirectangular master; Quipsly then applies the
  retained source-time yaw, pitch, roll, and FOV recipe through an FFmpeg
  `v360` frame-commanded renderer. The contract rejects `.lrv` browse media as
  final render input and keeps render results unpublished.
- The Quipsly reframe stage is executable and tested: FFmpeg 8.1.1 rendered a
  1280x720/24 proof with AAC audio using 96 runtime view commands over 24
  frames, then completed a full decode/readback. Eased interpolation and the
  short angular path across positive/negative 180 degrees are deterministic.
- The operated Mac readiness boundary is visible in Source Story: Insta360
  Studio 5.9.9 and automatic Quipsly reframing are ready, while the documented
  Desktop MediaSDK runner is not supported on macOS arm64. The UI therefore
  reports `Studio handoff`, instructs the creator to export one reviewed 2:1
  stabilized master, and never implies that the installed GUI is an automation
  API. A licensed Linux x64 or Windows x64 MediaSDK adapter remains required for
  completely automatic raw stitching.

- Source to Story now treats a multi-file camera take as one immutable package
  instead of showing creators a loose pile of `.insv` and `.lrv` files. Exact
  members keep their own checksums, byte counts, roles, render requirements,
  projection metadata, and provider provenance; one explicit browse member owns
  the package source clock.
- The Nest story workspace groups complete Insta360 packages and exposes their
  contents on demand. Unstitched LRVs use an honest dual-fisheye video preview
  for timing and source ranges; verified stitched equirectangular derivatives
  activate the interactive look-around viewer and source-time pan, tilt, FOV,
  aspect-ratio, stabilization, and horizon keyframes.
- The real retained High Ground Odyssey package
  `VID_20250711_222639_00_037.insv` plus
  `LRV_20250711_222639_01_037.lrv` produced one 960x480 verified browse
  derivative and a source-backed card with two spatial keyframes. Both originals
  retained their pre-operation SHA-256 values; no local path entered the client
  projection.
- A disposable verified read-only collaborator opened the canonical page over
  the live local app. Protected first and suffix byte ranges returned 206,
  invalid range returned 416, an unauthenticated request returned 404, and the
  identity/grant were removed after proof. This operation also caught and
  repaired a full-range YUV proxy defect, a stale generated Prisma client in the
  running app, and hard-delete ordering for restrictive immutable-source links.
- Source Story contracts, eight-case local database smoke, worker tests, Prisma
  validation/status, the media-worker build, Quipsly typecheck, and the full
  194-page production build pass. See
  `docs/coordination/2026-08-07-drive-source-to-story-architecture.md`.

## Participant camera-readiness checkpoint

- Capture-take inspection now projects an explicit camera-readiness ladder from
  the selected immutable sources, reviewed transcript speaker identities, and
  speaker-camera mappings: no video, speaker review required, camera identity
  required, primary angle required, or ready. It exposes per-participant camera
  coverage and never invents identity or a primary angle.
- The Episode editor provides the matching recovery path: the exact Session
  recording-source workspace for missing video, exact-source speaker review for
  unresolved voices, and automated-edit evidence for primary-camera choices.
  Existing missing/ambiguous camera warnings no longer send producers to the
  unrelated Guided sync surface.
- Session Episode assembly evidence now carries the same bounded projection
  into the finishing cockpit. Its generic media-only warning becomes a precise
  camera state and action without creating a second workflow record.
- The retained audio-only Episode honestly reports `NO_VIDEO_SOURCES` while
  both protected audio sources still play and pause. The rendered Session
  cockpit says that canonical audio exists but no camera source does and routes
  back to its exact Recordings mode. A synthetic two-camera case reports
  `PRIMARY_ANGLE_REQUIRED`; focused tests, rendered operation, and typecheck
  pass. See
  `docs/coordination/2026-08-06-participant-camera-readiness.md`.

## Exact-source speaker-review handoff checkpoint

- Capture-take warnings now distinguish a transcript with no provider
  diarization labels from a provider cluster that merely lacks a reviewed real
  participant identity. The first routes to per-turn protected-playback speaker
  review; the second routes to `Identify a voice once`; camera missing or
  ambiguity routes to Guided sync.
- The correction desk now accepts an exact RecordingAsset identity at its
  database query boundary. It does not fall back to the newest room transcript,
  and a selected source with no accessible job returns 404. Room-wide accuracy
  scorecards are suppressed while one source is focused so metrics from a
  different job cannot appear beside it.
- The retained rendered editor followed its warning into the DJI backup desk
  and read back transcript job `cmsi6pqf7000uazxlrp1ytaea` for RecordingAsset
  `cmsi2v4l4000rlqxl78h1w8t3`. The intended review surface rendered, a bogus
  source failed closed with 404, no horizontal overflow or browser exception
  occurred, and no media or publication state changed. See
  `docs/coordination/2026-08-06-exact-source-speaker-review-handoff.md`.

## Conflict-safe Episode evidence update checkpoint

- A ready Episode update now deep-links from its Session to the exact take
  update control. Blocked source/sync evidence still routes to Guided sync, and
  a current materialized take still routes to automated-edit evidence.
- The editor explains the exact projected write before enabling it: source
  lanes created/reused, transcript turns added/replaced, unrelated clip and
  transcript work preserved, and speaker-camera mappings added/manual mappings
  preserved. Existing materializations use plain-language update copy rather
  than appearing to create a second take.
- The retained rendered Episode previewed zero new and two reused protected
  lanes, four current transcript turns added and three stale turns replaced.
  The guarded update converged to `MATERIALIZED_MEDIA`; both protected sources
  returned range bytes, played in the Remotion timeline, and paused together.
  No browser exception, source mutation, or publication occurred. See
  `docs/coordination/2026-08-06-conflict-safe-episode-evidence-update.md`.

## Matched-source retained transcription checkpoint

- An explicitly authorized local QA operation started transcription for the
  retained 18.4-second DJI backup master, followed its durable job through the
  existing launcher-owned Whisper worker, and read the result back through the
  exact-source Session API. The completed job contains four immutable segments
  and 47 timed words. No cloud transcription provider was invoked.
- A deterministic comparison against the independently captured microphone
  transcript measured one word edit across 47 reference words (2.1277% WER).
  This is evidence of matched-source consistency, not a human accuracy score:
  the microphone transcript heard `Quipsley` while the backup transcript heard
  `Quipsly`, and neither was silently corrected or declared ground truth.
- The operation created no Note, Task, Goal, correction overlay, or publication
  state. It first made both Editor checkpoints current because the canonical
  assembly was `READY_TO_MATERIALIZE`; the separately reviewed editor update
  then made them complete while preserving its speaker/camera warning. See
  `docs/coordination/2026-08-06-matched-source-retained-transcript-operation.md`.

## Session source-journey flight recorder checkpoint

- The Episode and Session Finishing Cockpit now reconstructs one readable
  Plan → Capture → Retain → Transcript → Editor journey for every declared or
  observed source. The projection is derived from existing canonical receipts;
  it creates no workflow state and does not convert live presence, server bytes,
  transcript attempts, or editor materialization into stronger claims than the
  evidence supports.
- Editor membership is now bound to the exact RecordingAsset identifiers in the
  canonical assembly plan. Historical sources that share a capture group remain
  visible, but are not falsely presented as members of the selected take.
- A read-only retained operation reconstructed four real local source journeys,
  selected exactly the two recovered masters for the editor, preserved two older
  recordings outside the take, and surfaced the remaining transcript and capture
  evidence gaps. Focused model/component/page tests and Quipsly typecheck pass.
  Rendered localhost operation remains explicitly queued because the in-app
  browser rejected loopback navigation under its URL policy. See
  `docs/coordination/2026-08-06-session-source-journey-flight-recorder.md`.

## Exact-source transcript recovery checkpoint

- Every incomplete Transcript checkpoint in the Source Journey now opens the
  transcript workspace with its exact RecordingAsset identity. The packet read
  rechecks Session access, constrains the selected source to that room, and
  selects only transcript jobs for that asset instead of silently falling back
  to the newest transcript in the room.
- A released source with no prior job now exposes the existing durable
  source-bound start action. Opening or replaying the focused workspace remains
  side-effect free; starting provider work still requires an explicit button.
- A real local HTTP operation focused retained DJI recovery asset
  `cmsi2v4l4000rlqxl78h1w8t3`: it had zero jobs before and after two reads,
  exposed the bounded start action, replayed stably, and returned 404 for a
  source outside the room. No provider job was enqueued. See
  `docs/coordination/2026-08-06-exact-source-transcript-recovery.md`.

## Obvious-depth feature portfolio decision

- Current primary-source market research and the repository's operated depth
  point to one next large product swing: an Episode and Session Finishing
  Cockpit, not another disconnected feature page. It should project the existing
  capture-group/source inventory, alignment, transcript truth, audible-event,
  mastery, automated edit, outcome, delivery, and governed-action ledgers onto
  one source clock and one readable recovery history.
- The first five modes are Recover, Understand, Repair, Assemble, and Finish.
  The first operated proof should take one retained Episode from safe-to-leave
  source recovery through a prioritized attention queue, reviewed audio master,
  reversible rough-cut operation set, canonical outcomes, and versioned output
  candidate.
- The two highest-leverage companion bets are permission-aware Semantic Media
  Memory returning exact ranges and an Evidence Lens/Research Studio with
  selected source sets, portable annotations, claims, contradictions, and
  citation-backed outputs. Generic automation, duplicate boards, and shallow
  LMS/social navigation remain deliberately later than the shared finishing,
  source, output, and delivery contracts. See
  `docs/research/2026-08-06-quipsly-obvious-depth-feature-portfolio.md`.

## Governed conversation-to-work checkpoint

- Explicit transcript-to-Note, transcript-to-Goal, and transcript-to-Task
  creation now commits the canonical work object atomically with a typed
  governed action run, exact authority/read set, target identity, one succeeded
  attempt, and one immutable execution receipt. The same contract covers direct
  creation and ACCEPT of a reviewed packet candidate.
- Reviewed packet MERGE now uses sibling governed capabilities for appending
  source-bound evidence to one explicitly selected existing Goal or Task, or a
  new immutable revision to one explicitly selected actor-owned Note. The
  operation records exact target before/after snapshots; Goal and Task merge
  cannot quietly edit status, ownership, dates, planning, reminders,
  recurrence, tags, goal links, progress, or project identity. Note merge can
  change reviewed wording, purpose, and audience, so it is high-consequence and
  carries an explicit compensating-revision recovery contract.
- Note, Goal, and Task provenance points back to the action receipt; exact retries
  return the same target, changed evidence fails closed, and legacy work is not
  assigned fabricated history. The operation cannot alter transcript/recording
  truth, schedule a reminder or calendar event, deliver a message, call a
  provider, or publish.
- Session Review exposes the short receipt identity after successful creation
  or evidence merge. Capture Today and Work also expose the latest governed
  merge receipt and return to the exact transcript source after relaunch.
  Capture adds direct Notes, Goals, Tasks, Transcript, and review-queue jumps so
  deep packets do not bury the next decision. Note `CLIENT_SAFE` is only an
  audience eligibility ceiling; client-visible follow-up remains a separate
  future delivery capability.
- Compiled Capture acceptance uncovered a vanished temporary retained-audio
  dependency. The local operation now uses a versioned durable exact-byte
  source for new clones without rewriting the old canonical fixture. Current
  iPhone 17 Pro simulator qualification passed after actual playback and human
  confirmation of the complete three-segment thought. It created and read back
  exactly one Note, Goal, and actor-owned Task, plus all three governed
  receipts, with zero calendar links or external effects. Today also exercised
  the collapsed-task expansion needed to reveal reviewed work behind the top
  three due commitments. Full evidence is documented in
  `docs/coordination/2026-08-06-governed-conversation-to-work.md`.
- Two additional compiled simulator operations played and confirmed all three
  exact source segments before merging evidence into an existing Goal and an
  existing Task. Both rendered governed receipt identity after relaunch,
  returned from Today to the exact source, preserved the complete canonical
  target state, and proved idempotent replay. The Task fixture now includes and
  protects a real planned focus block so a mature retained account does not
  depend on an accidentally sparse Today queue.
- A fourth compiled simulator operation merged reviewed evidence into an
  existing private Note as one immutable revision. It rendered the governed
  receipt after relaunch, returned to the exact source, proved exact replay did
  not duplicate the revision, retained exact content and audience before/after
  state, and produced zero delivery or adjacent work. Separate-account
  visibility proof and a separately governed client-delivery capability remain
  open.

## Governed action runtime foundation

- Quipsly now has one typed, provider-neutral action ledger spanning the mature
  writing assistant and the first non-writing capability,
  `quipsly.session.preflight.publish`. Runs retain intent, authority/read-set
  snapshots, consequence, budget, progress, and completion; actions retain
  capability/version, payload and envelope hashes, decision policy, result,
  and recovery contract; numbered attempts and immutable receipts retain what
  actually happened.
- Existing `StudioAssistantAction` remains the writing UI adapter. Proposal,
  approval/direct apply, commit, rejection, and undo now project into the same
  governed lifecycle while preserving document-kernel stale-source checks and
  reversible operations. The writing UI exposes the capability and receipt
  identity without adding an approval layer.
- Session preflight writes its canonical receipt and governed run/action/
  attempt/receipt atomically. The retained coach/client operation proved two
  distinct actors, exact replay, changed-payload conflict, stale offline
  expiry, outsider 404, one succeeded attempt, and zero private sample bytes.
- Prisma, TypeScript, focused UI/runtime tests, retained assistant PostgreSQL
  integration, and the real local Session HTTP operation pass. Physical iPhone
  and production qualification remain open. See
  `docs/coordination/2026-08-06-governed-action-runtime-foundation.md`.

## Unified audible-event analysis checkpoint

- Detector output now belongs to an append-only source ledger rather than an
  Episode JSON document. Podcast Episodes, coaching Sessions, Audio Studio, and
  Dialogue Repair project one exact-source analysis and one reusable protected
  qualification lab.
- Native Apple analysis was registered for a retained 80-second coaching source
  and an eight-second High Ground Odyssey source. The retained coach opened the
  actual Session, saw the classifier suggestions, and completed bounded
  protected playback; no listening verdict was fabricated.
- Real operation rejected two invalid local registration envelopes because the
  scripts had not canonicalized macOS `/var` to `/private/var` and omitted two
  successful-null fields that the parser includes. The scripts now share the
  server's exact path and receipt normalization contract. See
  `docs/coordination/2026-08-06-unified-audible-event-analysis-ledger.md`.

## Agent-qualified audio alignment checkpoint

- Guided Sync can now create and resume a durable two-source
  `audio-alignment` processing job. The request binds the exact spine and
  target asset, provider, locator, generation, SHA-256, size, content type,
  clock proposal, two analysis windows, correlation thresholds, and immutable
  safety boundaries. The local media worker leases the job, verifies both
  authorized source paths and hashes, performs bounded FFmpeg decodes and FFT
  correlation, then writes an evidence-only result. Reconciliation re-hashes
  both current sources before registering the receipt. The rendered editor
  exposes opening/later peaks, measured anchor, late residual, job failure,
  and a separate **Load measured proposal** action; neither analysis nor
  loading a proposal checks a review box or changes the timeline.
- The retained operation queued the real source/proxy pair through the HTTP
  route, leased it through the PostgreSQL worker, reconciled it, rendered the
  completed evidence, and loaded the proposal before operating preview,
  pause, explicit delegated review, and assembled playback. This uncovered
  and repaired an actual JSONB boundary bug: exact source identity is now
  compared field-by-field because PostgreSQL may reorder object keys. The same
  job now has a create-once GCS manifest/queue/result control plane, generation-
  bound two-source Cloud Run worker, lease recovery, terminal dead letter,
  and exact-source database reconciliation. The cloud fixture is green, but
  the new processor image and Nest route are not deployed yet; production
  cloud analysis is therefore not claimed yet.
- Guided Sync now treats source offset as signed. If a phone or camera began
  before the selected spine, Quipsly preserves that measured relationship and
  normalizes it into target-source trim plus a nonnegative timeline start;
  the prior zero clamp could have hidden a real early source and is removed.
- Production audio mastery no longer stops at the GCS boundary. Exact cloud
  sources now use a create-once manifest/queue/result control plane, complete-
  decode loudness and signal analysis, deterministic generation-bound preview
  rendering when needed, independent output verification, and an explicit
  unpromoted review state. The processor and Nest changes still require the
  next cost-aware deployment and deployed-image readback before production is
  claimed.
  A credentialed real-bucket fixture on commit `4ac426afb836a1d10776398a7a708f78e5e6bc39`
  measured the exact source at -38.25 LUFS, read the stored preview generation
  back at -16.01 LUFS, passed independent profile verification, preserved the
  source hash, proved create-once replay, and left no fixture object versions.
- Guided Sync no longer forces automation to impersonate a human listener.
  Human approval remains the default, while a signed-in staff delegator can
  authorize one bounded agent qualification backed by exact source hashes and
  two separated deterministic FFT correlation windows. The version-2 receipt
  exposes the agent, delegator, scope, method, correlations, drift, and safety
  boundaries; non-staff delegation, weak/ambiguous peaks, mismatched hashes,
  changed drift, or changed placement fail closed. A retained source/proxy
  operation measured `r=0.998465` and `r=0.999379`, saved no human-approval
  claim, operated synchronized preview and pause, persisted a two-source
  timeline, and operated decoded assembled playback with provider recording
  off. See
  `docs/coordination/2026-08-05-agent-qualified-audio-alignment.md`.

## Rehearsal authentication and Mac signing checkpoint

- Guest Google-link readiness is now independent from Episode artifact staging:
  an active pre-created guest without a Firebase binding reports
  `AWAITING_FIRST_VERIFIED_GOOGLE_SIGN_IN` even while a manuscript document or
  other rehearsal artifact still needs repair. Firebase still requires the
  first real Google token to carry the exact verified invited email before the
  identity is bound; Quipsly does not send another verification email. The
  canonical Quipsly Studio Mac build now declares and verifies its signed
  data-protection Keychain group, and the rebuilt native account agent passed
  all boundary checks. See
  `docs/coordination/2026-08-05-rehearsal-auth-and-mac-signing.md`.

## Audio master delivery-candidate checkpoint

- Verified local mastery previews now have a separate append-only promotion and
  withdrawal ledger after playback-bound review. Promotion requires the latest
  exact approval, current source/preview bytes, and the latest mastering job;
  current state is projected at the asset boundary rather than inferred from a
  historical variant.
- Episode inventory and the rendered editor expose the candidate while keeping
  the immutable source, episode spine, delivery encoding, publisher upload,
  and publication unchanged. Withdrawal requires a reason and preserves all
  bytes and receipts.
- The retained HGO operator completed a real Episode 8 mastering pass and
  synchronized source/preview audition. The human listening and promotion gate
  correctly remained closed. See
  `docs/coordination/2026-08-05-audio-master-delivery-candidate.md`.

## Browser and iPhone Session recording checkpoint

- Provider-off synchronization now has a durable late-drift rail rather than
  relying only on opening samples. Browser and iPhone sources keep an opening
  burst, five-minute in-take samples, an immediate monotonic stop marker, and a
  closing burst under their shared Session capture group. Nest projects a
  bounded residual/ppm/uncertainty packet; Guided Sync can load it only as a
  comparison starting point and leaves waveform, later-event, and human
  approval controls false. Clock outages and rejected evidence cannot block
  protected media finalization. A rendered retained Session operation proved
  provider copy Off created zero provider commands/assets while local capture
  grouping remained visible. See
  `docs/coordination/2026-08-05-provider-independent-drift.md`.
- Episode Room now routes each Capture alignment candidate to the deep guided
  sync desk with its exact `captureGroup` identity. The editor renders every
  protected master in that take, identifies the group baseline, exposes rough
  clock offsets and uncertainty, and keeps final placement disabled until
  opening-cue, later-drift, and explicit approval evidence are complete.
  Provider receipt slots and real LiveKit room composites now carry the same
  server-owned capture-group identity, but provider media remains an optional
  witness/recovery rail rather than a prerequisite for local-master grouping or
  synchronization. A signed-in local operation loaded a two-source take,
  completed both immutable signal decodes, applied a `+0.240s` clock proposal
  only as a rough anchor, and retained the approval hold. The operation also
  exposed and repaired an invalid Media Vault Prisma selection that had crashed
  real Episode Rooms. See
  `docs/coordination/2026-08-05-capture-source-rendezvous.md`.
- A Session now owns one server-generated capture group for its one recording
  encounter. Browser retained sources, authorized iPhone audio/video, Episode
  Room recording, and external-source import receive that same take identity
  while keeping distinct capture/upload IDs, participant evidence, clocks, and
  immutable bytes. Browser capture now collects three NTP-style Session-clock
  samples and displays missing legacy evidence honestly. Provider recording
  remains optional safety/reference media; it is not needed for grouping or
  clock placement, and waveform plus late-drift review remain required. Build
  27 stays preservation-compatible but does not gain the new grouping claim.
  See `docs/coordination/2026-08-04-session-capture-group-clock.md`.
- Durable Session and Episode chat now use the active LiveKit room only as a
  low-latency persisted-message hint. The strict packet contains no message
  body or author identity; browser and Capture validate its exact active thread
  and then re-read authenticated PostgreSQL state. Polling remains the delivery
  and reconnect fallback. Episode-wide chat is now hinted browser-to-iPhone;
  browser Session chat is hinted between active browser participants. Capture
  does not yet expose the take-specific Session thread or Coaching Engagement
  thread. Coaching Engagement cards now provide an explicit browser coaching-
  room action beside the full Session workspace.
- Coaching Engagement access is now an explicit, append-only boundary rather
  than an implied consequence of creating another Session. Coaches, support,
  Nest owners/editors, and staff can create seven-day account-bound invite
  capabilities, copy the link deliberately, revoke a pending link, remove or
  restore a member at an exact revision, and review the durable decision
  history. Acceptance grants only the engagement, never its surrounding Nest;
  observers remain read-only. A rendered local two-account journey proved the
  wrong-account hold, signed-out return, exact-account acceptance, and 2/2
  invite/accept receipts. Integration coverage additionally proved immediate
  denial, stale-revision refusal, explicit restoration, revocation, idempotent
  retry, and no silent reactivation during Session creation. Production release
  requires a dedicated invitation secret; external email delivery is not
  claimed.
- The “Episode relationship needs attention” state is now actionable. An
  authorized host/producer or Nest owner/editor chooses an exact same-Nest
  Episode; stale, unauthorized, cross-purpose, and cross-project writes fail
  closed. Rebinding an invalid non-null relationship requires confirmation and
  a reason. Every operation appends one idempotent before/after/version receipt,
  and safe recent history appears in the Session without exposing actor email.
  A disposable verified Firebase-emulator identity operated the production HTTP
  route against local Nest/PostgreSQL, proved exact retry replay and unchanged
  source checksum, then read back zero cleanup residue. See
  `docs/coordination/2026-08-04-session-episode-binding-repair.md`.
- Podcast recording Sessions now have a nullable first-class relation to their
  exact Episode production. Normal Capture Session creation resolves the exact
  same-project episode, writes the relation and a temporary compatibility slug,
  and rejects non-podcast, missing, or cross-project bindings. Episode Room and
  Session projections use legacy metadata only when the relation is null, so a
  conflicting relation fails closed rather than being masked. The local
  migration bound 4/4 eligible retained podcast rooms with 0 cross-project
  relations; coaching stayed unbound and one unmatched legacy podcast row stays
  visible for repair. See
  `docs/coordination/2026-08-04-first-class-session-episode-binding.md`.
- The Session workspace now projects its one canonical call/evidence kernel
  into distinct coaching, podcast, research-interview, and team-meeting
  journeys. Navigation and runway labels describe the actual job (for example,
  Coaching room / Goals & commitments / Follow-up versus Recording room / Takes
  / Editor & publish) without creating duplicate records.
- A podcast Session now opens its exact server-validated Episode Room, episode
  thread, and editor. An absent or invalid episode relationship is shown as a
  repair condition; Quipsly does not guess from the title. Session chat remains
  take-specific while Episode chat remains the long-lived writing, recording,
  editing, and publishing conversation. See
  `docs/coordination/2026-08-04-session-purpose-collaboration-map.md`.

- A canonical Session now hosts the browser LiveKit conversation client and a
  separate retained-source recorder. Browser participants can select external
  mic, camera, and output routes; the interface never equates joining a call
  with recording.
- Browser sources flush to OPFS, retain an IndexedDB recovery ledger, enforce
  current all-party audio/video consent, append source-typed START/STOP
  receipts, checksum exact bytes, and hand off through origin-bound 8 MiB GCS
  resumable chunks with persisted range progress. iPhone receipts now preserve
  the same audio/video source type.
- Episode Rooms embed that Session as their recording surface while keeping the
  episode manuscript, clip/watch plan, episode thread, timeline, and publishing
  continuity. Coaching uses the same Session kernel but projects the result
  toward engagement continuity, shared/private notes, goals, tasks, and client
  follow-up.
- An accepted Session participant can now move from the browser Session into
  the same canonical room in Quipsly Capture. The app link carries no authority:
  Capture retains it across sign-in, re-authorizes the exact Session through
  Nest, and does not join LiveKit or start local/provider recording. An operated
  retained-guest iPhone 17 Pro simulator pass proved the exact Session title
  and all three stopped states.
- Accepted invitation evidence is now separate from current participant
  authority. A host can remove invitation-owned Session access without deleting
  consent, media, transcript, chat, or authored history; Quipsly records an
  append-only revisioned receipt, denies every Nest/mobile access path, and
  reconciles every known per-device LiveKit identity. Restoration is explicit
  and does not auto-join media, send a message, or start recording. A two-account
  local operation proved connected canonical removal, immediate provider-zero
  readback,
  join-token and Session-chat denial, workspace 404, retained evidence, and
  no-effect restoration. See
  `docs/coordination/2026-08-04-session-participant-access-reconciliation.md`.
- The host participant manager now projects invitation, acceptance, removal,
  provider reconciliation, and restoration facts from the canonical append-only
  ledgers. It also shows unexpired browser/Capture join-key leases while
  explicitly refusing to call them current presence; provider identities and
  credentials remain server-only. The retained two-account operation rendered
  all five change kinds and safe device authority. See
  `docs/coordination/2026-08-04-session-collaboration-activity.md`.
- Live provider presence is now a separately refreshed, timestamped LiveKit
  readback rather than an inference from access or join keys. The host sees safe
  browser/Capture devices, canonical participant/access state, and audio/video
  published or muted state; unknown or removed-but-connected devices require
  attention without exposing provider identities. The retained operation read
  two devices/two people before removal and host-only afterward. See
  `docs/coordination/2026-08-04-session-provider-presence.md`.
- The prior full Nest checkpoint passed 301 suites / 1,572 runnable tests, the 172-route Nest
  production build passes, the media-vault CORS policy generator passes 5/5,
  the Capture/App Store static gate passes 1,025/1,025, and the Quipsly Capture
  iOS simulator build plus focused authenticated handoff operation pass. This
  is compiled and operated local qualification, not physical browser/iPhone or
  cloud-provider acceptance.
- Associated Domains/AASA activation for HTTPS Universal Links, LiveKit
  project/secrets, exact live-bucket CORS readback, physical external-
  device operation, and browser/iPhone editor playback remain deployment
  gates. The cost/environment proposal is in
  `docs/operations/quipsly-livekit-cost-and-environment-proposal.md`.
- Browser and iPhone use one purpose-aware Session media spine. Browser device
  controls now remain reachable after join, retain a connected status across
  hardware refresh, and lock source identity during retained capture; Session
  chat sits beside the live room on wide screens. Podcast continuity is the
  exact Episode Room. Coaching continuity is now a first-class engagement with
  engagement-scoped membership, Session sequence, goals, commitments, and
  thread rather than project-wide client access. See
  `docs/coordination/2026-08-04-unified-live-collaboration-architecture.md`.

## Broad-band frequency evidence and full-width review checkpoint

- New source-bound signal jobs declare a complete-decode six-band maximum
  frequency capability. Old amplitude-only receipts remain readable but are
  not reused as if frequency evidence exists.
- Retained Episode 8 now has 1,200 six-band windows over the exact 254.630023-
  second `Ted Lasso Be Curious.mp4` source; retained coaching has 800 five-band
  windows over its 80-second, 8 kHz source. Both original hashes remained
  unchanged, and the lower-bandwidth source correctly omits unavailable air.
- The shared audio evidence map now switches between level and broad-band
  frequency views and exposes selected-window plus whole-program absolute RMS
  dBFS without calling the overview a repair spectrogram or an EQ decision.
- Retained Studio operation exposed that the deep transcript desk was embedded
  in a roughly 193-pixel media card. It now opens as an accessible full-width
  dialog with Escape, focus return, body-scroll containment, container-safe
  grids, and no rendered overflow or browser exception.
- Studio provider probabilities remain visible, but a Deepgram default is no
  longer applied to local Whisper. Provider-attention words require a supported
  provider default or an explicit threshold authority in the receipt.
- Architecture, research, and operated evidence are in
  `docs/coordination/quipsly-broad-band-frequency-evidence-2026-08-04.md`.

## Measured transcript contributors and playback authority checkpoint

- Aggregate playback-reviewed WER now projects its eight largest segment
  contributors with exact source range, review kind, edit/reference counts,
  and segment rate. Aggregate WER still uses every reviewed segment, and
  provider confidence remains separate triage evidence.
- Protected transcript-review controls now follow decoded media readiness, not
  the mere presence of a database playback URL. Load failure clears listening
  progress and holds playback, correction, speaker attribution, notes, tasks,
  goals, drafts, and new accuracy claims while retaining historical receipts.
- A signed-in retained coach journey rendered three reviewed contributors from
  a genuine prior QA packet, detected that its temporary WAV bytes were gone,
  and proved the authority hold with no browser exception, overflow, mutation,
  secret artifact, screenshot, or external side effect.
- Architecture and evidence are in
  `docs/coordination/quipsly-measured-transcript-contributors-2026-08-04.md`.

## Automated edit decision-navigation checkpoint

- The source-bound automated-edit map now reconciles the first selection when
  async analysis arrives, sorts reversible proposals and review candidates on
  the source clock, and provides Previous/Next navigation instead of relying on
  unordered whole-program chips.
- Whole, 60-second, and 15-second views clip waveform and proposal geometry to
  the visible source span. Previous/Next seeks the exact evidence range and
  opens detail view; only twelve nearby chips render while the full bounded set
  remains traversable.
- The retained HGO deterministic-edit journey operated the navigator, detail
  view, decoded low-energy range, shared editor playhead, and false-proof hold.
  The proposal remained unapplied, source media unchanged, and the rendered
  map had no browser exception or horizontal overflow.
- Architecture and evidence are in
  `docs/coordination/2026-08-04-automated-edit-audio-evidence-map.md`.

## Audio evidence navigation and live-input truth checkpoint

- The shared coaching/Studio audio evidence map is now a chronological review
  navigator. It quantifies affected duration, shades complete measured spans,
  shows dBFS guides, and traverses signal observations, capture boundaries,
  and receipt-authorized provider-attention words on the immutable source
  clock. Long transcripts render only twelve playhead-near chips while Previous
  and Next traverse the full bounded queue.
- Confidence triage is no longer implicitly Deepgram-only. A transcript job may
  preserve an explicit `0..1` threshold only with a named receipt authority;
  otherwise Quipsly uses its named Deepgram default or shows no cross-provider
  threshold. Confidence remains triage evidence, never measured accuracy.
- The retained coaching Session now has 11 immutable provider-timed words and
  an 80-second WAV profile produced by the real durable worker: 800 complete-
  decode windows, 8 kHz mono, source hash unchanged. Re-running the operation
  reuses the exact completed receipt, and re-running the base seed preserves
  the matching source-bound projection instead of erasing it.
- The signed-in retained coach browser journey operates Next evidence, confirms
  the 15-second detail view, decoded-signal labels, no horizontal overflow, no
  browser exception, no secret artifact, and no external side effect.
- Mastering and treatment change maps now expose the same fast Previous/Next
  interaction over their strongest time-separated dynamic-shape changes and
  deterministic source/candidate signal flags. The retained HGO browser lane
  operated both navigators, synchronized A/B playback, outsider denial, and
  the incomplete-approval hold without mutating source or processing receipts.
- Current hardware truth remains separate: Canon R8 video is visible; the saved
  MOTIV Mix MV7i strip is disconnected, and browser microphone acceptance is
  still pending a permissioned browser profile plus a live direct MV7i route.
  Architecture and evidence are in
  `docs/coordination/quipsly-audio-evidence-navigator-2026-08-04.md`.

## Append-only audio mastery review checkpoint

- The mastering desk now tracks playback around the loudest source moment,
  quietest sustained passage, and largest processing shift in both the
  immutable source and verified preview. Approval also requires both
  level-matched and unity delivery monitoring; rejection requires preview
  playback plus a note.
- Decisions are append-only receipts bound to the exact Nest, asset, source
  generation/SHA, completed mastery job, preview SHA, actor, delivery profile,
  bounded player evidence, and idempotent client request. A later decision
  never erases prior review history.
- Approval does not promote, replace, publish, edit, or mutate media. The
  receipt explicitly states that browser-tracked player progress is evidence,
  not proof that audio was audible or that a person paid attention.
- A retained Episode 4 operation exercised the protected source and preview in
  the rendered desk. Signed-out review returned 401, a separate account
  returned 403, incomplete approval returned 409, no receipt residue was left,
  and source/preview processing receipts remained byte-bound and unchanged.
- Strict shared-media and Nest TypeScript pass; full Nest Jest passes 277
  suites / 1,463 runnable tests; and the optimized 170-page production build
  passes with an 8 GB Node build heap.
- Architecture and operated evidence are in
  `docs/coordination/quipsly-append-only-audio-mastery-review-2026-08-04.md`.

## Unified audio and transcript trust-surface checkpoint

- Imported Studio media now shows complete-decode RMS and sample-peak windows,
  signal observations, exact transcript bounds, timed provider words, review
  state, and protected playback on one shared source clock. Session review uses
  the same shared map instead of owning a route-local visualization.
- Clicking the map seeks the protected player and selects a loaded transcript
  segment. A seek or scrub no longer qualifies as listening: review controls
  unlock only after active playback progresses inside the selected segment.
- A retained Episode 8 operation bound the real `Ted Lasso Be Curious.mp4`
  source to 1,200 complete-decode windows and 84 segments / 597 timed words.
  Exact transcript bounds are 3.98–249.22 seconds inside a 254.630023-second
  decode; signed-out and unrelated-account reads fail closed and source bytes
  remain unchanged.
- No human-listening receipt, edit, master promotion, task, goal, delivery, or
  publication was created. Full architecture and operated evidence are in
  `docs/coordination/quipsly-unified-audio-transcript-trust-surface-2026-08-04.md`.

## Durable episode edit-review history checkpoint

- Generated deterministic/provider proposal sets are now canonical episode
  records rather than response-lifetime browser state. Each retains the exact
  payload SHA, provider/model, transcript and timeline hashes, covered bounds,
  actor, and immutable decoded-source identity when present.
- Proof-listen, proof-watch, dismiss, apply-to-draft, and restore-to-draft
  append idempotent actor-bound receipts. The UI labels review-only and local
  draft effects separately; a failed apply receipt blocks the local mutation
  instead of claiming unrecorded automation.
- A successful manual or automatic timeline write appends a distinct
  `CANONICAL_TIMELINE` receipt in the same serializable transaction and links
  the draft-action receipts it commits. Save receipt hashes are independently
  checked against the submitted timeline fingerprint; exact retries can return
  the existing receipt.
- Signed-in local operation on the synthetic deterministic-audio QA episode
  generated two proposal sets, proof-listened `00:04–00:07`, applied one
  source-bound low-energy range, saved it, reloaded both the range and six
  receipts, then proof-listened the persisted decision again under strict
  canonical-subject validation. PostgreSQL retained two proof receipts, one draft-apply receipt,
  and two canonical saves (restore-old-range and apply-new-range).
- Six focused suites pass 33/33, strict Nest and domain TypeScript pass, all 50
  local migrations are current, and the local Nest/worker/Auth/PostgreSQL lane
  is healthy. This remains synthetic local proof—not a physical-iPhone,
  genuine HGO, cloud, deployment, render, or publication claim.
- Architecture and operated evidence are in
  `docs/coordination/2026-08-03-durable-edit-review-ledger.md`.

## Audio mastery foundation checkpoint

- Nest can now run a canonical, recoverable `StudioAssetProcessingJob` for one
  immutable local audio/video source, measure complete-source LUFS, true peak,
  and LRA, prepare a source-bound Apple podcast dialogue proposal, create a
  versioned 48 kHz 24-bit PCM preview when needed, and independently measure it
  before registration.
- The Episode editor shows integrated LUFS, dBTP, loudness range, momentary and
  short-term loudness over time, the -16 LUFS target, verified output values,
  playable preview, and explicit source-preserved/unpromoted status. Reloading
  hydrates the canonical result instead of losing it in component state.
- A real signed-in Episode 4 operation imported and mastered a 12-second source:
  -46.6 LUFS became a verified -16.0 LUFS preview while the original remained
  source truth. Database readback retained one completed job and one
  `audio-master-preview` variant.
- Focused proof passes 15/15 plus three strict TypeScript projects and the full
  164-page Nest production build. This is local
  qualification only; cloud mastering, explicit approval/promotion, subjective
  restoration proposals, deployment, and physical-device work remain pending.
- Architecture and evidence are in
  `docs/coordination/2026-08-03-audio-mastery-foundation.md`.

## Client follow-up source-readiness checkpoint

- A private coaching follow-up can no longer be released after one of its
  selected notes, goals, or tasks changes or becomes ineligible. Nest derives
  readiness from the immutable draft manifest and current canonical records;
  release repeats that check inside its serializable transaction.
- Nest and Capture show `Current sources verified` or a source-specific
  `Release held — review current sources` state. A hold disables both recipient
  confirmation and release until the coach saves a new immutable private
  revision.
- Nest and Capture also compare the complete editor and selected-record sets
  with that immutable revision. Unsaved changes show `Save edits before
release`, clear any prior confirmation, and keep release bound to the named
  saved revision instead of silently treating editor text as saved.
- Signed-in rendered Nest operation saved revision 2 with four selected
  records, changed one disposable canonical task, read back the exact held
  reason and disabled controls, then saved revision 3 and restored readiness
  without releasing anything. The local receipt is retained on the external QA
  volume.
- A second rendered Nest operation changed revision 3 without saving, read the
  exact unsaved-editor hold and disabled controls, then reloaded and proved the
  saved title, readiness, and revision were unchanged.
- Focused Nest proof passes 3 suites / 15 tests; the disposable-PostgreSQL
  operation passes 1/1; strict TypeScript and the mobile source contract pass;
  all 1,017 iOS App Store static checks pass; and the compiled iPhone 17 Pro /
  iOS 26.3.1 simulator source-change and unsaved-editor operations pass 2/2
  with permanent screenshot attachments.
- This is local/simulator proof only. No Cloud Build, deployment, production
  write, provider mutation, physical-iPhone/TestFlight action, external
  message, calendar change, delivery, or publication occurred. Architecture
  and evidence are in
  `docs/coordination/2026-08-03-client-follow-up-source-readiness.md`.

## Session review finish-line checkpoint

- Nest and Quipsly Capture now share truthful review completion semantics:
  deferred and decided proposals count as handled, while ready and listen-first
  proposals remain open. Decided remains the narrower accepted/merged/rejected
  count, and deferred proposals stay noncanonical.
- Nest now distinguishes an empty packet (`No candidates`) from a handled queue,
  explains that deferred proposals are excluded from client follow-up and Studio
  handoff, and gives a completed reviewer an explicit route to Outputs.
- Capture mirrors the handled count, accessibility label, noncanonical boundary,
  and a `Done reviewing` return action without creating or releasing anything.
- Actual signed-in local operation built a retained Session packet, deferred its
  source-linked note proposal, read back the no-side-effect receipt, showed 1/1
  handled, and continued to the same Session's Outputs. A 390 x 844 pass had no
  horizontal overflow and no browser console errors.
- Focused Nest proof passes 2 suites / 47 tests; strict TypeScript, the mobile
  source contract, and all 1,015 App Store static checks pass. The compiled
  iPhone 17 Pro / iOS 26.3.1 simulator transcript-review journey passes 1 test
  with 0 failures.
- The successful Xcode bundle is retained on the external QA volume. This is
  local/simulator proof only; no deploy, production write, provider mutation,
  physical-iPhone/TestFlight action, delivery, or publication occurred.
  Architecture and evidence are in
  `docs/coordination/2026-08-03-session-review-finish-line.md`.

## Unified Session candidate review queue checkpoint

- Nest and Quipsly Capture now combine transcript-derived note, goal, and task
  proposals into one source-chronological human review queue instead of three
  distant category sections.
- The queue has active, deferred, decided, and all views; explicit progress and
  listen-first state; deterministic kind-qualified identity; next-candidate
  navigation; and immediate Just decided readback after a server mutation.
- Existing hardened per-candidate endpoints remain the only mutation owners.
  The queue is a projection with no database migration, implicit work, batch
  decision, calendar/message/delivery side effect, Studio edit, or publication.
- The built-in iPhone review preview now shows the same mixed queue with all
  mutations disabled. Operating the compiled app found and fixed an initial
  preview exclusion rather than weakening the acceptance test.
- Nest proof passes 2 suites / 45 tests plus strict TypeScript; the mobile
  source contract and all 1,015 iOS App Store static checks pass; and the
  compiled iPhone 17 Pro / iOS 26.3.1 simulator journey passes its queue,
  candidate-editor, safety-lock, and accessibility operation.
- The successful result is retained on the external QA volume. No Cloud Build,
  deployment, production write, TestFlight/App Store action, provider or
  calendar mutation, invitation, delivery, or publication occurred.
  Architecture and evidence are in
  `docs/coordination/2026-08-03-unified-session-candidate-review-queue.md`.

## Transcript candidate evidence on an existing goal checkpoint

- Nest and Quipsly Capture can now append one playback-reviewed transcript
  goal candidate to one explicitly selected existing goal without creating a
  duplicate goal or changing its definition, state, target, tags, tasks,
  project, or numeric progress.
- The canonical route rechecks Session/project authority, current packet and
  transcript evidence, release/consent gates, complete source-span playback,
  actor ownership, target status, and optimistic target version inside one
  serializable transaction. Exact replay returns the existing receipt.
- Transcript evidence is an immutable, provenance-bearing receipt shown
  separately in Nest Work and Capture Today/Work, with a return action to the
  exact source boundary. Numeric progress receipts are excluded from the
  evidence count.
- A retained compiled iPhone 17 Pro simulator operation preserved an existing
  35% progress receipt, appended exactly one transcript-evidence receipt,
  terminated and relaunched Capture, returned to the exact source, and retained
  one goal with zero tasks, notes, calendar links, outputs, or deliveries.
- Focused proof passes 9 suites / 141 tests; the full Nest run passes 245 suites
  / 1,316 tests; repository Quipsly contracts pass 259/259; the mobile source
  contract passes 126/126; both strict TypeScript projects pass; the generic
  simulator build succeeds; and the App Store static gate passes 1,009/1,009.
- This is local simulator evidence, not physical-iPhone or production proof.
  No Cloud Build, deployment, production database write, TestFlight/App Store
  action, provider mutation, invitation, delivery, or publication occurred.
  Architecture and operated evidence are in
  `docs/coordination/2026-08-03-transcript-candidate-goal-evidence-merge.md`.

## Transcript candidate merge checkpoint

- Nest and Quipsly Capture can now merge one playback-reviewed transcript note
  candidate into one explicitly selected, actor-owned editable Session note.
  The reviewer sees the existing and proposed complete wording, purpose, and
  audience before confirming; the selected note keeps its canonical identity.
- The server rechecks Session/project authority, current packet and transcript
  evidence, release/consent gates, complete source-span playback review, target
  ownership, and optimistic `updatedAt` inside one transaction. The update
  appends one immutable `merged-transcript-candidate` revision containing the
  complete previous and next note snapshots and exact transcript provenance.
- Exact retries return the prior receipt without duplicating the update or
  revision. A different note, content, audience, or stale target version fails
  closed. The operation never creates a task, goal, calendar link, message,
  output, delivery, Studio edit, or publication.
- A retained compiled iPhone 17 Pro simulator operation selected a real
  revision-one fixture note, listened through and confirmed three source
  segments, merged the reviewed candidate, terminated and relaunched Capture,
  read back the same note identity and content, and returned through the note's
  source action to the exact first transcript segment.
- Independent packet/PostgreSQL readback retained two revisions, one editable
  note, zero goals/tasks/calendar links/outputs/deliveries, and an exact replay
  with no duplicate mutation. The create-only receipt and Xcode result bundle
  are retained under `/private/tmp`.
- Focused Nest proof passes 3 suites / 51 tests; full Nest proof passes 244
  suites / 1,309 tests; repository Quipsly contracts pass 258/258; both strict
  TypeScript projects pass; the Capture contract passes; and the App Store
  static gate passes 1,009/1,009.
- This is local simulator evidence, not physical-iPhone or production proof.
  No Cloud Build, deployment, production database write, TestFlight/App Store
  action, provider mutation, delivery, or publication occurred. Architecture
  and operated evidence are in
  `docs/coordination/2026-08-03-transcript-candidate-note-merge.md`.

## Native coaching note candidate review checkpoint

- Quipsly Capture now gives every transcript-derived coaching-note candidate
  four deliberate decisions: accept, edit for later review, defer, or reject.
  Only accept can create one canonical note, and it remains disabled until the
  complete immutable source span has current playback-verification receipts.
- Edit, defer, and reject append actor-scoped review evidence without creating
  a note, task, goal, reminder, calendar event, message, delivery, Studio edit,
  or publication. Exact retries return the prior receipt instead of appending
  duplicate history.
- An edited draft survives an append-only packet rebuild only when the ordered
  segment IDs, provider hashes, and source text still match exactly. Capture
  discloses that carry-forward and requires a fresh final review.
- The compact iPhone editor now has stable bounded accessibility identities,
  correct Transcript-surface scrolling, immediate keyboard dismissal, and a
  dedicated keyboard Done control. Playback confirmation retains the verified
  terminal position long enough to survive the button tap and API mutation.
- A fresh retained Session was operated through the compiled iPhone 17 Pro
  simulator against local Nest. It played and confirmed three source segments,
  rebuilt the packet, saved and re-read an edited noncanonical draft, created
  one canonical note in a separate accept step, created one canonical goal,
  and read the goal from Today.
- Live packet and PostgreSQL readback agree on 3 playback receipts, 1 canonical
  note, 1 canonical goal, 0 tasks, and 0 calendar links. Focused route coverage
  passes 22/22, product contracts pass 257/257, strict TypeScript passes, the
  native build and both focused simulator journeys pass, and the mobile source
  contract passes. No Cloud Build, deployment, TestFlight/App Store action,
  production write, provider mutation, invitation, or delivery occurred.
- Architecture and operated evidence are in
  `docs/coordination/2026-08-03-coaching-note-candidate-review.md`.

## Playback-reviewed transcript speaker attribution checkpoint

- Nest now identifies one provider diarization cluster as a real Session
  participant from protected playback samples without pretending that every
  word in those turns was reviewed. Segment-specific accepted corrections
  remain authoritative above the session-wide mapping; provider segments,
  words, timestamps, and media stay immutable.
- The append-preserving attribution ledger binds complete provider-cluster
  hashes, canonical participant identity plus audit snapshots, exact samples,
  reviewer, recording, and request identity. Serializable packet/cluster
  locks and an in-transaction release-gate recheck fail stale evidence,
  withdrawn consent, changed requests, and racing assignments closed.
- Packet projection independently verifies the complete attribution snapshot,
  records its attribution ID, and makes every prior packet stale without
  upgrading word-review status. Nest creates the mapping; Capture reads the
  same effective speaker and displays the separate-review provenance.
- The rendered retained Episode 4 fixture played protected audio, assigned
  `Speaker` to `Charlie`, repeated idempotently, retained exactly one active
  mapping, held the old packet, and preserved provider/correction/verification
  rows. A separate outsider received 404 without protected markers.
- Focused proof passes 41/41, the full Nest run passes 244 suites / 1,306 tests,
  product contracts pass 257/257, Prisma/local migration and strict repository
  health pass, the iOS Simulator build succeeds, and the optimized 163-page
  Next build passes with the established 8 GB heap. No production migration,
  deployment, TestFlight build, or external side effect occurred.
- Architecture and operated evidence are in
  `docs/coordination/2026-08-03-transcript-speaker-attribution.md`.

## Google Calendar live-change delivery checkpoint

- Each verified Google calendar lane can now explicitly turn live alerts on or
  off while retaining the manual reconciliation control. Renewable watch
  channels use separate lease rows, digest-only channel tokens, exact resource
  identity, arbitrary-precision message ordering, and auditable replay skips.
- The public webhook accepts only an empty, verified notification and creates
  or reuses one durable wake. A recoverable worker delegates to the existing
  identity/etag/status/private-linkage-only reconciliation service; it does not
  import provider event content or mutate Google events.
- The scheduler also queues a deduplicated cursor reconciliation when a live
  collection has been quiet for 24 hours, so a dropped Google notification
  cannot become permanent drift.
- Lease renewal activates a unique replacement before draining/stopping the
  old exact channel. The 15-minute Cloud Scheduler lane uses short-lived
  Google-signed OIDC bound to one service account and Cloud Run audience, with
  no static scheduler bearer secret.
- The additive migration was applied only to loopback PostgreSQL. A real local
  database operation passed activation/full sync, verified notification,
  incremental conflict, exact replay suppression, wrong-token denial, renewal,
  24-hour correctness backstop, disable, and zero-residue cleanup. Focused
  calendar proof passes 7 suites / 34 tests; the full Quipsly run passes 244
  suites / 1,294 tests; product contracts pass 254/254; scheduler contracts
  pass 2/2; strict TypeScript and the optimized 163-page build pass.
- No production migration, Cloud Scheduler job, Google watch channel, OAuth
  grant, Google event, cloud revision, or device mutation occurred. Cloud
  activation/readback remains gated on gcloud reauthentication and is recorded
  in `docs/coordination/2026-08-03-google-calendar-push-delivery.md`.

## Production calendar authoring and Google projection checkpoint

- Calendar now creates and operates canonical episode-production milestones
  with idempotent creation, optimistic lifecycle revisions, append-only
  receipts, exact timezone/window semantics, and project-scoped authorization.
  Calendar delegates to the same milestone service as Episode Room rather than
  owning a second writer.
- Google projection now supports those milestones through the existing explicit
  preview/write/cancel boundary, deterministic IDs, ETags, receipts, and
  conflict review. Sessions and milestones now share one provider-effect
  service, including post-provider verification receipts. Point milestones are
  transparent; explicit reserved windows are opaque. Quipsly authoring never
  implies a provider write.
- A retained QA coach created and started a real labeled milestone through the
  rendered Calendar after the canonical-service consolidation. PostgreSQL
  retained revisions 1 and 2 using the shared Episode Room revision format; a
  real private ICS subscription returned exactly one transparent event in the
  earlier feed proof and was then revoked.
- Focused proof passes 10 suites / 64 tests; broader Calendar proof passes 19
  suites / 106 tests; product contracts pass 245/245; the full Quipsly run
  passes 239 suites / 1,254 tests; strict TypeScript and the optimized 160-page
  build pass. No Google provider write, Cloud Build, deployment, production
  migration, TestFlight action, or device mutation occurred.
- Architecture and operated evidence are in
  `docs/coordination/2026-08-02-production-calendar-authoring-projection.md`.

## Imported-episode collaboration proxy GCS qualification

- Exact committed source `59506e8bcc066006745f818fd3b26c5d53b08ab0`
  extends the existing private media processor with a separate, generation-
  leased imported-episode queue. It does not invent native Capture identities
  or grant the worker database access.
- Nest now owns a crash-replayable GCS transactional outbox and independently
  verifies source/output generations, SHA-256, CRC32C, technical metadata,
  authorization, and original preservation before common serializable proxy
  registration.
- A real two-second GCS fixture passed source/output byte readback, H.264/AAC
  fast-start inspection, create-once replay, and exact all-version cleanup in
  `high-ground-odyssey-media`. The processor bundle and strict TypeScript pass;
  the full Quipsly contract run is 238/238.
- No Cloud Build, Cloud Run Job execution, Nest deploy, or production database
  write occurred. The exact next boundary is a deliberately batched immutable
  processor release, read-only raw-folder IAM readback, deployed fixture, and
  zero-traffic authenticated Nest operation.
- Architecture, real GCS evidence, and the release checklist are in
  `docs/coordination/2026-08-02-episode-collaboration-proxy-gcs-qualification.md`.

## Episode production milestone runway checkpoint

- Episode Room now owns revisioned, typed production milestones with exact
  timezone, optional windows, assignment, dependencies, optimistic concurrency,
  append-only snapshots, and no implicit provider-calendar write.
- Operated the real local High Ground Odyssey Episode 4 Part 2 room: source
  verification gated the dependent rough cut, then both were started and
  completed through the rendered UI. PostgreSQL retained six immutable
  revisions and `externalCalendarMutated=false` throughout.
- Calendar rendered both completed point milestones with the right local times,
  prerequisite context, and exact return links. A real local revocable podcast
  feed returned two transparent ICS events with stable UIDs, one-hour refresh
  hints, and no transcript/manuscript payload.
- Real operation exposed a stale generated-Prisma-client boundary. Local startup
  now generates the client before applying migrations and starting Nest.
- All 41 migrations replay cleanly on an empty disposable database, the
  service-level database operation and zero-diff gate pass, focused proof is
  32/32, lifecycle is 8/8, the full Quipsly run is 228 suites / 1,194 tests,
  strict TypeScript passes, and the optimized 158-page build passes with the
  release 8 GB heap.
- No cloud build, production migration/deploy, Google Calendar write,
  TestFlight action, or physical-iPhone mutation occurred. Full evidence is in
  `docs/coordination/2026-08-02-episode-production-milestone-runway.md`.

## Evidence-backed weekly review checkpoint

Implementation commit: `03a316e1`

- Nest Work and Capture Today now use one deterministic domain projection for
  goals, linked tasks, weekly commitments, Session contribution, blockers, and
  next work. No model decides whether a week was good, and the projection has
  no provider or target-status side effects.
- Focus-block completion records explicit actual minutes separately from the
  planned window. Missing historical or Build 25 time remains visibly unknown;
  the compatibility path never turns a plan into claimed work.
- A retained client recorded 37 minutes through rendered Calendar. Client Nest,
  the signed-in Capture API, and the assigned coach all read the same canonical
  week; independent PostgreSQL readback kept the task `OPEN` and goal `ACTIVE`.
- The operation exposed and fixed an older Work privacy defect: generic room
  participation no longer grants private booking-backed coaching work. The
  unrelated producer denial now passes, while unbooked production-room
  collaboration remains intact.
- Full Nest verification passes 224 suites and 1,174 tests; TypeScript passes;
  the Capture/App Store gate passes 1,007 checks; and the focused iPhone 17 Pro
  simulator journey passes. Production migration/deployment, a new TestFlight
  build, and physical-iPhone proof remain open.
- Architecture, defect evidence, retained-operation boundaries, verification,
  and release order are in
  `docs/coordination/2026-08-02-evidence-backed-weekly-review-operation.md`.

## Cloud cost-control checkpoint

- The supported Nest release paths now reuse an exact committed-source image
  before building, so retries and promotion do not pay for duplicate images.
- Artifact Registry now has active three-day cleanup with a
  keep-ten-per-package rule. Retention-aware proof preserves all five
  traffic-serving digests; 341 versions with 107,894,496,919 summed known bytes
  are eligible for asynchronous cleanup. The prior 45-day rule reduced the
  inventory from 929 to 477 versions but left 103,302.543 MB billable, so it
  did not close the actual storage-cost boundary.
- The cost auditor now covers every Cloud Run service and every
  traffic-serving revision in the region. This fixed a blind spot that had
  omitted the always-warm `studio-collab` service.
- Live `studio-collab` revision `studio-collab-00005-xht` reuses the existing
  image and serves 100% of traffic with zero minimum instances. Readback keeps
  `maxScale=1`, concurrency 80, timeout 3600 seconds, Cloud SQL, service
  account, IAM policy, and `/health` intact. No Cloud Build ran for the change.
- The post-change audit reads four services, 492 revisions, seven protected
  live digests, and zero total minimum instances. The deploy helper defaults to
  zero and a regression test prevents restoration of the former warm default.
- Full evidence and remaining cost decisions are in
  `docs/coordination/2026-08-01-cloud-cost-pipeline-consolidation.md`.

## Calendar bearer-log privacy checkpoint

- The production `_Default` Cloud Logging sink now has one enabled,
  exact-route exclusion for `studio` Cloud Run request logs matching
  `/api/calendar/feeds/<capability>`. It does not broaden the sink filter or
  disable ordinary request observability.
- A live paired probe returned HTTP 200 for an ordinary health route and HTTP
  404 for a synthetic invalid calendar capability. After Google's propagation
  window, Logging contained the ordinary request exactly once and the
  capability-style request zero times.
- Independent readback proves the base `_Default` filter and destination are
  unchanged, `_Required` remains enabled, and the named exclusion matches the
  checked-in release contract exactly.
- The operator now distinguishes an apply request from a real mutation, and
  tests prove it can only add or repair the named exclusion. Read-only
  verification remains mandatory in release preflight.
- Full provider evidence and the remaining rotation boundary are in
  `docs/coordination/2026-08-01-calendar-capability-log-privacy.md`.

## Production account-deletion worker checkpoint

- In-process account-deletion execution no longer belongs to public Nest. Staff
  review remains in Nest, which invokes a dedicated private concurrency-1 Cloud
  Run worker with an identity token and a second shared-secret check. Nest's
  legacy executor is forced false.
- The worker combines Cloud SQL, Firebase Authentication Admin, exact-bucket
  GCS deletion, and Resend access behind one private route. Nest retains the
  database and Firebase permissions its existing authentication/admin features
  require, but its deletion executor stays off. The GCS adapter rejects any
  otherwise-valid object URL outside
  `QUIPSLY_ACCOUNT_DELETION_GCS_BUCKETS`.
- Read-only readiness and explicit-confirmation deployment operators now prove
  exact source image, private service/IAM, dedicated identity, secrets,
  provider roles, concurrency, zero minimum instances, public policy pages,
  and Nest invocation. Neither operator can delete an account.
- Live readback proves both public policy pages are healthy and the public Nest
  executor is off. The dedicated worker, Resend/sender/shared secrets, worker
  IAM, exact-source image, schema readback, and disposable production proof are
  genuinely absent. No cloud or account state changed.
- Focused worker/client/route/allowlist coverage passes 16/16, broader deletion
  coverage passes 24/24, release operator coverage passes 11/11, strict
  TypeScript passes, the release-limit production
  build produces 157 routes including the internal worker, the Capture/App
  Store contract passes 949/949, and the live receipt is redacted mode `0600`.
  Full evidence is in
  `docs/coordination/2026-08-01-account-deletion-worker-boundary.md`.

## Account deletion local operation and isolated email checkpoint

- Recovered the owned local Nest/PostgreSQL/Firebase lifecycle and reran the
  real disposable-account integration. It passed 2/2 while proving actual
  user/Home Nest/Task deletion, collaborator blocking, failed-provider resume,
  receipt replay, deleted-token HTTP 401, and zero-residue cleanup.
- Account deletion now uses dedicated
  `QUIPSLY_ACCOUNT_DELETION_RESEND_API_KEY` and
  `QUIPSLY_ACCOUNT_DELETION_EMAIL_FROM` variables. It cannot silently inherit
  generic site or coaching delivery credentials, validates the sender before
  provider contact, and preserves the immutable Resend idempotency key.
- The planned sender is `Quipsly <account@notify.quipsly.com>` with a
  domain-restricted sending-only key. The subdomain isolates provider records
  from root `quipsly.com` Google Workspace mail.
- The complete Quipsly suite passes 225 suites / 1,182 runnable tests, the local
  deletion operation passes 2/2, focused provider/route tests pass 13/13,
  worker operators pass 7/7, and strict TypeScript passes.
- Resend sign-in, DNS, secrets, image build, worker deploy, IAM, and production
  deletion were intentionally not performed. The App Store gate remains red
  until one disposable production account is independently proven deleted.
  Fresh read-only provider audit at pushed source `f2a06951` confirms both
  public policy pages are HTTP 200 and every undeployed boundary remains
  truthfully red.
  Full evidence is in
  `docs/coordination/2026-08-02-account-deletion-local-operation-and-provider-contract.md`.

## Capture App Store submission-readiness checkpoint

- The credentialed read-only auditor remains bound to exact Build 25 and cannot
  mutate or submit. A separate exact-confirmation operator can configure only
  source-backed content rights, age rating, IDFA, Free pricing, and USA-first
  availability; it cannot upload screenshots, publish App Privacy, change DSA
  identity, create a review submission, submit, or release.
- Live Apple configuration and independent readback now prove the safe listing,
  App Review detail, editable 1.0 version, manual release type, exact Build 25,
  `USES_THIRD_PARTY_CONTENT`, 24/24 age-rating answers, `usesIdfa: false`, an
  active Free/USA price, and a complete 175-territory inventory with only USA
  enabled. Apple reports zero screenshots and no review submission.
- Provider debugging fixed three real API-boundary defects: Apple JWT scope is
  GET-only; compound-create resources require `${local-id}` IDs; and App
  Availability creation/readback requires the full live territory catalog plus
  the v2 200-item relationship endpoint. The expected pre-release
  `CANNOT_SELL` plus `AVAILABLE_FOR_SALE_UNRELEASED_APP` pair is no longer
  misreported as a legal failure.
- Provider checks remain separate from manual App Privacy publication, EU DSA
  trader verification, iPhone-only compatibility cleanup, physical Build 25
  acceptance, and production disposable-account deletion proof. The operator
  cannot turn those human/legal boundaries green by inference.
- Focused configuration/readiness coverage passes 12/12, the complete Apple
  operator suite passes 48/48, and the Capture static gate passes 949/949. The final redacted
  configuration and readiness receipts are mode `0600`; readiness exits 2 only
  for the preserved screenshot, privacy, DSA, physical-device, deletion, and
  compatibility gates. Full evidence is in
  `docs/coordination/2026-08-01-capture-app-store-submission-configuration.md`.
- Final verification exposed 11.98 GiB of repeated temporary screenshot
  `DerivedData`. The evidence assets were preserved, the regenerable trees were
  removed, and successful direct/exact-commit screenshot runs now clean that
  payload automatically while failed runs retain it for diagnosis.

## Source-grounded transcript packet note-lane checkpoint

- Nest now makes every persisted coaching/podcast packet purpose lane directly
  reviewable with approve-for-internal-use, needs-revision, reject, and reopen
  decisions. Review notes and status survive reload on the canonical summary.
- Capture reads the same saved lane projection, targets the canonical
  `callRoomId`, and exposes the bounded decision sheet in the Session recorder.
  Approval creates no canonical note, task, goal, client delivery, message,
  calendar event, Studio mutation, or publication.
- Operating the focused iPhone preview exposed and fixed a SwiftUI
  accessibility-identifier inheritance bug; the card, lane rows, sheet, and
  buttons now retain distinct identities.
- Three focused web/model/server suites pass 46 tests, TypeScript passes, the
  Capture/App Store static gate passes 933 checks, and the operated iPhone 17
  Pro Max simulator journey passes. No Cloud Run revision, TestFlight build, or
  production packet was replaced; eligible released transcript operation still
  waits on the transcript-worker/provider gate.
- Exact implementation and verification evidence are recorded in
  `docs/coordination/2026-08-01-app-store-calendar-transcription-batch.md`.

## Production Capture cross-device project-system checkpoint

- The compiled Build 25 iPhone product created a retained production Project,
  Task, document-kernel Note, active Goal, and one shared canonical Tag through
  the fixed `codex@dev.test` account. Stable IDs are preserved for longitudinal
  use; the Tag has three canonical assignments.
- The fail-closed operator requires the exact production origin, clean source,
  released Build 25 app hash, fixed Keychain identity, unique labels, and
  mode-`0600` evidence. It performed no recording, Session creation, invite,
  calendar action, publication, cleanup, or other external effect.
- The first rendered Nest readback found two genuine React hydration failures
  on focused Work routes. Work timestamps now use deterministic UTC server
  snapshots and localize only after hydration; the full Quipsly suite passes
  195 suites and 989 tests, TypeScript 7 passes, and all 150 production routes
  build.
- Exact release source `f1a403572cd5804a6ffb81a6a6112edf0b8809c2`
  passed exact-context preflight, Cloud Build
  `3154fb52-ef10-4b10-9df0-dd25917e6388`, in-image route inspection,
  zero-traffic generated-reviewer acceptance, promotion, and recovery.
  Revision `studio-00490-hex` now serves 100% from runtime digest
  `sha256:b84bc743747ee9016dec964afa3471c619bb8b2c294f04baa7089ace33670879`.
- Final rendered production readback proved the same Project, Note, Task, Goal,
  and Tag on desktop and phone width with no overflow, browser exceptions,
  server failures, product mutation, or external effect. The failed and fixed
  screenshot sets remain versioned as private evidence.
- Exact records, artifact hashes, release proof, commands, and the remaining
  physical-iPhone boundary are in
  `docs/coordination/2026-08-01-production-capture-cross-device-system.md`.

## Retained production Capture-session checkpoint

- A verified, Keychain-backed synthetic `.test` identity now owns the durable
  production podcast Session
  `QA Retained · Capture Build 25 longitudinal session · 2026-08-01`.
- The exact Session/call-room `cmsa2xxoo001i01s639zmnn5u` is `PLANNED`. Its
  dedicated synthetic participant accepted the current audio/video consent
  presentation with transcription off; fresh readback reports `GRANTED`,
  `canRecordNow=true`, `ready-to-capture`, and `ready-provider`.
- Before/after room diagnostics and one redacted 600-second token preparation
  proved no provider join, recording, media/storage mutation, invitation,
  calendar event, Stripe operation, or publication. The token is ephemeral;
  recordings and transcripts remain zero.
- A read-only rerun authenticated through Firebase and Quipsly's native-session
  boundary, read the Home Nest and ten retained Sessions, selected this exact
  Session by title, and passed participant, consent, lifecycle, and safe-record
  checks without creating a duplicate.
- The live proof now creates missing evidence directories, writes atomically,
  pins expected retained-session identity, and stores receipts as mode `0600`.
  Both live wrappers now default to read-only reuse instead of adding a new
  Session on every proof run; creation requires explicit opt-in.
  Exact evidence and the retained-artifact operating boundary are in
  `docs/coordination/2026-08-01-retained-production-capture-session.md`.
- The operation exposed a contradictory ready-state next action that still
  said consent was required. The server projection now says that joining alone
  does not start recording, and its regression test covers a consented first
  capture.
- Exact source `da2947700ec6ddcc1dcfa379c47133772fcf1ec0` passed 30/30
  Session evidence tests, strict TypeScript and 150 routes twice, Cloud Build
  `9cb2bfa2-819e-43eb-a2e2-8b7ee16e51a4`, in-image bundle inspection,
  zero-traffic retained-Session proof, generated-reviewer acceptance/cleanup,
  promotion, and recovery. Revision `studio-00488-tim` now serves 100% from
  platform digest
  `sha256:fc6b75eea4116c56cfd33f1bec8facabe315f1703a925030940daa2989d16c56`.
- Final production readback shows the same ten Sessions and exact target as
  `GRANTED`, `canRecordNow=true`, `ready-provider`, with the corrected action
  **Joining alone does not start recording** and no failed checks.
- This gives future Capture builds a stable longitudinal test world. Physical
  TestFlight installation, consented audio/video, upload, transcript, timeline,
  and same-ID Studio playback remain separate open boundaries.

## Episode Room editor navigation production checkpoint

- Exact source `811a29db16d1493032b2ccc285438bd5b45854ab` is serving
  100% of production as Cloud Run revision `studio-00486-son` from platform
  digest `sha256:a4b015fb43779799b1159c86073e75a086d1f20ed70f9fb3f90642de3081f9be`.
- The Episode Room now distinguishes **Edit timeline**, **Live cut**, and the
  Shared Watch **Review production timeline** return path instead of hiding the
  production editor behind one ambiguous Edit action.
- Exact-context preflight, strict TypeScript, the optimized 150-route build,
  Cloud Build `2804ad4c-3484-4b8e-816f-0e8a66d9d9f8`, in-image route
  inspection, zero-traffic generated-reviewer acceptance, cleanup, promotion,
  and post-promotion recovery all passed.
- Pushed test-harness commit `17f5d1a44db93b4592a5f2969cd78172612f46bc`
  closes the prior proof gap: every generated reviewer now creates a persisted
  episode and requires the rendered Episode Room to expose the exact timeline
  and live-cut destinations. A fresh production run passed and independently
  removed its generated Firebase and database artifacts.
- Exact evidence and remaining physical-device boundary are in
  `docs/coordination/2026-08-01-episode-room-editor-navigation-release.md`.

## Capture Build 26 public TestFlight checkpoint

- Exact source `283d522058bb036d3d81ae966ebc8939af92e55d` passed all
  54 serialized iPhone and Share Extension journeys plus signed archive/export
  inspection. The 22,376,036-byte IPA has SHA-256
  `ffc30e329e4f872bc384f8f4d02ed88ee098bf8921cd4e1a9f1d1131766264f3`.
- A sealed-candidate upload lane reverified the receipt, UI evidence, bytes,
  digest, signatures, profiles, entitlements, privacy manifest, and packaged
  metadata without repeating tests or rebuilding the artifact.
- Apple processed provider build `0ef2cf7a-43d1-49bb-800f-c08239730b96` as
  `VALID`. Independent readback proves both internal and external
  `IN_BETA_TESTING`, beta review `APPROVED`, membership in the internal and
  public-link rehearsal groups, and no non-exempt encryption.
- The open 100-person public page returns HTTP 200, names Quipsly Capture, and
  exposes the exact Apple handoff at
  `https://testflight.apple.com/join/XwRRcYUm`. Build 26 is the canonical
  installation target; Build 25 remains rollback history.
- The editable App Store 1.0 record now assigns the exact Build 26 provider
  binary. Fresh API readback passes identity, listing, review contact, content
  rights, age rating, IDFA, Free pricing, and USA-only availability without
  submitting the version or mutating manual legal declarations.
- The synthetic reviewer account passed production Firebase sign-in,
  verified-email, native bearer, Home Nest, and capture-session checks. A
  physical TestFlight installation and operated real-iPhone audio/video,
  recovery, upload, playback, alignment, and cross-device readback remain open.
- Exact Build 26 source also regenerated and visually passed all five 1320 x
  2868 App Store screenshot stories. The review exposed and fixed one singular
  archived-tag grammar defect in pushed source `c621af95`; that change is held
  for a later spaced release rather than triggering another immediate upload.
  Screenshot receipts remain submission-ineligible until signed/TestFlight
  physical-device recapture and approval.
  Evidence is in
  `docs/coordination/2026-08-02-capture-build26-public-release.md`.
- A fresh credentialed read-only App Store audit after the deletion-provider
  isolation change is unchanged: Build 26 and all safe metadata remain green;
  screenshots, App Privacy, DSA, physical acceptance, production deletion, and
  compatibility remain the six explicit blockers. No Apple state changed.
- The iPhone-only compatibility audit found a real Xcode default:
  `SUPPORTS_XR_DESIGNED_FOR_IPHONE_IPAD` resolved `YES`. App and Share
  Extension source now set Mac, Mac Catalyst, and XR compatibility `NO`; source
  and signed-artifact gates prove the resolved settings and packaged
  `UIDeviceFamily=[1]`. Apple still reports Build 26 can run on Apple silicon
  Mac, so the separate Mac and Vision store-availability controls remain a
  manual Pricing and Availability opt-out. No new build or provider mutation
  occurred. Exact pushed source `5bdcf472` then passed 54/54 serialized UI
  journeys and signed archive/IPA qualification from a detached worktree. Its
  22,376,642-byte IPA has SHA-256
  `39116abacbdf4083e60f50b66c391bc0498bc496f6c3d6bee34d7ae862e574a1`;
  the receipt records no upload and no physical-device proof. Full evidence is
  in `docs/coordination/2026-08-02-capture-iphone-only-compatibility.md`.

## Capture Build 25 public TestFlight checkpoint

- Exact pushed source `4ef8ddbacbba7949b16607d8dae5454ff28e9082`
  passed the complete detached-source release preflight and two independent
  47/47 serialized iPhone and Share Extension suites with zero failures.
- The upload-bound signed IPA is 21,447,970 bytes at SHA-256
  `ffc296f70a5afbd78b834908eed1d29e4f8d3e750c0e87fa917792c48d082071`.
  Packaged app and extension identity, App Store profiles, entitlements,
  nested signatures, privacy manifest, camera and microphone purpose strings,
  background audio/CallKit modes, and export-compliance metadata all passed.
- App Store Connect accepted provider build
  `bacb25d1-1e0a-40aa-90a3-3e7cd195ee33`. A fresh independent readback reports
  `VALID`, externally `IN_BETA_TESTING`, beta review `APPROVED`, included in
  **Quipsly Capture Rehearsal**, automatic notification enabled, and the
  existing 100-seat public link enabled.
- Anonymous delivery-boundary readback returns HTTP 200 and Apple's title
  **Join the Quipsly Capture beta - TestFlight - Apple** at
  `https://testflight.apple.com/join/XwRRcYUm`. Build 25 is now the canonical
  installation target; Build 24 remains rollback history.
- Build 25 restores visible provider-runtime truth, explicitly distinguishes
  immutable Studio handoff from publishing or source editing, and carries the
  retained tagging/runtime hardening. Complete evidence and the remaining
  physical-device gate are recorded in
  `docs/coordination/2026-08-01-capture-build25-public-release.md`.
- This is exact-source simulator, package, upload, review, group, and public
  page proof. A physical TestFlight install, real iPhone audio/video recording,
  pause/resume, camera switching, process-death recovery, upload, playback,
  timeline alignment, and same-ID Nest/Studio readback remain open.

## Build 22 production and TestFlight release checkpoint

- The guarded production schema lane passed from exact backend source
  `12c97cbdfe8bfd19b74c557f7fba04dd935f5a23`: disposable full-chain
  migration, successful on-demand backup `1785529000879`, migration
  `20260731120000_add_session_outputs_and_delivery_events`, current ledger,
  and zero schema drift.
- The matching Nest revision `studio-00472-wey` passed authenticated
  zero-traffic acceptance before promotion and now serves 100% of production
  from immutable image digest
  `sha256:8d757ae0f6259ba39cbe5adfcde92d475b11f96316d9bbbfb711e60e0b3374c4`.
- Full Capture qualification found and fixed a real Session-creation handoff:
  canonical creation succeeded while the chooser stayed over Record. Both
  creation entry points now land directly on the selected Session's recorder
  without granting consent, joining a call, or starting recording.
- A second qualification exposed nondeterministic viewport occlusion in the
  largest-text rehearsal audit. The test now proves the actual Watch
  preparation control is hittable and ignores clipped-text reports only when
  the reported element frame crosses the known navigation/tab-bar viewport.
  Fully visible clipped text still fails.
- Exact native source `34354101340bca41f31ff576393a6aea841befe3`
  passed all 47 serialized iPhone and Share Extension journeys, signed archive,
  App Store export, privacy, entitlement, provisioning, and nested-signature
  inspection. The upload-bound IPA is 21,287,598 bytes at SHA-256
  `61e00fdd5ef385cebcd44a3ce3aa3e28befbb954bef300025395f3e6ee59ae49`.
- Independent App Store Connect readback identifies Build 1.0 (22) as provider
  build `81160b86-95c7-44b2-8cc9-4c29a7335929`, `VALID`, internally and
  externally `IN_BETA_TESTING`, beta-review `APPROVED`, and included in both
  controlled internal and public rehearsal groups.
- Anonymous readback confirms the open 100-person public page and exact Apple
  handoff at `https://testflight.apple.com/join/XwRRcYUm`. Build 22 is now the
  canonical install target; Build 20 is rollback history.
- Physical TestFlight installation, actual iPhone audio/video capture,
  interruption recovery, upload, playback, and same-ID Nest/Studio readback
  remain separate proof boundaries. Retained QA artifacts remain authorized
  under `docs/runbooks/quipsly-retained-dogfood.md`.

## Retained Work progress operation checkpoint

- Exact source `82c4223e1beb8ce936fa38b27b03ffac1b1d65db` adds a
  loopback-only rendered mutation lane for the fixed retained `.test` media
  operator and its durable Capture-to-Nest goal.
- Real operation exposed two same-titled goals whose current-versus-restored
  identity was unclear. Portable restore copies now have a visible **Restored
  copy** badge, recovery explanation, and distinct accessible heading while
  both histories remain intact.
- The same operation exposed unstable accessible names on the compact progress
  form and nondeterministic database readback across the two identities. The
  controls now have explicit names, canonical readback requires the one
  non-restored goal, and exact latest-note replay is refused.
- Operated the exact committed Work UI and appended one real 25% progress
  receipt. Independent readback proved count 3 to 4, actor/note/percentage and
  embedded/source receipt agreement, zero browser exceptions, clean session
  removal, no secrets/screenshots, no external effects, and preserved QA data.
- Focused Work tests pass 39/39, retained-operation tests pass 3/3,
  cross-surface contracts pass 176/176, TypeScript 7 passes, and the optimized
  150-route Quipsly build succeeds. Exact evidence is in
  `docs/coordination/2026-07-31-retained-work-progress-operation.md`.

## Schema pipeline hardening checkpoint

- Exact source `30264d5cbb8094f175c36fcd7693639648d3810f` replaces the
  contradictory chronological database instructions with one Prisma 7,
  migration-first operator contract. Shared, retained-QA, preview, staging,
  and production databases explicitly prohibit `db push`.
- Added a loopback-only, clean-commit fixture runner that derives one
  source-bound database, refuses reuse or replacement, replays every committed
  migration twice, requires zero schema diff and the transcript schema
  contract, then drops only that exact database after success.
- The committed runner passed against local PostgreSQL: all 33 migrations,
  idempotent replay, zero diff, 15 required transcript columns, 2 cascading
  foreign keys, and 4 indexes. Independent readback confirmed the exact
  fixture database was absent afterward.
- The redacted receipt is mode `0600`, contains no credential fields, and is
  bound to the exact commit. Documentation/helper tests pass 5/5, the complete
  cross-surface contract passes 173/173, and Quipsly TypeScript 7 typechecking
  passes.
- Disposable schema databases remain separate from retained product QA. The
  user explicitly permits durable `.test` identities and clearly labeled QA
  product artifacts for longitudinal operation under
  `docs/runbooks/quipsly-retained-dogfood.md`.
- This is local release-pipeline proof, not a production migration. Google
  Cloud authorization, guarded schema apply, matching zero-traffic Nest
  deployment, production parity, a fresh TestFlight candidate, and physical
  iPhone acceptance remain open. Exact evidence is in
  `docs/coordination/2026-07-31-schema-pipeline-hardening.md`.

## Capture accessibility and held Build 22 checkpoint

- Exact source `10d5ba8d709ec8a6479979d72866212e555bf4f7` hardens
  the shipping Today, Work, Library, Account, Record, consent, rehearsal, and
  transcript-review surfaces for the largest accessibility text size and
  Increase Contrast.
- Work now has an app-owned self-sizing search control, explicit keyboard
  dismissal, adaptive project identity/metrics, and a 44-point shared-tag
  management target. The Account identity card has one human-readable
  assistive-technology projection instead of exposing decorative or raw-email
  elements.
- The exact commit passes all 41 Capture Experience journeys and all 3
  Safari/Share Extension journeys on iPhone 17 Pro / iOS 26.3.1, plus 902/902
  native/App Store checks and 168/168 cross-surface contracts. The retained
  Work journey types and clears a real task query before continuing through
  the shared vocabulary and canonical project records.
- Quipsly Capture 1.0 (22) is a qualified, signed candidate from frozen source
  `8ec38f09cd5842ff67d346c0b8d6c41f557b8081`, but its receipt explicitly says
  no upload was attempted. Fresh Apple readback confirms Build 22 is absent.
  Its 21,141,551-byte IPA has SHA-256
  `2804812646db6caa37dfc7fb8badb7d2134b0047ef0205ac284d12e47c4520c1`.
- Build 22 stays held until the matching Nest schema/backend passes guarded
  deployment and production readback. Current Google Cloud and Firebase
  authorization checks require reauthentication. No physical iPhone is
  visible through USB or CoreDevice, so physical install/capture/recovery and
  same-ID Nest readback remain open.
- Build 20 remains the canonical external target. Fresh App Store Connect and
  anonymous public-link readback confirm it is valid, externally in beta,
  included in the open rehearsal group, and exposes Apple's exact install
  handoff. Exact evidence and loop-back commands are in
  `docs/coordination/2026-07-31-capture-accessibility-build22-hold.md`.

## Capture Build 21 internal checkpoint

- Quipsly Capture 1.0 (21) was built and uploaded from exact detached source
  `0c88e037d48c39797d8c532f3d635dce0b4b5877`.
- Two independent exact-source candidate runs each passed all 46 serialized
  iPhone and Share Extension journeys with zero failures, then passed source,
  privacy, entitlement, provisioning, nested-signature, and exported-IPA
  inspection.
- The upload-bound IPA is 21,141,478 bytes at SHA-256
  `c6531d42e8f22b1a72a1010d556190fb8d2532461abebfd0879d0fe9ff3baf00`.
- Independent App Store Connect readback identifies build
  `9bb30af2-423e-4164-a878-fcb8df00c78c` as `VALID`, internally
  `IN_BETA_TESTING`, included in **Quipsly Capture Internal**, and using no
  non-exempt encryption.
- Build 21 remains externally `READY_FOR_BETA_SUBMISSION` and is not in the
  **Quipsly Capture Rehearsal** public-link group. The read-only external plan
  is ready to update beta notes, enable automatic notification, assign the
  build, and submit it for review only after the matching Nest schema and
  backend pass zero-traffic production acceptance.
- Build 20 remains the approved external/public rehearsal target. Physical
  installation and real-device capture remain separate proof boundaries.
- The complete Build 21 release evidence is preserved outside Git at
  `/Volumes/My Passport/Quipsly Release Evidence/2026-07-31-build21`.
- Retained QA users and artifacts now follow
  `docs/runbooks/quipsly-retained-dogfood.md`, committed at `50c8a9e3`, so
  longitudinal product data is intentionally labeled, isolated, provenance
  bearing, and preserved without leaking credentials or implying external
  effects.

## Episode collaboration release

- Capture now exposes the canonical Episode Room conversation beside Manuscript
  and Watch in an episode-bound recorder session.
- The server derives the thread from a verified parent episode inside the
  authorized Nest. Editors can post, Viewers can read, and outsiders cannot
  disclose an episode or create an invented shadow thread.
- Web and iPhone posts carry stable retry identities. The native app keeps a
  read-only, account-partitioned, file-protected offline copy and clears it on
  account change or signout.
- Retained local and production QA users operated the rendered Episode Room,
  posted clearly labeled durable regression messages, retried one production
  post with the same UUID, and verified exactly one persisted copy.
- The release-target ledger and rehearsal runbook identify approved external
  Build 20. Fresh App Store Connect and anonymous public-link readback confirms
  it is `VALID`, `APPROVED`, externally `IN_BETA_TESTING`, assigned to the
  rehearsal group, and publicly available.
- Focused route and PostgreSQL retry/collision tests, complete Quipsly Jest, TypeScript 7,
  cross-surface contracts, the optimized 150-route build, App Store static
  checks, a native simulator build, and all 46 serialized deterministic iPhone
  and Share Extension journeys pass.
- Exact source `d410e03e14ed723ff4b1f66c50e1c620ab65cb9f` is deployed to
  production and distributed through TestFlight as Build 20. Physical install,
  real-device media, and genuine two-person use remain open. Exact evidence is
  in
  `docs/coordination/2026-07-31-episode-collaboration-readiness.md`.
- The retained local QA account also operated a complete rendered
  Nest → note/tag/task/goal → linked work → progress → Calendar → Today flow.
  Exact IDs, labels, UX observations, and the explicit local-only boundary are
  in
  `docs/coordination/2026-07-31-retained-capture-follow-through-dogfood.md`.

## Quipsly release checkpoint

- `nest.quipsly.com` is serving Cloud Run revision `studio-00470-has` from
  source `d410e03e14ed723ff4b1f66c50e1c620ab65cb9f`, built by Cloud Build
  `1a9872c0-05aa-48ed-81e0-f8aeecd88dea` and pinned to immutable image
  digest
  `sha256:5f2a5b2381ba2523bcfb1c0898873ce1c4e8a1ddbb5757cdf749d71fc7e38fad`.
- Episode Room can project an existing, same-Nest audio or video source from
  the canonical Media Vault into shared Watch without duplicating source
  bytes. Editors can control Watch and explicitly sync receipt-backed watched
  spans to the episode timeline; viewers remain read-only.
- A retained local QA identity has an operated Media Vault to Episode Room to
  Watch to timeline regression journey. The exact release evidence and scope
  boundary are in
  `docs/coordination/2026-07-30-episode-room-media-vault-watch-release.md`.
- Quipsly Capture 1.0 (20) is valid, approved, and externally
  `IN_BETA_TESTING`. It is assigned to the `Quipsly Capture Rehearsal`
  external group and available through the open 100-person public link at
  `https://testflight.apple.com/join/XwRRcYUm`.
- Exact saved Media Vault range playback is implemented and qualified at
  `c05ce5cd`, including distinct Watch/source identity, web and iPhone range
  clamping, shared-clock out-point handling under autoplay denial, and
  non-destructive timeline materialization. The retained local QA journey
  produced a source `4–12` / duration `8` derivative and left its durable test
  history in place.
- The saved-range slice is in production. Build 20 negotiates Watch
  protocol 2 and receives exact saved ranges. Legacy Build 18 keeps
  whole-source behavior and fails a selected range safely closed. The exact
  backend was previewed, reviewed with a generated real account, promoted, and
  read back before Build 19 was archived and uploaded.
- Build 20 passed 46/46 deterministic UI tests from an independent detached
  release worktree, plus distribution-signature, provisioning, privacy,
  entitlement, and IPA inspection. App Store Connect independently reports it
  `VALID`, beta-review `APPROVED`, and externally `IN_BETA_TESTING`.
- Physical TestFlight installation and real two-person camera, microphone,
  call, consent, saved-range Watch, upload, and editor-alignment rehearsal
  remain separate human proof boundaries. The exact evidence is in
  `docs/coordination/2026-07-30-episode-room-saved-range-readiness.md`.

## What The Repo Is Right Now

High Ground Studio is a monorepo with:

- a primary Next.js app in `apps/web`
- a Vite motion playground in `apps/motion-lab`
- a shared motion engine package in `packages/motion-engine`
- a Prisma/Postgres data model for identity, clients, memberships, coaching
  feature grants, and appointments
- a large content tree spanning published MDX, staging content, and raw manuscript/research material

## What Is Real And Working

- Google sign-in is wired through NextAuth in `apps/web/src/auth.ts`.
- App users are persisted in Prisma and merged by primary/alias email in `apps/web/src/lib/server/user-identity.ts`.
- Role-aware gating exists for team/internal access in `apps/web/src/lib/authz.ts` and `apps/web/src/lib/content-access.ts`.
- `/dashboard` renders signed-in client membership, manual coaching feature
  grants, appointment, recent coaching request, and converted appointment data
  from Prisma.
- `/dashboard?intent=coaching` renders the signed-in coaching request form and posts to `submitCoachingRequestAction`.
- `/dashboard` shows recent coaching request status, assigned coach when present, converted appointment summaries, Google Calendar add links for converted appointments, and a pay-what-you-can contribution CTA when `HGO_COACHING_DONATION_URL` and appointment data are present.
- `/team/clients` supports:
  - pre-provisioning client users
  - alias email capture
  - promoting existing users to clients
  - seeding membership plans
  - granting/updating memberships
  - seeding a manual coaching tool catalog
  - enabling, pausing, or disabling client-specific coaching feature grants
    outside subscription tiers
- `/team/coaching-requests` supports:
  - viewing the 50 most recent coaching requests
  - status counts for `NEW`, `CONTACTED`, `SCHEDULED`, `CLOSED`, and `DECLINED`
  - assigning a coach and saving internal notes
  - marking requests contacted, closed, or declined
  - converting eligible requests into appointments
- `/team/appointments` supports:
  - creating appointments
  - updating appointments
  - marking appointments canceled/completed
  - generated Google Calendar event-template links
  - a visible donation-link configured/missing indicator
- `/library` works as a curated index using hand-authored episode/reading metadata from `src/lib/site.ts` and `src/lib/reading.ts`.
- `/coaching` is a stable public front door for coaching offers and sign-in handoff.
- New coaching requests create/confirm the client role and client profile, store a `CoachingRequest`, and attempt a best-effort internal Resend email notification after the database transaction commits.
- Coaching request email notifications go to active users with `OWNER`, `TEAM_SCHEDULER`, or `COACH` roles and do not block the user success redirect if email fails.
- The live `apps/web` Cloud Run service now mounts `DATABASE_URL` from
  `web-cloudsql-database-url`, which targets the `web` database on Cloud SQL
  instance `high-ground-odyssey:us-central1:studio-postgres`. The immediate
  rollback is the previous Cloud SQL-backed revision; the older Neon-backed
  revision remains a deeper rollback anchor while the cutover gains runtime
  history.
- The live `apps/web` Cloud Run service is now reachable at
  `https://app.highgroundodyssey.com`, with Cloud Run managed TLS, the Google
  OAuth callback, and runtime `AUTH_URL` / `HGO_SITE_URL` aligned to that app
  domain. The generated Cloud Run URL remains an operational fallback, not the
  canonical user-facing origin.
- `/updates` is a public build journal for the High Ground Odyssey team and
  friends. It renders the same checked-in progress story data as protected
  `/team/progress`, and future agents can add entries with
  `pnpm progress:story:add`.
- The internal Learning to Lead Story Map can save database-backed Live Story Drafts attached to Story Candidates and Homer source blocks. These drafts are live app state, not canonical manuscript truth.
- The private Studio `/manuscript` desk can save and load manual server
  snapshots through Cloud SQL-backed `StudioManuscriptSnapshot` rows. The
  everyday UI keeps `Save manuscript`, `Copy phone link`, and `Load latest`
  visible in a Save and Share panel, while old snapshot/export/smoke/publish
  machinery is behind Dev Mode. The manuscript filter lens is available from a
  desktop top-bar Filter button and a mobile bottom-bar Filter button. The
  stable private route `/manuscript/live/latest` opens the newest saved server
  snapshot for an authorized Studio user. The browser-local draft remains the
  active working copy unless the user enters the live room; server snapshots are
  cross-device checkpoints and latest-backup anchors, not canonical manuscript
  truth. Chapter and episode boundary markers style their title lines in the
  editor, live room, and read-only live links; chapter labels use the written
  title such as Preface or Introduction instead of forcing `Chapter 1`.
- The private Studio live manuscript room at `/manuscript/collab/latest` is the
  current production-ish co-editing path. It uses a private token-gated
  Hocuspocus/Yjs room backed by Cloud SQL `ydocState`, presence, author and
  semantic marks, structure markers, safe latest-backup handoff links, and
  short-idle auto-save into the latest manuscript backup. Episode structure
  markers derive Wednesday publication dates from manuscript order, anchored on
  Episode 4 publishing June 3, 2026.
- The private Studio `/manuscript` desk now has a Manuscript Library MVP in
  `Backup` mode. A named `StudioManuscript` can group manual snapshots, mark a
  manuscript as `WORKING` or `SYNTHETIC`, and load the latest snapshot for that
  selected manuscript. Existing snapshots without a manuscript id remain
  loadable as legacy/orphan snapshots.
- The private Studio `/manuscript` desk now includes a Publish / handoff mode
  that derives browser-only readiness reports and Markdown exports from the
  existing browser-local draft, structure regions, author marks, cited
  quotations, quote review metadata, and manual snapshot status. These exports
  do not write server files or canonical public content.
- The private Studio `/manuscript` desk now includes a synthetic smoke draft and
  real-manuscript readiness gate. The smoke draft is fake text only and is meant
  to test marks, structure, quotes, quote reviews, manual snapshots,
  phone/second-browser loading, Recording / Reading mode, and Publish exports
  before real manuscript material enters Studio.
- The private Studio `/manuscript` desk now has mobile writing and semantic
  highlighting controls. Phone-width users can mark selected text by author,
  choose and apply semantic tags, mark cited quotations, enter semantic Focus
  View, and return to the manuscript surface without relying on the desktop
  sidebar.
- The private Studio `/manuscript` desk can mark chapter title blocks and
  derive chapter ranges from current manuscript order. The saved draft keeps a
  `chapterTitleBlocks` marker list, while the chapter map treats each title as
  the start of a chapter that continues until the next marked title.
- The current Manuscript Desk improvement roadmap is recorded in
  `docs/plans/studio-manuscript-desk-improvement-roadmap.md`, with competitive
  research in
  `docs/analysis/studio-manuscript-writing-tool-competitive-research.md`. The
  roadmap preserves the long manuscript as the home surface and treats maps,
  semantic lenses, review queues, timelines, source bibles, and exports as
  projections around the same block-aware draft state.
- The private Studio `/manuscript` desk can generate a browser-only HGO episode
  projection JSON draft from synthetic/tagged manuscript metadata in Publish
  mode. The export is a projection draft/staged review draft, not raw
  manuscript draft JSON, not a server publish, not canonical public content,
  and not public-safe until citation/public-safety review is complete.
- Studio now has a local-only synthetic collaboration lab at
  `/manuscript/collaboration-lab`. It uses Yjs in browser/session memory to
  model two manuscript-shaped clients, synthetic block edits, synthetic tags,
  manual sync, snapshot export, and convergence checks. It is not connected to
  production `/manuscript`, does not write localStorage, does not call server
  routes, does not autosave, and does not enable real simultaneous editing.
- Studio has pure collaboration lab validation through
  `pnpm studio:collab:test`, `pnpm studio:collab:checkpoint:test`,
  `pnpm studio:collab:adapter:test`, `pnpm studio:collab:span:test`, and
  `pnpm studio:collab:agentic-smoke`. These use synthetic data only and write
  generated reports under ignored `artifacts/` paths.
- Studio has a local-only collaboration checkpoint bridge. It exports a Yjs lab
  client into `studio-collaboration-checkpoint-v1`, validates safety flags,
  imports the checkpoint into a new synthetic client, and confirms blocks, text,
  tags, empty blocks, and summaries survive. It is not a production manual
  server snapshot and does not touch production `/manuscript` save/load.
- Studio has a synthetic-only collaboration Manuscript adapter bridge. It
  converts `studio-collaboration-checkpoint-v1` into
  `studio-collaboration-manuscript-adapter-v1`, creates a valid synthetic
  `ManuscriptDraft` subset with title, ordered paragraph blocks, block ids,
  text, synthetic author/tag metadata, empty structure regions, and empty quote
  reviews, then converts back into a collaboration checkpoint/client. It is not
  a production Manuscript Desk import, does not call snapshot APIs, does not
  write localStorage, does not autosave, and does not touch manual snapshots.
- Studio collaboration now has synthetic span semantics. The local Yjs lab can
  add addressable synthetic spans over block text, sync them between Charlie and
  Homer clients, carry them through snapshots/checkpoints, and map
  non-overlapping spans into `semanticHighlightMark` ranges in the synthetic
  Manuscript adapter payload. The lab UI now leads with a shared long manuscript
  surface to reinforce that collaboration should happen over one manuscript
  stream, not disconnected cards.
- Studio collaboration now has synthetic local presence and manuscript margin
  awareness in `/manuscript/collaboration-lab`. Presence tracks Charlie and
  Homer active block/span/mode/last action in React state only and renders
  margin cues around the shared manuscript surface. Presence is explicitly not
  durable manuscript content and is excluded from snapshots, checkpoints,
  Manuscript adapter payloads, localStorage, server routes, and production
  manual snapshots.
- Studio collaboration now has synthetic span-anchored review notes in
  `/manuscript/collaboration-lab`. Notes can be authored by Charlie or Homer,
  marked `open`, `addressed`, or `archived`, and shown as margin/side-panel
  context around the shared manuscript surface. For this sprint they are
  React-state-only local annotations: not source text, not presence, not Yjs
  snapshot state, not collaboration checkpoints, not Manuscript adapter payloads,
  not localStorage, not server routes, and not production manual snapshots.
- Studio collaboration now has a synthetic annotation durability decision
  helper and lab UI summary. It compares annotation event log, checkpoint
  metadata, and separate annotation store options, then recommends event-log
  operations plus a separate annotation store for future durable review notes.
  Checkpoint metadata is explicitly not the primary recommended store because
  manual snapshots should remain rollback anchors, not comment warehouses.
- Studio collaboration now has a synthetic annotation event-log lab. It models
  review-note create, edit, and status-change operations, replays them into
  materialized annotation state, and can produce a safe future snapshot
  reference shape. The event log is pure/local only and is excluded from
  snapshots, checkpoints, Manuscript adapter payloads, localStorage, server
  routes, DB/schema, and production manual snapshots.
- Studio collaboration now has a synthetic materialized annotation-state lab.
  It derives current review-note state from the event log, indexes notes by
  span/block/status, and creates a safe annotation-state reference for future
  checkpoint linkage. It is not persistence and is excluded from localStorage,
  server routes, DB/schema, checkpoints, Manuscript adapter payloads, and
  production manual snapshots.
- Studio now has a private Content Management Studio route at
  `/content-studio`. It creates podcast, book, episode-page, monetization, and
  coaching project boards from templates, tracks source/shape/produce/publish/
  follow-through checklists, stores the active working state in browser
  localStorage, exports/imports JSON handoff packets with safety flags,
  generates selected-project production packets, emits valid staged HGO
  projection drafts for podcast and episode-page projects, and can save/load
  explicit server checkpoints through private Prisma-backed
  `StudioContentWorkspaceSnapshot` rows when the Studio database schema is
  applied. It can also save, list, and open individual durable project records
  through private Prisma-backed `StudioContentProject` rows for cross-device
  podcast, book, and episode-page working state. It can also refresh recent
  checkpoint history and load a specific checkpoint as a manual recovery/
  rollback action. These checkpoints and durable project records are manual
  working anchors, not autosave and not canonical publishing state.
  The route does not call provider
  APIs, publish public content, use real manuscript/HGO source material in
  tests, or replace existing HGO/WorldHub/coaching workflows. The broader
  Production packets are browser downloads/review payloads only: they do not
  call provider APIs, publish public pages, or certify public safety. The
  provider-neutral type/sample-data contract lives in
  `packages/content-studio-domain` for future shared packets and persistence.
  The Content Studio HGO handoff copies the full selected production packet into
  `/projection-stage/import` so HGO can extract the staged projection draft
  without losing packet context, and it links to the private HGO publish queue
  after staged artifacts are saved.
- WorldHub now has the first database-backed integration workspace at
  `/team/worldhub`. The page can initialize or refresh provider connection
  records for Stripe, Patreon, Google Calendar, merch storefront, merch
  fulfillment, Google Analytics, Google Search Console, Google AdSense,
  affiliate links, direct sponsors, Resend, and the app-owned cart boundary. It
  checks whether expected env names are present, stores only readiness metadata
  and env names, and shows current app-owned counts for memberships, future
  appointments, unsynced appointment candidates, carts, orders, fulfillment
  jobs, sync jobs, and provider events. New private Prisma models include
  provider connections, provider events, provider sync jobs, catalog items,
  offers, carts, orders, fulfillment jobs, SEO briefs, analytics snapshots, and
  monetization placements. `/team/worldhub` can now queue the next unsynced
  Google Calendar appointment jobs and, when `GOOGLE_CALENDAR_*` credentials
  are configured, create or update Google Calendar events and write
  `Appointment.googleEventId`. Stripe and Patreon webhook endpoints now verify
  provider signatures and store provider-event summaries in the WorldHub event
  inbox. This is still guarded integration plumbing: no checkout session
  creation, no automatic payment reconciliation, no Patreon entitlement
  mutation, no payment-card handling, no public publishing, and no merch
  fulfillment call is active yet.
- WorldHub Growth now has a private `/team/growth` desk for SEO briefs, manual
  analytics snapshots, AdSense/ad slot planning, affiliate/book recommendation
  placements, direct sponsor slots, and monetization research notes. The page
  can seed a starter foundation and a research library covering memberships,
  owned checkout, podcast subscriptions, video monetization, display ads, book
  affiliates, sponsorships, merch, SEO loops, and disclosure rules before
  Google Analytics, Search Console, AdSense, or affiliate-provider accounts are
  connected. The root web layout can load a Google Analytics tag from
  `HGO_GA_MEASUREMENT_ID`, can load AdSense Auto ads only when
  `GOOGLE_ADSENSE_CLIENT` and `HGO_ADSENSE_AUTO_ADS_ENABLED=1` are present,
  and serves `/ads.txt` from configured AdSense env values. Affiliate
  placements carry disclosure text in the private ledger; public affiliate
  publishing is still a later reviewed step.
- HGO has a browser-only `/projection-preview/import` route that accepts pasted
  projection JSON, validates lifecycle/visibility/citation state, and renders it
  with the same projection preview component without persisting or publishing it.
  It warns when Studio browser bridge drafts include pull quotes, staged
  status/visibility, unresolved citation state, or live/public state.
- HGO has a synthetic-only staged projection surface at `/projection-stage` and
  `/projection-stage/[slug]`. It uses the same projection renderer and a
  fixture-backed repository to show staged review/readiness architecture without
  replacing public `/episodes`, persisting projection artifacts, or using real
  HGO/manuscript content.
- HGO has a synthetic-only staged review gate at `/projection-stage/review`.
  It groups projection fixtures into blocked, needs-review, and live-safe
  states using pure promotion-readiness helpers. It makes blockers and warnings
  visible but does not offer a real publish action.
- HGO has a browser-first staged import review route at
  `/projection-stage/import`. It accepts pasted Studio/HGO projection JSON in
  browser state, can load copied JSON from the clipboard, validates it, runs
  the staged review gate against it, and renders it through the shared
  projection renderer with staged links. It also accepts full Content Studio
  production packets and extracts `hgoProjectionDraft` after packet safety
  checks. It can create a browser-created downloadable staged artifact JSON
  review packet containing the projection, validation warnings, review gate, and
  explicit `persisted: false` / `published: false` safety flags. Signed-in team
  operators can explicitly save that artifact to the private staged artifact
  store; anonymous visitors still only get browser review. It does not publish,
  replace public `/episodes`, or use real content in tests.
- HGO has a browser-only staged artifact inspection route at
  `/projection-stage/artifact`. It accepts pasted or clipboard-loaded
  `hgo-staged-artifact-v1` JSON, validates the artifact contract, validates the
  embedded projection, checks embedded review-gate id/slug/title/status/
  visibility identity, shows safety flags, and renders the embedded projection.
  It does not persist, publish, write local storage, verify public safety,
  replace public `/episodes`, or use real content.
- HGO has a browser-session staged artifact Store Lab at
  `/projection-stage/store-lab`. It imports validated `hgo-staged-artifact-v1`
  JSON into React state only, models future private-store lifecycle behavior,
  shows review status, promotion readiness, archive behavior, event logs, and a
  simulated promotion-candidate boundary. It does not persist, write
  localStorage/sessionStorage, call a server route, publish, replace
  `/episodes`, or use real content.
- HGO now has a private staged artifact store slice:
  - Prisma model: `HgoStagedProjectionArtifact`
  - API route: `/api/hgo/staged-artifacts`
  - team route: `/team/hgo-staged-artifacts`
    The API is team-gated, saves only validated `hgo-staged-artifact-v1` review
    packets, preserves embedded artifact JSON with `persisted: false` and
    `published: false`, stores server persistence metadata outside the artifact,
    and does not publish public pages. The team route exposes copy/download/open
    handoff controls for saved artifact JSON and derived private episode-page
    publish-candidate packets.
- HGO now has a private episode publish queue at `/team/hgo-publish-queue`.
  It derives `hgo-episode-publish-candidate-v1` packets from saved staged
  artifacts, groups them into ready/not-ready/archived review lanes, and keeps
  proposed routes, blockers, warnings, required human review steps, handoff
  packets, and rollback posture together. Each saved artifact also has a
  private `/team/hgo-publish-queue/[recordId]` review detail page that derives
  an `hgo-episode-publish-review-brief-v1` packet with proposed file targets,
  validation commands, safety flags, and future rollback notes. The detail page
  also derives an `hgo-episode-publish-draft-v1` packet with proposed
  frontmatter, a private MDX draft body, and copy/download controls for the
  packet, MDX draft, and frontmatter export. Its
  private `/team/hgo-publish-queue/[recordId]/preview` route renders the saved
  staged artifact through the shared HGO projection renderer before any public
  route work begins. It does not create public routes, mutate content files,
  publish pages, certify citation/public-safety review, mutate stored
  artifacts, or call providers.
- HGO private publish review can now save a durable DB-backed publish intent.
  The `/team/hgo-publish-queue/[recordId]` detail page exposes an explicit
  `Save Publish Intent` action for ready packets. That action creates one
  `HgoEpisodePublishCandidate` row linked to the saved staged artifact and
  stores the candidate packet, review brief, draft packet, frontmatter, and MDX
  draft as private review data. It is additive persistence only: it does not
  create public routes, write content files, replace `/episodes`, call
  providers, or mark the page live.
- HGO also has a private `/team/hgo-publish-draft-lab` route for portable
  `hgo-episode-publish-draft-v1` packets. A team operator can paste a packet,
  validate the private-review boundary, inspect the generated MDX draft, and
  copy/download frontmatter without touching public content or the database.
- HGO has a pure staged artifact contract test command,
  `pnpm hgo:artifact:test`, covering synthetic artifact creation, parser and
  validator state, invalid version, persisted/published safety failures,
  missing projection, review-gate mismatches, credential-marker rejection, safe
  file naming, and summary fields.
- HGO has a pure staged artifact Store Lab test command,
  `pnpm hgo:store-lab:test`, covering session-only import, invalid artifact
  rejection, persisted/published rejection, duplicate active artifact behavior,
  review status updates, simulated promotion-candidate gating, archive behavior,
  summary counts, lookup, and status grouping.
- HGO has a private staged artifact store plan in
  `docs/architecture/hgo-private-staged-artifact-store-plan.md`. The first
  additive model/API slice now exists, while public promotion, deletion,
  provider calls, live `/episodes` replacement, and real content workflows are
  still deferred.
- The repo now has an agentic Studio/HGO smoke command,
  `pnpm studio:hgo:agentic-smoke`, that uses synthetic data only to exercise
  Studio manuscript helper payloads, HGO projection generation, HGO validation,
  and machine-readable report output. It is API/helper-level for now because
  authenticated browser automation needs a safe test-auth or private storage
  state path.
- The repo also has an operator-assisted browser smoke command,
  `pnpm studio:hgo:browser-smoke`. It requires a private Playwright storage
  state at `artifacts/auth/studio-storage-state.json`; if that file is missing,
  it writes a machine-readable `blocked` report without opening a browser or
  performing server writes. When valid auth state is supplied, it may create
  synthetic-only Studio manuscript/snapshot records and then preview the HGO
  projection import.
- HGO has a no-auth browser smoke command,
  `pnpm hgo:projection:browser-smoke`, for the projection import/render path.
  It uses synthetic HGO projection JSON only, opens `/projection-preview/import`,
  confirms validation warnings and the shared renderer, checks
  `/projection-stage`, `/projection-stage/review`, `/projection-stage/import`,
  `/projection-stage/artifact`, `/projection-stage/store-lab`, and a staged
  detail route, verifies known real-content markers are absent, writes a
  machine-readable report, and performs no server writes. If `HGO_BASE_URL` is
  not set, it starts the web app locally on an available test port and shuts it
  down after the run.
- HGO also has a no-auth visual smoke command,
  `pnpm hgo:projection:visual-smoke`, for synthetic screenshot artifacts. It
  visits the projection preview map, import route, rendered import state, and
  synthetic projection detail routes, including Store Lab empty, imported,
  reviewed, and archived states, writes a route-matrix report, captures screenshots
  under `artifacts/playwright/hgo-projection-visual-smoke/`, checks known
  real-content markers are absent, and performs no server writes.

## Current Coaching Workflow

- `/coaching` is the public coaching front door. Its `Book a Session` calls to action send signed-in users to `/dashboard?intent=coaching` and anonymous users through sign-in with that dashboard intent as the callback.
- `/dashboard?intent=coaching` is the active signed-in intake surface. The form captures preferred contact method, optional phone, optional note, and an SMS consent notice if the user selects text follow-up.
- Submitting a coaching request writes Prisma state first, then attempts internal email notification. The primary user path succeeds even if the email attempt returns a structured failure.
- `/dashboard` shows the latest coaching request plus recent older requests. Converted requests show appointment summaries and Google Calendar links.
- `/team/coaching-requests` is the internal request queue and appointment conversion screen. Conversion creates an `Appointment`, marks the request `SCHEDULED`, assigns the coach, links `convertedAppointmentId`, appends internal scheduling notes, and revalidates `/team/coaching-requests`, `/team/appointments`, and `/dashboard`.
- `/team/appointments` remains the general internal appointment scheduling and editing screen. It can create appointments directly or manage appointments produced from coaching request conversion.
- Donation support is currently an external pay-what-you-can link controlled by `HGO_COACHING_DONATION_URL`.
- Google Calendar support still keeps link-generation through `buildGoogleCalendarEventUrl()` as the customer-facing fallback. The internal `/team/worldhub` page can now queue sync jobs and create/update Google Calendar events when dedicated `GOOGLE_CALENDAR_*` server credentials are configured. Appointment cancellation sync is not active yet.
- SMS/Twilio sending is not wired into the current coaching request flow. A server-only Twilio helper exists, but there are no active call sites from coaching actions.

## What Is Intentionally Not Finished

- Stripe checkout is not active.
- Stripe webhook event intake is active at `/api/worldhub/webhooks/stripe`, but Stripe checkout and payment reconciliation are not active.
- Full Stripe Checkout is not active for coaching. The current donation path is an external link, typically a Stripe Payment Link, not app-owned checkout/session/webhook state.
- The floating cart UI exists in layout, but checkout is placeholder-only client
  code in `src/components/cart/Cart.tsx`. WorldHub now has app-owned cart/order
  tables and provider readiness metadata, but no active checkout creation or
  payment reconciliation path yet.
- The episodes route is not on a fully settled content-loading architecture yet.
- SMS/Twilio notification delivery is not active.
- Google Calendar API synchronization is operator-triggered only from
  `/team/worldhub`. It can create or update events for eligible appointments
  when dedicated calendar credentials are configured, but automatic sync from
  appointment create/update/cancel actions is not active.
- Patreon webhook event intake is active at
  `/api/worldhub/webhooks/patreon`, but Patreon member/tier reconciliation and
  entitlement mutation are not active.
- Email notification delivery has no retry queue or persisted delivery status.
- Story Draft promotion into real `ManuscriptBlock` truth is not active.
- Story Draft revision history is not active.
- Studio Manuscript browser-local autosave in the classic `/manuscript` desk is
  not active.
- Studio Manuscript production simultaneous editing is active as an MVP in
  `/manuscript/collab/latest`, backed by the separate `studio-collab` Cloud Run
  service and a single warm instance. It is still intentionally simple: one
  shared latest room, manual/latest-backup recovery controls, and no general
  room list yet.
- Studio collaboration checkpoint lab payloads remain synthetic-only, but the
  live room now writes real latest manuscript backups through the authenticated
  checkpoint API.
- Studio collaboration Manuscript adapter payloads are synthetic bridge payloads
  only. They are not production imports, server snapshots, autosave state, or a
  collaboration-enabled replacement for `/manuscript`.
- Studio collaboration span semantics are synthetic text-offset lab semantics.
  They are not production comments, not real source spans, not DOM selections,
  and not wired to production `/manuscript`.
- Studio collaboration presence is local lab awareness only. It is not
  provider-backed, not persisted, not checkpointed, not stored in localStorage,
  and not wired to production `/manuscript`.
- Studio collaboration review notes are local lab annotations only. They are
  not source text, not persisted, not checkpointed, not stored in localStorage,
  and not wired to production `/manuscript`. A future production implementation
  should use annotation events plus a separate annotation store rather than
  checkpoint metadata as the primary durable comment store.
- Studio collaboration annotation event logs are also local lab contracts only.
  They prove operation replay and version references, but they are not persisted
  and are not embedded in production manual snapshots.
- Studio materialized annotation state is a local replay view only. It proves
  current-state indexing/query behavior, not durable storage.
- Content Studio keeps browser-local state as the fast working surface, and now
  has manual Prisma-backed durable project records for cross-device project
  save/list/load. It is not autosave, collaboration, a public publishing queue,
  or a provider integration.
- Studio Manuscript Library deletion, destructive cleanup, ownership transfer,
  and automatic orphan-snapshot migration are not active.
- Studio Manuscript publishing exports are working handoff artifacts, not a
  canonical publishing database or public projection pipeline.
- Studio Manuscript synthetic readiness checks are browser-local safety
  guidance. They do not write canonical content and do not replace the manual
  judgment required for the first real manuscript import.
- The Studio-to-HGO projection bridge is still manual, but no longer purely
  browser-only: Content Studio production packets can be reviewed in HGO, and
  team operators can explicitly save generated staged artifacts to a private
  server-side store. It does not create a live publish API, public deployment
  pipeline, autosave, collaboration layer, or public `/episodes` replacement.
- The HGO staged projection surface is synthetic-only. It is a review-stage
  architecture prototype, not a public publishing system or real staged content
  store.
- The HGO staged review gate is also synthetic-only. It prepares future
  staged-to-live promotion checks but does not publish, persist, or approve
  anything.
- The HGO staged import review route is browser-first and explicit-save only.
  Pasted or clipboard-loaded JSON is not autosaved, but team operators can save
  generated staged artifacts through the private API after validation. This
  writes Prisma review metadata and immutable artifact JSON, not public content.
- The HGO staged artifact inspection route is also no-persistence. It validates
  browser-created artifact JSON and renders embedded projection state, but it
  does not save, approve, publish, or verify real public-safety status.
- The HGO staged artifact Store Lab is session-only. It models private-store
  lifecycle state without writing localStorage, server state, Prisma rows,
  content files, or public routes.
- The private HGO staged artifact store is additive and team-gated. It does not
  publish, approve, delete, replace `/episodes`, or verify real public-safety
  status. Saved artifacts can be copied, downloaded, reopened in the artifact
  inspector, or turned into private publish-candidate handoff packets without
  mutating public content.
- Agentic Studio/HGO browser smoke does not automate Google OAuth and has no
  committed auth state. Operators must create private storage state locally
  before a full browser run. Missing auth state is a `blocked` result, not a
  product failure.
- The HGO no-auth browser smoke does not exercise Studio auth, manuscript
  library, or snapshot UI. It covers HGO projection import, staged review gate,
  staged projection routes, and rendering.
- The HGO no-auth visual smoke is a screenshot/report artifact pass for later
  human review. It does not exercise Studio auth, manuscript library, snapshot
  UI, real publishing, or real content.

## Current Stabilization Decisions

### 2026-08-01 production tag-taxonomy acceptance

- The canonical project-scoped tag model has now been operated against
  production through rendered Nest using the fixed retained `.test` account.
- The same retained Build 25 Project, Task, document-kernel Note, Goal, and Tag
  survived create-and-assign, rename with former-name lookup, merge preview,
  exact rollback, and final re-merge with stable identities.
- The canonical retained Tag still has exact Task/Note/Goal usage count three;
  the test source remains an archived redirect, and both historical names
  resolve to the canonical target.
- Evidence and boundary details are recorded in
  `docs/coordination/2026-08-01-production-tag-taxonomy.md`.
- Phone-width evidence exposed a long-label control that wrapped into an
  oversized pill. The local repair keeps visible `Manage` / `Close` text and
  preserves the full accessible label. It is queued for the next batched Nest
  release rather than triggering a one-change Cloud Build.

### 2026-08-03 source-bound automated edit proposals

- The Episode editor's AI suggestion route now returns proposal sets bound to
  exact project, episode, timeline SHA-256, transcript SHA-256, block count, and
  transcript time bounds after canonical write authorization.
- Every proposal names an exact source range, transcript evidence hash,
  rationale, and confidence. The browser re-hashes current state before either
  proof-watch or apply and rejects stale sets.
- Proof-watch switches to untouched source playback with surrounding context.
  Apply changes only the editable timeline, one proposal at a time; it does not
  save, render, promote, publish, or change source bytes.
- Persisted proposal history, deterministic silence/retake/speaker candidates,
  a real provider run, an assembled auto-cut, and physical-device proof remain
  open. See `docs/architecture/source-bound-automated-edit-proposals.md`.

### 2026-08-03 deterministic edit evidence

- The Episode editor now offers local deterministic analysis separately from
  disclosed provider analysis. It recognizes narrow explicit restart language,
  recording retake markers, adjacent repeated openings, and bounded transcript
  timing gaps using stable exact-source identities and evidence hashes.
- Only explicit restart language produces a reversible exact-block proposal.
  Markers and repetition remain listen-only. Timing gaps explicitly say they
  are not confirmed silence and require decoded signal evidence before a cut
  proposal can exist.
- The same stale-binding and untouched-source proof-watch/listen contract covers
  local and provider results. No analysis autosaves, renders, promotes,
  publishes, or changes source bytes.
- A dedicated database-backed High Ground QA episode was operated in the local
  editor: one restart proposal and three listen-only candidates rendered,
  timing evidence entered Proof-listen, the restart proposal was applied, and
  Undo restored the source block. The pass also repaired a stale post-Undo
  status banner. Because the fixture has no attached media, decoded waveform
  corroboration, overlap and speaker timing, persisted review receipts, real
  HGO-media playback, and assembled draft edits remain open.

### 2026-08-03 signal and speaker edit evidence

- Deterministic edit analysis now resolves one canonical verified, SHA-bound,
  currently released Capture signal profile server-side. Held, unavailable, and
  multi-source ambiguous states fail closed instead of guessing a waveform.
- Transcript gaps differentiate measured low energy from signal-present
  possible missing words. Both remain listen/review evidence; no range edit is
  silently created. Signal identity and exact measurement are carried with the
  candidate, and RMS is explicitly not LUFS.
- Speaker labels survive episode hydration and canonical hashing. Overlap and
  speaker transitions create separate listening and camera-review candidates,
  never inferred camera switches.
- An isolated synthetic HGO QA source operated the real consent/release gate,
  decoded coverage display, speaker display, proof-listen, apply, and Undo. It
  exposed and repaired a transcript-only duration bug that capped audio-first
  proof ranges at one second. This is not physical-iPhone or genuine HGO-media
  proof; those gates remain open.

- The earlier Stripe checkout attempt was rolled back to a non-broken state.
- The episodes route currently uses a guarded loader in `apps/web/src/lib/source.ts`.
- The Fumadocs source is only enabled when `ENABLE_EPISODES_FUMADOCS=1`.
- That guard is temporary and reversible.

## Build Reality

Recently verified in local Codex sessions:

- `pnpm --filter web build` passes.
- `pnpm --filter web exec next build --webpack` passes in the current environment.
- `pnpm --filter web exec tsc --noEmit` passed during the 2026-05-07 coaching current-state sync.
- `pnpm --filter web exec next build --webpack` passed during the 2026-05-07 coaching current-state sync.

Session evidence:

- `docs/sessions/episodes-loader-guard-result.md`

Interpretation:

- both production build paths are currently green
- the older Turbopack/PostCSS failure described in session notes is now historical stabilization context, not the current repo state

## Content Reality

- `apps/web/content/publish` is the current published MDX surface and the only content directory explicitly wired into `apps/web/source.config.ts`.
- `apps/web/content/_staging` is a structured working/staging area and is not currently consumed directly by the live app code.
- `apps/web/content/_inbox` contains raw source material and research, not just ready-to-publish content, and is not part of the live content source path.
- `/library` and other curated discovery surfaces currently depend on hand-maintained metadata in `src/lib/site.ts` and `src/lib/reading.ts`, not dynamic enumeration of the content tree.

## Known Repo Friction

- The durable docs layer is new and should be kept current as repo memory evolves.
- Published MDX page source and curated discovery metadata are split across different files and must currently be kept aligned by convention.
- There are backup/scratch artifacts in the repo, including:
  - `apps/web/src/app/schedule/page.backup.tsx`
  - `pnpm-workspace.yaml.save`
  - `prisma.config.ts.bak`
  - many `.DS_Store` files

These should be treated as cleanup candidates later, not as authoritative product code.

### 2026-08-03 transcript provider evidence ledger

- Human-approved accuracy windows now accept separate, append-only provider
  attempts without changing the canonical transcript or approved reference.
- The ledger freezes policy, source/reference, provider/model/adapter/config,
  raw-response, normalized evidence, latency, cost, outcome, and server-computed
  WER/speaker/timing metrics. Human correction effort is a later receipt.
- The Session desk exposes privacy-safe scorecards and explicit unavailable
  capability states. Raw transcript/reference/provider content remains behind a
  protected authenticated runner export.
- A crash-recoverable runner now supports Deepgram batch and OpenAI diarized
  transcription, verifies source SHA-256, writes create-once private provider
  receipts before Nest append, and resumes idempotently.
- Local schema is 51 migrations current. Genuine podcast/coaching corpus runs,
  scoped provider credentials/policy receipts, and physical-device Apple
  evaluation remain open. See
  `docs/coordination/2026-08-03-transcript-provider-evidence-ledger.md`.

### 2026-08-04 Studio-source automated edit evidence

- Automated edit evidence now uses a unified v2 media identity for both
  Capture recordings and canonical Studio media. The selected editor-spine
  asset is passed explicitly; absent a selection, multiple released sources
  fail ambiguous instead of guessing waveform ownership.
- Studio evidence is admitted only after the server parses a completed
  complete-decode signal receipt and rechecks current source SHA-256,
  generation, size, attachment, source coordinates, and protected playback.
- Measured clipping, dropout, near-digital-silence, and stereo-imbalance
  observations become listen-only `signal-attention` candidates. They do not
  authorize a repair or cut. Audio mastering remains a separate downstream
  delivery decision and is not fed back into source-edit truth.
- A genuine High Ground Odyssey Episode 8 “Be Curious” operation bound 84
  canonical transcript segments / 597 timed words to 172 displayed waveform
  points, served protected video with HTTP 206, and retained 19 review
  candidates with zero invented cut proposals. Signed-out was 401, an
  ungranted account was 403, and source, episode production, and timeline were
  unchanged. See
  `docs/coordination/quipsly-studio-source-automated-edit-evidence-2026-08-04.md`.

### 2026-08-04 persistent browser collaboration dock

- Browser calling is no longer owned by the Session `Live` mode or an Episode
  Room card. One authenticated app-shell dock keeps the actual LiveKit room,
  external mic/camera/output selection, remote media, retained-source controls,
  and take-specific durable thread mounted while the active Quipsly tool
  changes.
- Minimize is presentation-only. Connected close and cross-Session switching
  require explicit inline decisions; Escape minimizes. Podcast and coaching
  calls expose purpose-aware routes to Episode Room or Coaching Engagement plus
  Session overview, transcript, notes, and reviewed goals/tasks.
- Canonical Episode Watch writes remain in the Episode Room store. A validated
  local bridge lets the persistent call publish and receive only accepted
  receipt hints, after which clients re-read durable room state.
- Current verification covers TypeScript and focused lifecycle, Session,
  Episode, LiveKit-component, and Watch-contract tests. Physical browser/iPhone
  cross-device operation is the next acceptance boundary, not a completed
  claim.

### 2026-08-04 native exact-call collaboration

- Quipsly Capture now presents two intentional podcast collaboration scopes:
  the exact `session:<callRoomId>` conversation for device, consent, take, and
  source-handoff coordination, and the durable `episode:<episodeSlug>`
  conversation for writing through publishing.
- Both scopes use the canonical Nest chat route, exact returned-thread
  validation, idempotent message identity, account-partitioned complete-file-
  protection caches, bounded post-persistence LiveKit hints, and polling as the
  reconnect fallback. They do not start recording or promote chat into notes,
  goals, tasks, or edits.
- The native Session thread is available for any project-bound Capture Session;
  an Episode relationship is not required. Coaching Engagement chat remains a
  browser/Nest surface. Real browser/iPhone operation remains the acceptance
  boundary rather than an inferred claim.

### 2026-08-04 capture audio transparency

- Browser call preflight now reports frame RMS, sample peak/hold, clipped-sample
  observations, sample rate, channel count, and browser processing in physical
  units. It explicitly does not call those values LUFS, true peak, or retained-
  source proof.
- Browser retained recordings prefer a versioned AudioWorklet render-quantum
  aggregate and persist its method, channel/sample coverage, sequence gaps, and
  bounded capture-time summary in the exact source profile before upload
  reservation. A named animation-frame fallback remains available. Both freeze
  false claims for complete decode, integrated loudness, and true peak so later
  verified analysis remains authoritative.
- iPhone Capture exposes recorder average and peak power in dBFS with an
  accessible signal state. The opaque normalized percentage was removed.
- Physical MV7i/browser and iPhone capture, listening, and comparison against
  complete-decode evidence remain required. See
  `docs/coordination/2026-08-04-capture-audio-transparency.md`.

### 2026-08-04 Episode 9 hybrid rehearsal

- The real Episode 9 Room now uses the exact eight-block `The Swear Jar`
  manuscript snapshot rather than the broad canonical manuscript. A mistaken
  source-research rehearsal was retained under a separate explicit slug instead
  of being deleted or silently reused.
- Media import no longer rewrites an existing Episode Room's working manuscript,
  boundary, or human title from Nest defaults. Production Room projections now
  mirror the canonical Episode production instead.
- `Ted Lasso Be Curious.mp4` was preserved as an immutable original, processed
  into a 254.63-second H.264/AAC collaboration proxy, attached to Shared Watch,
  played and paused against a rehearsal clock, and projected as one current
  receipt-backed editor span. Null duration sentinels and stale imported Vault
  metadata can no longer collapse a valid source to zero seconds.
- A canonical podcast Session is linked to the Episode Room. A rendered retained
  test operator joined its actual local LiveKit room with fake media hardware;
  the UI reported one participant, no hidden recording, durable local-source
  readiness, and MV7i/headphone routing guidance. The 172-route production web
  build, 306 runnable Nest suites / 1,600 tests, LiveKit-linked Capture simulator
  build, and focused iPhone audio-evidence UI test pass.
- Recommended operation is one call-audio owner per person: Charlie's Mac uses
  the MV7i plus headphones, Scott's laptop owns his call and Shared Watch, and
  Scott's iPhone records silent local 4K segments in the same capture group.
  Insta360, DJI, and Canon sources remain independent preserved backups or
  masters. See
  `docs/operations/2026-08-04-episode-9-hybrid-recording-runbook.md`.

### 2026-08-05 bounded Capture UI qualification

- The former one-process Capture UI gate had reached 63 deterministic journeys
  and about one hour. Its latest run passed 61; both late failures passed alone,
  initially making accumulated shared-simulator state plausible. The first
  clean-install sharded run then reproduced a different coaching follow-up
  stall. A process sample showed the app main thread cycling through
  SwiftUI/AttributeGraph layout after dismissing the keyboard from a vertically
  growing multiline title field inside the recorder's lazy layout. The title
  is semantically single-line; replacing it with a single-line field removed
  the layout cycle without weakening the journey.
- A source-parsing planner now defines an explicit 11-journey critical lane and
  four complete weighted shards. Contract tests prove all 63 non-screenshot
  journeys occur exactly once in complete qualification and keep critical
  crash, consent, recording, clip-watch, audio, accessibility, login, support,
  and share-extension boundaries explicit.
- Pull requests run the critical lane. Manual CI can deliberately run the full
  four-runner matrix. Committed-source release qualification still runs the
  entire suite locally as four separate serial processes, reinstalls the app at
  every shard boundary, and seals a source-bound aggregate evidence manifest
  before archive/export. Manifest reuse re-reads each native result and requires
  the exact source-derived selector set and pass counts.
- The final corrected critical run passed 11/11 on an iPhone 17 Pro simulator
  with iOS 26.3.1 in 258 seconds of Fastlane execution. The app-container
  reinstall and manifest self-verification both completed. The corrected full
  run then passed 63/63 across four clean-install shards with zero failures,
  skips, or expected failures. Its worktree-labeled manifest records native shard
  summaries of 15/15, 15/15, 16/16, and 17/17 and exactly matches the 63 methods
  discovered from current source. The exact formerly stalled follow-up journey
  passed both alone and inside shard two; the neighboring canonical-source-
  change journey passed alone and inside shard three. This improves iteration
  confidence but does not replace physical TestFlight install, capture, upload,
  playback, or cross-device acceptance. See
  `docs/coordination/2026-08-05-capture-ui-test-lanes.md`.

### 2026-08-05 capability expansion research

- The current product thesis is evidence-connected work memory, not a sidebar
  containing small independent copies of Riverside, Descript, Notion, Teams,
  Trello, Canvas, Scrivener, Canva, Hootsuite, and StudioBinder.
- Market and architecture research prioritizes the trustworthy Session-to-
  Outcome spine, Audio Mastery, Transcript Truth, source-linked rough cuts,
  coaching continuity, and a citation-first research workbench before broader
  course, production, and social projections.
- The repository audit found that generation-bound audio sources, complete-
  decode measurement, spectral evidence, source-clock review, matched A/B
  audition, versioned treatment, promotion, and delivery receipts already
  exist. The missing audio leap is event-level Dialogue Repair Review rather
  than another generic mastering screen.
- The next slice starts with human-marked, exact-source mouth-noise ranges and a
  conservative range-scoped de-click experiment, then qualifies automatic
  listening candidates against synthetic traps and retained human-reviewed
  podcast/coaching windows. See
  `docs/research/quipsly-capability-expansion-2026-08-05.md` and
  `docs/coordination/2026-08-05-dialogue-repair-review-architecture.md`.

### 2026-08-05 Dialogue Repair foundation and retained triage

- Audio Mastery now has a strict event-level Dialogue Repair contract for
  human marks, explicitly unqualified detector suggestions, future qualified
  detector snapshots, append-only source-context review, and a separately
  approved conservative mouth-click experiment.
- Audition pre/post roll and the 20 ms treatment pad are different authorities.
  False-positive and needs-comparison decisions cannot render. Plosive,
  sibilance, breath, clipping, and general-noise labels cannot borrow the
  mouth-click profile.
- The FFmpeg renderer is enabled only over the approved source-clock range,
  writes a versioned 48 kHz/24-bit PCM derivative, rechecks immutable source
  bytes, and remains unpromoted. The real fixture changes the marked impulse
  while preserving duration, channel count, source bytes, and sample-identical
  audio around an untreated second impulse.
- A bounded-memory retained scanner created twelve source-only review contexts
  from the exact 21.8-second Charlie sound check. Two earlier packets were
  visibly quarantined when evidence semantics were wrong; current v004 binds
  source SHA-256 `998e1e52...629669` and labels every suggestion unqualified.
  and records complete independent source/treatment decodes. No listening
  receipt or treatment preview was manufactured. The next product
  boundary is the linked browser review journey, then a real human confirmation
  and matched source/candidate audition.

### 2026-08-05 Session person/device/source readiness topology

- Recording room and Takes now share one projection that keeps canonical
  people, provider endpoints, pending phone capture receipts, and retained
  RecordingAssets visibly separate. A join grant never becomes presence; a
  call track never becomes a master; START/STOP never becomes uploaded media.
- The projection uses existing participant, consent, provider-grant, capture-
  owner receipt, source-profile, and RecordingAsset evidence. No schema or
  parallel readiness store was added. Renamed endpoint grants converge by
  client installation, and unmatched evidence remains explicitly unassigned.
- Live provider status is a separate safe readback, refreshed on demand and
  every twenty seconds only while the page is visible. Provider identities and
  credentials remain server-only, and the read cannot change access,
  invitations, consent, recording, or source state.
- A loopback-only retained dogfood fixture proved one consent-ready person, one
  prepared historical browser endpoint, and one closed iPhone capture awaiting
  bytes while the independent content/source ledgers still reported zero
  uploaded recordings. Both Recording room and Takes were operated in a signed-
  in local browser. Six focused suites / 53 tests and Quipsly typecheck pass.
- Physical browser+iPhone presence, real source upload, alignment, and Studio
  attachment remain the next acceptance lane. See
  `docs/coordination/2026-08-05-session-readiness-source-topology.md`.

### 2026-08-05 native retained-source readiness

- iPhone Capture's expandable Session readiness now exposes the retained source
  set before recording and handoff controls. It uses the existing canonical
  RecordingAsset/capture-group projection and does not create another device or
  readiness store.
- Each visible source distinguishes required local master from optional server-
  mix witness, exact-byte/release verification from pending processing, and
  retained source from Studio attachment. The empty state explicitly says that
  a prepared room, live call track, or server-recording receipt is not a master.
- The iOS app and UI-test target compile successfully for the iOS Simulator.
  The runtime smoke now requires the retained-source disclosure alongside the
  existing join/CallKit/consent/local/server-recording boundary. Physical source
  capture and playback remain the acceptance boundary.
- The feature-depth research program now has one ordered frontier queue for
  Session Guardian, on-device transcript assist, audible-event mapping,
  explainable assembly, conversation memory, adaptive voice chains, permission-
  aware Evidence Lens, and an outcome compiler. These are investigations over
  shared canonical primitives, not eight new parallel products.

### 2026-08-05 browser Session Guardian foundation

- The browser Session now projects conversation state, call-path microphone and
  camera evidence, tab visibility, and retained-source evidence into one ranked
  operational intervention. Its expandable explanation keeps the conversation
  feed and protected local master visibly separate.
- The retained recorder now watches every selected media track for mute, unmute,
  and end; stops after a five-second persistent mute; stops immediately on track
  end or encoder error; stops when no durable chunk advances for ten seconds;
  and checks browser storage every five seconds with a two-gigabyte warning and
  a 512-megabyte safe-stop reserve.
- Losing the call never stops the independent retained master. A hidden tab or
  browser-managed storage produces a calm warning rather than a false failure.
  Held sources preserve their recovery/download path and remain authoritative
  until exact-byte handoff verifies.
- The pure priority projection has focused coverage for missing take identity,
  call reconnection, encoder stall, call-path clipping, loading, and healthy
  durable writing. Quipsly typecheck and the focused Session suites pass.
  Deliberate unplug, mute, storage-pressure, background-tab, and network-loss
  operation still require browser and physical-device acceptance.
- Signed-in local visual operation was initially blocked because the host data
  volume had only 1.8 GiB free and Docker reported `no space left on device`.
  Four large Xcode DerivedData directories were moved intact, not deleted, to
  `/Volumes/My Passport/Quipsly Build Artifacts/high-ground-studio-product-2026-08-05`;
  the internal data volume recovered to about 5.8 GiB available. Docker's
  unresponsive backend was restarted and the full local doctor now passes for
  Nest, signed-out shell, transcript worker, media worker, Firebase emulator,
  Docker, and PostgreSQL.
- That recovery exposed PostgreSQL `42P08` in the media-worker lease release
  query. All six worker implementations now type the released status and
  timestamp parameters explicitly. Ten lifecycle regressions pass, and two
  deliberately requeued local jobs reached their expected terminal failed
  state through the corrected release path.

### 2026-08-05 native Session Guardian operation

- Quipsly Capture now projects Session readiness, local audio/video state,
  provider state, app visibility, capacity, input route, signal level, camera
  profile, and recovery evidence into one ranked native intervention above the
  recorder. The projection creates no competing readiness store and states
  explicitly that the live conversation is not a retained master.
- The native Guardian protects failed and auto-stopped sources, preparing and
  finalizing transitions, background capture, low storage, initial signal
  settling, sustained silence, hot input, clipping risk, video safety messages,
  provider errors, and independent local capture during call loss. Its evidence
  disclosure shows the contributing Session, conversation, audio master,
  camera master, and measured audio-capacity lanes.
- A disposable local Firebase user selected canonical Session
  `cmrrvwyol0003foxlxju1kqt6` (`High Ground Odyssey Episode 8 production
rehearsal`) in an iPhone 17 Pro simulator. The signed-in UI acceptance opened
  Record, selected that exact Session from the virtualized list, verified
  consent, recorder, Guardian, and local-start surfaces, opened Session Truth,
  scrolled to and opened Live Room, and verified the provider/local-source
  boundary. The one-test run passed in 42.498 seconds with zero failures and no
  unexpected runtime warnings; its result bundle is
  `/tmp/quipsly-capture-runtime-ui-surface-20260806T030345Z-16644.xcresult`.
- Native build-for-testing passes for the application and UI-test target, and
  the iOS static App Store smoke passes 1,064 assertions. Deliberate physical
  clipping, mute/route loss, network loss, background, capacity pressure,
  retained playback, and handoff remain the release-quality acceptance gate.

### 2026-08-05 audible-event map operation

- Audio Studio and the episode editor now share an audible-event map over the
  existing complete-decode signal and Dialogue Repair evidence. The projection
  creates no new canonical event store and keeps measured conditions, human
  marks, unqualified detector suggestions, qualified-detector evidence, review
  state, and repair authorization separate.
- Whole-source, sixty-second, and fifteen-second zoom, family/review filters,
  previous/next event navigation, waveform fallback, detector score, origin,
  false-positive retention, and accessible textual review state are available.
- Signed-in local dogfood on the immutable
  `quipsly-audio-treatment-ui-acceptance.wav` source created a deliberate
  1.500–1.550 second noise-event mark. Operation caught unbounded event playback;
  the fix now auditions bounded pre-roll/event/post-roll context. Playback
  stopped around 3.07 seconds, enabled review only after the full context, saved
  an append-only false-positive test receipt, and reconciled the map to
  `1 mapped / 0 needs listening / 1 false positive` including the filter.
- Current Apple Sound Analysis research and the detector qualification plan are
  retained in `docs/research/2026-08-05-audible-event-map-architecture.md`.
  Capture now emits a versioned Apple file-classifier receipt into its protected
  source profile, Nest rejects malformed receipts, and valid capture-linked
  suggestions appear in Audio Studio and the episode editor without becoming
  Dialogue Repair authority. Completed receipts are bound to the exact upload
  SHA-256 and byte count at the Nest boundary. Native evidence UI exposes
  classifier identity, timing, score, receipt ID, failure state, and bounded source audition.
- The reducer harness passes, four focused Nest suites pass 14 tests, the
  complete generic iOS Simulator application build succeeds, and the operated
  Source Evidence preview passes its focused UI and accessibility test. Two read-only
  local framework operations confirmed the short-file/no-window and ordinary-
  speech/no-suggestion paths. These are wiring evidence only: exact corpus
  precision/recall, false positives per hour, temporal error, long-take latency,
  battery, memory, and thermal cost still require retained physical-iPhone
  qualification before any detector may be called qualified.

### 2026-08-06 canonical audible-event analysis and cross-workflow operation

- Detector analysis is now an immutable source-bound ledger rather than
  Episode JSON. The same qualification lab projects into Audio Studio,
  Dialogue Repair, and coaching Session review while keeping machine
  suggestions, human truth, repair candidates, and edit authority separate.
- Real Apple Sound Analysis receipts were registered for the retained High
  Ground Odyssey beep source and the retained 80-second coaching source.
  Signed-in coach operation opened both coaching suggestions, played the full
  bounded context, and correctly refused to save without a human note. No
  audibility decision was fabricated.
- Dogfooding rejected registrations whose operation scripts disagreed with the
  server about canonical macOS paths and optional-null receipt fields. The
  scripts now hash the same canonical request the server verifies; four invalid
  local-only rows with no review dependents were removed by exact ID, and the
  original media and human evidence were untouched.
- Eight focused Jest suites pass 72 tests, the retained operation harness passes
  two tests, Quipsly typecheck and production build pass, Prisma reports all 73
  migrations applied, and the full local doctor passes.

### 2026-08-06 capability-depth and operating-agent decision

- Current product research now converges Quipsly around four shared primitives:
  source/evidence graph, Session/endpoint graph, canonical work/outcome graph,
  and a governed action runtime.
- The next depth portfolio is Session Control Plane; Audio Intelligence and
  Mastery Graph; Transcript and Explainable Assembly; Evidence Lens and
  Research Studio; Conversation Memory and Coaching OS; and Outcome Compiler.
  These are connected product systems rather than new detached navigation
  categories.
- The repository's generic agent registry remains retired. Machine-worker
  scheduling stays an infrastructure concern. The mature writing-assistant
  proposal path—authorization, source anchoring, advisory locking, stale-source
  refusal, append-only receipts, and undo—is the seed for a typed operating-
  agent runtime shared by UI, scheduled workflows, API, and future MCP.
- The recommended first non-writing agent operation is Session preflight. It is
  reversible, observable, immediately useful, and exercises device/provider
  boundaries without mutating source truth. See
  `docs/research/2026-08-06-quipsly-capability-depth-and-operating-agent.md`.

### 2026-08-06 Session source exit readiness

- The Finishing Cockpit now distinguishes pending local capture,
  server-copy completion, and installation-owned endpoint drain evidence.
  Exact RecordingAsset verification plus its matching finalization receipt is
  required; provider witness mixes do not count as required masters.
- Authenticated local operation rendered both truth states: a one-source iPhone
  capture still awaiting media and a four-source retained coaching Session with
  every server copy released. Both correctly kept global endpoint exit false.
- Operating the real page found a wrong-model Prisma projection that made every
  authenticated Session read fail safely. Governance evidence now comes from
  participant preflight receipts, not episode-binding receipts, with a
  page-query regression to preserve the boundary.
- `CallEndpointQueueReceipt` now appends monotonic, idempotent browser/iPhone
  queue snapshots. The browser publishes from its durable ledger; Quipsly
  Capture persists a protected native outbox and retries without risking local
  media. The server rejects unknown installations, stale revisions, unmatched
  captures, and sources without exact verified and released server bytes.
- Authenticated local operation advanced one retained browser installation from
  `NOT_EMPTY` revision 2 to `DRAINED` revision 3. The real page moved from 4/4
  server-safe but not globally safe to 4/4 server-safe and 1/1 endpoint drained.
  A later non-empty revision revokes the claim.
- Six focused suites pass 26 tests, Quipsly typecheck passes, and the complete
  iOS simulator target builds for arm64 and x86_64. Production deployment and
  physical-iPhone receipt operation remain separate release gates. See
  `docs/coordination/2026-08-06-session-source-exit-readiness.md`.

### 2026-08-06 Session Finishing Cockpit

- Recordings and Outputs now share a ranked Recover → Understand → Repair →
  Assemble → Finish projection over canonical source, transcript, audio
  analysis, Studio attachment, Session output, and delivery evidence.
- Missing evidence is `NOT_OBSERVED`; analysis is not repair approval,
  attachment is not editorial completion, and delivery history is not a claim
  that every master or destination is finished.
- Authenticated operation on the retained coaching rehearsal separated a safe
  recording exit from five downstream attention items: capture-test-only
  content, incomplete provenance, held/failed transcript attempts, partial
  audio-analysis coverage, and sources still awaiting Studio attachment.
- Two focused suites pass five tests, Quipsly typecheck passes, and the real UI
  was operated after correcting partial audio evidence from `NOT_OBSERVED` to
  `IN_PROGRESS`. See
  `docs/coordination/2026-08-06-session-finishing-cockpit.md`.

### 2026-08-06 Capture-native recording-plan declaration

- Every consented, room-bound iPhone audio or video take now stages a protected,
  owner-partitioned source-plan declaration after the local recording ledger is
  durable and before AV capture begins. Recording never waits for the network;
  the independent outbox retries and makes held declarations visible.
- The declaration carries the immutable capture UUID. Either arrival order now
  converges under the Session room lock: verified upload finalization can bind
  an existing declaration, and a late declaration can bind one already released
  upload only when checksum, byte size, storage identity, generation, capture,
  room, upload, and actor evidence all match.
- Operating the retained coaching Session exposed a legacy `VERIFIED` row that
  lacked exact manifest evidence. It is preserved as canceled audit history,
  not deleted; the Cockpit now reports 3/4 server-safe masters instead of a
  false 4/4. Cockpit safety also requires the immutable finalization binding to
  match the RecordingAsset, not merely separate verified and released labels.
- The exact retained Capture declaration is idempotently fulfilled with its
  append-only CREATE/BIND revisions. Three focused suites pass 28 tests,
  Quipsly typecheck and the 181-page production build pass, the native
  source-plan projection passes three pure Swift tests, and the complete mobile
  preflight passes both simulator architectures. Physical-iPhone operation and
  production release remain distinct gates. See
  `docs/coordination/2026-08-06-session-recording-plan-confidence.md`.

### 2026-08-06 retained Capture recovery and Episode materialization

- Failed Capture sources can now promote a verified backup into the
  Capture-owned durable recording namespace before replacement binding. Local
  promotion uses exclusive, flushed, mode-`0600` writes; GCS promotion uses a
  generation-pinned server-side copy. Both recheck exact size and SHA-256, and
  idempotent replay retains legacy binding provenance.
- Actual signed-in operation recovered two previously silent retained masters,
  preserved both originals, completed full-source decode, measured a
  `-1.249917s` two-point alignment with `0ms` residual, and ran local Whisper
  `large-v3-turbo` against the exact released generation.
- The resulting immutable provider evidence contains 47 timed words in three
  turns. `Quipsley` remains visibly uncorrected pending protected-source
  playback review; no person-listened claim was fabricated.
- The rendered editor materialized four clips and three source-bound transcript
  turns into the canonical Episode without guessed speaker-camera identity or
  publication. Operation uncovered and repaired a client hydration race that
  could label the editor's own successful materialization as a collaborator
  conflict.
- Three focused Quipsly suites pass 20 tests, the transcript worker passes six
  tests, Quipsly typecheck passes, and `git diff --check` passes. Clean-editor
  playback, transcript proof-listen, rough-cut render/probe, physical-iPhone
  recovery, and deployed Nest remain explicit next gates. See
  `docs/coordination/2026-08-06-retained-capture-recovery-materialization.md`.

### 2026-08-06 retained assembled Capture playback

- Materialized Capture clips now carry protected playback URLs while preserving
  RecordingAsset, MediaAsset, imported-source, SHA-256, and generation identity
  in their provenance binding. Spine deletion checks recognize every identity
  form rather than relying on a URL/database-ID coincidence.
- Canonical timeline fingerprints are key-order independent, normalize optional
  client defaults, and now include volume and transform decisions. This removed
  a false Capture materialization conflict without weakening genuine editorial
  concurrency protection.
- Successful materialization responses expose post-write `plan.changed=false`
  while retaining top-level operation truth. The editor no longer leaves a
  successful take looking actionable again.
- Real operation found Remotion advancing only silent shared-audio bootstrap
  tags. The editor now uses direct, source-inspectable audio elements and remounts
  on canonical timeline changes. Both recovered protected sources advanced at
  their reviewed offsets and paused together in the assembled player.
- Focused suites pass 23 tests, Quipsly typecheck passes, and the retained
  operation passes authenticated range read, canonical provenance readback,
  two-source playback, pause, and session cleanup. Provider word correction,
  physical-iPhone recovery, and deployed-Nest playback remain separate gates.
  See `docs/coordination/quipsly-session-episode-assembly-truth-2026-08-06.md`.

### 2026-08-06 explicit iPhone production-video quality

- Capture now defaults to an explicit UHD 4K/24 production intent and also
  offers 4K/30 plus a 1080p/24 endurance profile before camera permission.
- The resolver evaluates real advertised frame-rate ranges independently,
  prefers unbinned UHD, never invents a cadence across disjoint ranges, and
  never silently changes 24 fps to 30 fps. Any same-cadence resolution fallback
  is preserved as visibly unfulfilled intent.
- Source-profile schema v5 retains requested and resolved quality plus camera
  system pressure at Start. Serious pressure is visible; critical/shutdown
  closes the immutable source rather than silently lowering its quality.
- Seven deterministic policy cases, the complete mobile preflight, a
  warning-free generic iOS Simulator build, and two operated iPhone 17 Pro
  simulator journeys pass, including the largest accessibility text size.
  Physical front/rear capture, actual MOV readback,
  pressure/thermal operation, upload, and editor playback remain open. See
  `docs/coordination/2026-08-06-iphone-video-quality-intent.md`.

### 2026-08-06 Session program output authority

- The Session versioned output graph now projects promoted Episode-level
  multitrack programs separately from per-source microphone masters. Exact job,
  review, promotion, program/proposal/preview fingerprints, registered asset,
  Episode, and Nest identity must converge or the program is held.
- An active program makes source-master branches visible single-source
  alternates rather than eligible Episode substitutes. The UI does not invent
  delivery completion: lossless program, encoded AAC, encoded-byte
  proof-listen, packet selection, upload, and publication remain distinct.
- An authenticated loopback-only retained operation established a real Quipsly
  session cookie, rendered the active two-track program and open delivery
  boundary, and proved no source mutation, encoding, packet selection, upload,
  or publication occurred.
- The complete Session directory passes 196 tests across 27 suites with one
  skipped test; strict TypeScript, an isolated 189-route production build, and
  desktop plus 390 by 844 responsive browser operation pass. See
  `docs/coordination/2026-08-06-session-program-output-authority.md`.

### 2026-08-07 source navigation and Drive-backed Insta360 libraries

- Source Room now derives a checksum- and generation-bound audio navigation
  receipt from the exact collaboration proxy. Full decode produces bounded
  waveform windows, broad frequency-band evidence, signal measurements, and
  attention observations without changing source or derivative media.
- The source viewer now combines an eight-sample protected filmstrip, waveform,
  playhead, keyboard seek controls, and explicit I/O range marks. Measurements
  remain evidence for a person to interpret rather than automatic edit
  authority.
- Source Room now keeps the common selection path directly under that viewer:
  mark an exact range, give the moment a recognizable title, optionally leave a
  quick note, choose the canonical board, and save. Synopsis, story purpose,
  section, project tags, and non-destructive 360 camera direction remain in one
  explicit details drawer and still submit through the same `create-card`
  contract. Sources with the checksum-bound navigation rail no longer repeat a
  second I/O panel below it. Focused interaction tests, the 16-case PostgreSQL
  source-story suite, TypeScript, and the complete 194-route production build
  pass after the change.
- Unfinished select fields are retained by canonical source key for the
  lifetime of the open Source Room tab. Comparing another segment restores that
  segment's own range, title, notes, purpose, tags, and 360 framing instead of
  silently carrying metadata across originals or discarding work. The drafts
  are intentionally memory-only: nothing is written to browser storage before
  the creator explicitly saves the canonical card.
- Retained HGO operation proved exact replay and unchanged input bytes. It also
  found the retained 0.34-second proxy audio to be near digital silence at
  -160 dBFS; the UI reports that limitation instead of presenting a decorative
  waveform as usable sound.
- The shared `Insta360` Drive root was inspected read-only again on 2026-08-08
  from the exact folder the user shared with Quipsly.
  The latest connector readback contained eight capture-batch folders, 33
  visible files, 440.03 decimal GB (409.81 GiB) of visible source data, and 16
  complete INSV/LRV segment pairs. Two capture folders were still empty and one
  exposed only a zero-byte LRV. A previously incomplete three-segment batch now
  had its LRV companions, proving that readiness must be refreshed rather than
  inferred forever from an earlier scan. The root was still changing, so these
  are observed intake facts, not a completion or checksum claim.
- Source Room now projects this inventory through one explicitly selected
  local media computer. Library counts, retained LRVs, proxies, filmstrips,
  waveforms, bounded preparation, and final-quality capacity use the same node
  and opaque storage scope. An offline selection is held rather than silently
  replaced by another Mac.
- Google Drive intake now models library root -> capture batch -> independently
  seekable segment -> exact INSV/LRV members. Google Picker can select one
  library root, Quipsly recursively inspects exactly one reviewed level,
  presents ready versus held segments before attachment, preserves originals
  in Drive, and groups attached members through a project-owned source unit.
- Drive folder and package operations remain selected-file scoped. Quipsly
  rejects deeper unreviewed nesting, folders over bounded item limits, empty or
  restricted members for execution, cross-Nest source units, and attempts to
  reassign one external file between logical packages.
- Focused unit and PostgreSQL integration suites pass, including the real
  multi-segment naming topology, empty/in-progress uploads, library-root
  aggregation, project ownership, idempotent attachment, and package grouping.
  Drive-to-local LRV materialization and exact-source SHA-256 binding are now
  implemented through a resumable persistent Mac worker. Full INSV originals
  remain deferred until conform/export; attachment alone still does not claim
  any source bytes were copied or rendered.
- One real three-segment folder read back INSV members around 29–31 GB and LRV
  companions around 1.8–1.9 GB. Source Room prepares only a selected LRV,
  exposes durable byte progress and retry, and preserves each segment's own
  source clock.
- Followed libraries now project persistent browse readiness from the exact LRV
  replica, current proxy generation, generation-bound visual map, and
  deterministic audio-navigation job. The Story surface shows each stage,
  overall ready/eligible progress, the next resumable 12-segment pass, remaining
  LRV transfer bytes, and per-capture-day readiness. Missing camera dates remain
  visibly unknown; no date is inferred from a filename. The projection exposes
  no provider identifiers, resource locators, local paths, or credentials.
- Drive refresh now reports signed file, ready-package, and held-package deltas;
  local job progress can be checked without spending a provider rescan.
- Followed libraries now offer a metadata-only final-quality manifest across up
  to 50 attached camera segments. It reuses the exact per-segment conform
  contract, groups status by capture day, sums remaining bytes, and catches an
  aggregate Mac storage shortfall that individual preflights cannot see. It
  excludes incomplete unattached packages, withholds provider/revision/local
  locators, and cannot queue bulk originals; one segment still requires an
  explicit stale-checked conform approval before transfer.
- The retained HGO `Insta360` library exercised that manifest over three real
  January 28 segments. Their exact originals total 72,362,390,480 bytes and all
  remain in Drive. The active Mac reported only 1,543,467,008 safe bytes after
  its 5 GiB reserve, so the library is 70,818,923,472 bytes short and every
  segment is honestly held before transfer. This is a measured capacity result,
  not a provider download or render claim.
- The progress query bounds detailed preparation evidence to 500 present items,
  computes not-observed history independently, and labels bounded inventories
  instead of claiming false completion. Focused UI tests and real PostgreSQL
  integration prove both dated and unavailable-date projections.
- The new exact `StudioMediaSourceReplica` is distinct from an encoded
  `StudioMediaDerivative`. Completion requires a second provider inspection,
  exact MD5/size agreement, local SHA-256, atomic retention, and an immutable
  conflict readback before the existing collaboration-proxy worker is queued.
- A retained loopback operation copied and verified a 3,676,170-byte valid
  fake-provider LRV, then produced a 121,682-byte fast-start collaboration
  proxy. The source fixture remained unchanged. No real Drive original was
  downloaded in this proof.
- A real retained Episode 5 segment now proves the same product path over an
  81.76-second local provider package: a 1,222,300,003-byte dual-track INSV and
  102,420,828-byte LRV were SHA-256-bound, a 1,597,198-byte protected preview
  was generated, `Episode 5 · lakeside walk · segment 4` was retained on
  Homer's Insta360 board, and the exact range was promoted into a draft Episode
  timeline. Filename and byte-count agreement with the shared Drive folder is
  recorded as inventory evidence only; provider-copy equality still requires
  a later checksum comparison through the authenticated Drive path.
- Source cards now open a project-scoped discussion through the existing Nest
  collaboration kernel rather than a Story-only comment table. The thread key
  is bound to the card ID; the server refuses missing, archived, or cross-Nest
  cards and records the card stable ID, exact source-range ID, and card revision
  on every posted message.
- The retained Episode 5 operation used a disposable Editor to post and read
  back a message on card `0241e22a-ed33-44b0-aef2-ffcde24c12fd` through the
  authenticated application route. Both requests returned HTTP 200, the API
  projected the same source card, and the proof message, newly created thread,
  session, access grant, Auth user, and database user were removed afterward.
  No retained editorial discussion or test identity was left behind.
- The same source-card surface now creates a canonical Work task rather than a
  Story-local checkbox. The server revalidates project/card/board ownership,
  assigns the task to the acting Editor, carries the card's visible canonical
  tags, and records card revision, immutable range, source revision/set
  identities, and board placement in both task provenance and an append-only
  `SOURCE_CARD_ANCHOR` evidence receipt. Work shows that receipt and returns to
  the exact source set, board, and card.
- A local PostgreSQL operation created one tagged source-card task and one
  evidence receipt, replayed the same request without duplication, read the
  exact 12.25–24.5 second selector and source identities back, and removed all
  QA records. Focused server-action, model, component, and Work UI suites pass;
  no schema migration or parallel task database was introduced.
- A retained Chromium journey now combines the pieces on the real Episode 5
  card. A disposable Editor opened the exact source set and board, posted in
  the card discussion, created the task through the visible Source Story form,
  landed on its focused Work card, saw one `SOURCE_CARD_ANCHOR` receipt, and
  verified the return URL retained source set, board, and card identity. Final
  database readback found zero disposable users, QA tasks, QA messages, and QA
  threads; the operation declares and proves zero external side effects.
- That same retained journey now creates a second signed-in account with no
  Nest grant while the private message and task still exist. Source Story and
  the card thread each return HTTP 404, Work renders its explicit **Task
  unavailable** state, and the private task title appears zero times. Both
  Firebase/Quipsly identities are removed after proof. This is a real
  separate-account boundary for this vertical slice, not yet a claim that
  every Quipsly surface has completed its privacy audit.
- The Editor side of this retained journey is keyboard-operated: focus plus
  Enter opens the card discussion, sends its message, opens and submits the
  Work form, and follows the focused-task link. Playwright resolves the controls
  through their accessible roles/names. This proves the core Episode 5
  follow-through path is keyboard reachable; it does not substitute for the
  remaining product-wide screen-reader, contrast, zoom, reduced-motion, and
  physical-device accessibility review.
- The journey now continues from Work back to the exact Source Story card,
  opens that card's durable **Episode Open** section writing through the visible
  board control, verifies the writing rail still shows the 00:00.00–01:21.76
  source clock, and returns through **Open source select** to the same source
  set, board, and card hash. The writing rail's source link now deliberately
  carries the card anchor, so a user lands on the decision they were writing
  from rather than merely returning to the right board.

### 2026-08-07 Source Story portability v2 checkpoint

- Nest export now writes `quipsly-nest-export-v2` while retaining validated
  read compatibility for v1. The package includes provider-neutral Source
  Story revisions, sets, exact ranges, selectors, 360 reframe recipes, cards,
  tags, boards, sections, writing links, placements, and decision history.
- Restored sources are disconnected `portable` references with exact evidence
  but no provider locator, credential, access grant, local path, signed URL,
  media byte, replica, or derivative. They truthfully remain unavailable until
  a later checksum-proven relink.
- Source-card Tasks rebind to the destination Nest and restored
  card/range/set/revision/board identities while preserving
  `sourceAvailable:false`. A restore therefore keeps the reason and decision
  path without claiming the camera original moved.
- Export document visibility now combines notes, the acting actor's personal
  writing, and Source Story section writing inside one visibility boundary.
  This fixes an earlier overwritten `OR` query that could include more shared
  writing than the stated package scope.
- Pure manifest/reference tests, route authorization tests, rendered owner-UX
  tests, strict TypeScript, and a disposable PostgreSQL round trip cover v1
  compatibility, tamper rejection, graph integrity, deterministic retry,
  source/card/board/writing restoration, task-anchor rebinding, and zero
  external effects. A read-only retained Episode 5 operation also exported and
  revalidated the real card `0241e22a-ed33-44b0-aef2-ffcde24c12fd`, exact
  range, source set, board, and three linked writing sections without provider
  locators or bytes. The 194-page production build passes. Production and
  physical-device recovery remain separate acceptance gates.

### 2026-08-08 spatial render custody

- Spatial render contract v2 separates portable editor intent from
  executor-local media bytes. INSV replicas, reviewed 5.7K stitch masters,
  reframe targets, results, and worker receipts must all name one exact local
  executor and opaque storage scope.
- The local spatial worker claims only jobs addressed to itself. Source Story
  filters local artifacts and render jobs to the selected Mac, and derivative
  playback refuses scoped bytes when that executor/storage identity is not
  currently present.
- A two-executor PostgreSQL proof confirms that the second Mac cannot see or
  queue from the first Mac's stitch master. Canonical ranges and 360 keyframe
  recipes remain portable and reversible so the render can be rematerialized
  on another executor after its own exact sources are prepared.
- Detailed architecture and proof:
  `docs/coordination/2026-08-08-spatial-artifact-portability.md`.

### 2026-08-08 conventional Episode proof custody

- Episode render proof contract v2 now binds the job, exact camera/audio
  sources, output target, result, and worker to one local executor and opaque
  storage scope. PostgreSQL claims and worker runtime both reject foreign work
  before rendering.
- The Episode editor names the planned Mac, discloses that proof bytes remain
  executor-local while edit intent stays portable, and queues against that
  exact node. An unavailable selected Mac is held rather than replaced.
- Registration verifies exact bytes and complete decode while the custodian is
  online. Playback requires one unambiguous v2 custody receipt and the same
  current executor scope derived by the serving process from its canonical
  media root and filesystem identity; an online remote Mac or project
  authorization alone cannot make a local path globally readable.
- Detailed architecture and proof:
  `docs/coordination/2026-08-08-episode-render-artifact-portability.md`.

### 2026-08-08 Advanced Studio render authority

- Advanced Studio now retains the authenticated Episode payload only after the
  shared branch revision/fingerprint, canonical timeline fingerprint, and
  canonical source-projection fingerprint all match the incoming handoff.
- The former static `Web rendering is not connected yet` dialog is replaced by
  the real Episode proof plan. Opening it freezes the current playhead, performs
  a no-side-effect readiness inspection, names the executor, and shows exact
  source count, bytes, output quality, locality, and cost boundaries.
- An explicit render action queues only the named Mac and follows the durable
  job through output-ready registration and protected verified playback. A
  stale branch or absent verified handoff fails closed instead of guessing.
- The UX calls this a review render, never a final export. It explicitly says
  that unsaved Advanced Studio experiments are not silently included and lists
  the remaining final-conform requirements.
- The 30-test focused handoff/UI/server/worker set, strict web TypeScript, and a
  cache-disabled production build pass. The build emitted a build ID,
  standalone server, static assets, 110 page modules, and 222 route modules;
  its isolated 70 MB output was removed afterward. The retained
  database/browser journey remains pending because Docker Desktop's engine was
  not responsive during this checkpoint.

### 2026-08-24 call recovery preserves participant-owned recording

- Browser and iPhone now treat the live call transport and the local recording
  master as separate lifecycles. An exhausted provider reconnect exposes one
  **Rejoin call** action, obtains fresh room authority, and remembers the
  participant's device choices without ending or hiding an active source.
- Browser recovery keeps durable coordinated-stop polling alive while remote
  media is cleared. A focused regression proves that a retained source remains
  active through provider disconnect and rejoin; deliberate Leave still marks
  the conversation ended and protects the recording.
- Native CallKit cleanup now distinguishes Quipsly's programmatic removal of a
  failed call surface from a genuine lock-screen, headset, or system-call
  hang-up. The former preserves the local master for rejoin. The latter still
  invokes source protection before disconnecting.
- The retained provider-PCM path reuses the active capture lease. Capture now
  writes the exact interrupted/recovered call interval as a zero-additive
  `call-transport-gap` evidence span, while Nest and the iPhone audio review
  surface preserve its beginning and ending. It deliberately requires
  listening: network loss alone does not prove that the independent local input
  became silent or lost bytes.
- Browser retained sources now append the same outage span to their durable
  local ledger. Rejoin closes it; stopping while still disconnected closes it
  at the recording boundary. Finalization merges those spans with the latest
  chunk journal before upload, and Nest projects both the native array and the
  browser manifest envelope through one audio-evidence contract.
- The join API now returns stable machine-readable failure codes. A rejoin that
  receives `ROOM_NOT_OPEN` becomes a conventional closed-Session surface with
  no further Join button, while source stop/save/upload/recovery stays visible.
  Authentication, access, payment, and transient transport failures retain
  distinct messages instead of collapsing into a misleading network error.
- Capture now decodes that same failure code. `ROOM_NOT_OPEN` is retained only
  against the exact closed call-room ID, removes the iPhone Rejoin/device setup
  loop, and keeps local recording/recovery available. Selecting another Session
  does not inherit the closed state.
- The 29-test focused web call-room suite and strict web TypeScript pass. A
  generic iOS Simulator build succeeds for arm64 and x86_64 after compiling the
  native recovery path. Rendered browser operation was unavailable because both
  browser-control surfaces could not attach; physical iPhone interruption,
  exact-byte upload/readback, and genuine CallKit operation remain in the
  deferred validation ledger rather than being inferred from compilation.
- Focused transcript-evidence, browser-ledger, call-room, and audio-map tests
  also pass, proving the gap is presented as a warning span and is not summed as
  another media duration.

### 2026-08-24 post-call playback readiness

- The Session source journey no longer calls exact retained bytes, a transcript,
  and an editor take a complete source journey while protected playback is
  absent. Playback is now a separate checkpoint between retention and
  transcription.
- Released audio is playback-ready only with an authenticated source route and
  an exact-source complete decode with positive duration. Released video also
  requires a positive protected duration and a retained recorded-video track
  with positive encoded dimensions. Failed or blocked decode evidence becomes
  visible attention while the original remains unchanged.
- Expanded recording details place an ordinary protected audio/video player
  beside the source journey. The projection explicitly preserves the boundary
  that a route and complete decode are not proof that a human listened,
  watched, or accepted sync.
- Eleven focused projection/UI tests and strict Quipsly TypeScript pass.
  Physical-device and two-participant playback remain in the deferred
  validation ledger. Detailed decision record:
  `docs/coordination/2026-08-24-post-call-playback-readiness.md`.

### 2026-08-24 Session transcript readiness

- Session post-call surfaces no longer reduce transcript completion to provider
  job status plus segment count. The production query now carries exact source
  SHA/generation, manifest/result/provider/worker receipts, immutable word
  counts, routing topology, timing granularity, and speaker authority into one
  read-only readiness projection.
- A source mismatch is held. Missing receipt, word, timing, or routing evidence
  stays review-required. Mixed-room speaker labels remain provider candidates;
  participant-isolated source binding can establish the physical speaker owner
  without claiming the words are accurate.
- The source journey, finishing cockpit, transcript-ready count, and coaching
  four-step path share the same contract. A completed-but-unready transcript no
  longer advances client follow-through.
- The Session's built-in text-based recording editor now shares the contract.
  Exact-source word-timed passages remain reversibly removable; source-bound
  passages with unresolved timing or speaker evidence stay visible, included,
  and disabled with a reason. Source mismatches are never paired with the
  selected recording.
- Forty-one focused transcript, journey, cockpit, UI, coaching-path, and
  reversible-edit tests pass, as does strict Quipsly TypeScript. Human word-sync
  and speaker review remain in the deferred validation ledger. Detailed decision record:
  `docs/coordination/2026-08-24-session-transcript-readiness.md`.

### 2026-08-24 Session conversation

- Session workspaces now have a first-class Conversation destination across
  coaching, podcast, research-interview, and internal-meeting language. The
  live lobby links to it without adding another vertically stacked setup step.
- A dedicated room-bound model supports retry-safe sends, same-room replies,
  author edits with optimistic revision checks, visible removal tombstones,
  append-only revision evidence, and per-actor read cursors. It does not depend
  on a Session having a Nest/project.
- Conversation reads use a narrower participant/collaborator boundary than the
  general Session shell; project viewers do not inherit the thread. Writes
  recheck canonical authority inside the transaction.
- The mobile-first thread retains a failed-send draft and request identity,
  polls while visible, refreshes on focus, and keeps Notes, Tasks, Goals,
  transcript, and external delivery separate.
- Quipsly Capture now opens that same conversation for projectless coaching
  Sessions instead of projecting the legacy Nest chat. Native reply, edit,
  remove, retry, read continuity, and an account-bound protected offline cache
  share the browser's canonical room records. LiveKit is only a refetch hint.
- The API projects read/write capabilities so an authorized observer gets a
  conventional read-only thread instead of a composer that later fails.
- Read cursors bind to the exact last-read message ordering and advance
  monotonically, so a concurrent message is not swallowed and an older tab
  cannot move another device's position backward.
- Seventy-one focused API, thread, and Session workspace tests and strict Quipsly
  TypeScript pass. A signing-independent iOS simulator build and focused
  iPhone 17 Pro/iOS 26.3.1 UI test also pass with the native conversation
  client and interface. The full 124-migration chain applies on fresh
  PostgreSQL with all three tables, the typed operation enum, and seven foreign
  keys present. Two-account browser/iPhone comprehension, isolation, readback,
  and reconnect behavior remain in the deferred validation ledger. Detailed decision record:
  `docs/coordination/2026-08-24-session-conversation.md`.

### 2026-08-24 native Session protected playback

- Quipsly Capture can now review a verified retained Session source even when
  it is not in that iPhone's local recording library. The Session projection
  carries the exact RecordingAsset ID, byte count, SHA-256, duration, optional
  Studio identity, and canonical protected Session playback path.
- Coaching playback no longer depends on podcast/Studio promotion. The new
  Session route authenticates and applies Session access before storage lookup,
  refuses held or drifting evidence, pins the immutable GCS generation, and
  supports browser byte ranges plus metadata-only HEAD.
- The app exposes **Listen** or **Watch** only when released source evidence is
  complete. Preparation is user-initiated, account-bound, capacity-checked,
  same-origin, byte-count checked, and completely SHA-256 verified before an
  AVPlayer receives the file.
- Prepared copies use iOS file protection, are excluded from backup, expire
  after 30 days, stop on account change, and can be removed without changing
  the retained original.
- The focused 61-test route/evidence/mobile projection suite, 23 adjacent
  Session player/journey tests, and strict Quipsly TypeScript pass. A
  signing-independent simulator build and focused iPhone 17 Pro/iOS 26.3.1 UI
  test also pass. Real authenticated download, physical-device
  playback, beginning/middle/ending listening, video decode, and sync remain
  in the deferred validation ledger. Detailed decision record:
  `docs/coordination/2026-08-24-native-session-protected-playback.md`.

### 2026-08-24 Session transcript program clock

- Participant-isolated transcripts now enter one reusable Session program-clock
  assembler instead of relying on report-route wall-time arithmetic.
- Complete validated capture-clock proposals from the same take outrank reported
  recording starts. Incomplete evidence falls back visibly; different declared
  capture groups fail closed.
- Provider/source segment timing stays immutable. The report builder applies
  the derived source offset exactly once and retains both source-local and
  Session-program timestamps for every turn.
- Multi-source output discloses timing authority, maximum estimated uncertainty,
  and mandatory waveform review. It never claims sample-accurate alignment.
- Fourteen focused clock/report/route tests and strict Quipsly TypeScript pass.
  Real two-device waveform correlation, late-drift measurement, and transcript
  readback remain in the deferred validation ledger. Detailed decision record:
  `docs/coordination/2026-08-24-session-transcript-program-clock.md`.

### 2026-08-24 Session transcript correction assembly

- The ordinary transcript correction endpoint now assembles ready
  participant-isolated sources instead of returning only the newest job.
  Focused-source reads remain exactly scoped to one RecordingAsset.
- A shared selector respects capture-group identity before the legacy coherent
  wall-time fallback. Every passage retains transcript, recording, source-local,
  Session-program, and protected-playback coordinates.
- Correction mutations locate the job that owns the segment rather than
  assuming the newest job owns all Session passages.
- Browser playback switches to the passage's exact participant source before
  seeking, and review coverage is source-qualified. Capture displays Session
  time but seeks on source time and refuses to borrow a different local original.
- Forty-seven focused server tests, 26 browser interaction tests, strict Quipsly
  TypeScript, and a signing-independent iOS Simulator build pass. Real
  two-source playback, correction/readback, and wrong-source iPhone rejection
  remain in the deferred validation ledger. Detailed decision record:
  `docs/coordination/2026-08-24-session-transcript-correction-assembly.md`.

### 2026-08-24 exact Session transcript playback binding

- Session inventory, transcript correction, and the private range-serving route
  now share one exact playback binding. Verified/released labels alone are
  insufficient without a matching room/source/upload receipt, SHA-256, byte
  size, vault object, and storage generation.
- Browser transcript review can play each released participant-owned source
  directly from its authenticated Session route without waiting for Studio
  promotion. Correction and speaker-attribution mutations reconstruct the same
  server authority before accepting playback evidence.
- One hundred focused tests, strict Quipsly TypeScript, both release static
  gates, and a signing-independent iOS Simulator build pass. Capture now reuses
  its verified protected Session cache for a non-local passage and keys the
  listened-through position to that passage's expected RecordingAsset. A
  camera-only source now prepares one compact, immutable, source-bound AAC
  derivative on demand, so one Play tap cannot fetch a 4K master and also no
  longer leaves the iPhone transcript unplayable.
  Real
  two-account download, listening, correction, and wrong-source refusal remain
  deferred evidence. Detailed decision record:
  `docs/coordination/2026-08-24-session-protected-transcript-playback.md`.

### 2026-08-25 Session camera audio audition

- Camera-only Session transcripts and text-based recording edits now prepare a
  compact AAC review derivative instead of downloading the retained 4K master
  or disabling iPhone playback.
- A first-class `SessionAudioAuditionJob` commits before its create-once GCS
  outbox. The worker re-hashes the exact source generation, encodes 48 kHz
  AAC-LC, decodes through EOF, and emits an immutable result with its own
  generation, byte count, SHA-256, CRC32C, technical evidence, and worker
  identity. The original remains source truth.
- Nest re-resolves Session access and current finalization evidence before
  registration and on every protected playback request. Capture downloads and
  completely verifies only the small derivative, caches it separately under
  account/file protection, and keeps listening receipts bound to the original
  RecordingAsset and source clock.
- Five contract/worker tests, eleven focused service/API tests, Prisma
  validation and generation, three strict TypeScript builds, the full Capture
  release-source gate, and the complete dual-architecture Capture preflight
  pass. Live worker execution and physical iPhone listening remain deferred
  evidence. Detailed decision record:
  `docs/coordination/2026-08-25-session-camera-audio-audition.md`.

### 2026-08-24 Session exact-source waveform alignment

- Coaching/call Sessions now have a first-class `SessionAudioAlignmentJob`
  instead of fabricating Studio or Episode identity to use media processing.
- A new Session job envelope shares the existing generation-bound GCS queue,
  FFT correlation analyzer, exact-byte verification, drift measurement, and
  evidence receipt with Episode alignment while preserving room/take/source
  scope.
- Queueing requires two released, exact-byte-verified RecordingAssets from the
  exact current capture group. Complete capture-clock proposals seed the search;
  retained wall starts remain an explicit fallback. Insufficient shared duration
  fails before worker execution.
- The Recordings workspace exposes a cost-explicit Participant sync evidence
  desk with source selection, polling, opening/later offsets, residual drift,
  ppm, correlation, peak margin, and qualification. It cannot move either
  source, render, share, or claim sample accuracy.
- Ten focused Session contract/route/UI tests, seven shared analyzer/worker
  tests, Prisma validation, three strict TypeScript builds, and both Capture
  release static gates pass. Real two-device listening and a separately bound
  placement approval remain deferred evidence. Detailed decision record:
  `docs/coordination/2026-08-24-session-exact-source-waveform-alignment.md`.

### 2026-08-25 Session reviewed waveform placement

- Qualified Session waveform evidence now has an append-only, optimistic,
  replay-safe approval/revocation receipt bound to the immutable worker-result
  SHA-256 and both current released source generations.
- An active approval is revalidated at read time. A stale hash, normalized
  placement, take, locator, SHA-256, byte count, or generation holds assembly
  instead of silently presenting an estimated clock as the approved result.
- The Session clock solver supports a graph of participant/device sources,
  preserves negative offsets without deleting early media, and rejects partial
  or inconsistent measured placement sets.
- Browser transcript correction, exact-source passage playback, and coaching
  transcript reports now consume `reviewed-waveform-placement`; revocation
  returns them to the visible provisional clock without changing originals.
- Focused placement, clock, correction, report, route, and alignment tests,
  strict Quipsly TypeScript, Prisma validation, and both Capture release static
  gates pass. Real two-device listening/readback remains deferred evidence.
  Detailed decision record:
  `docs/coordination/2026-08-25-session-reviewed-waveform-placement.md`.

### 2026-08-24 conventional call confidence checks

- The browser outer room now shows a compact live microphone activity meter
  after the selected preview is open. Its ordinary state describes level only;
  it does not infer room quality or retained-source mastery from a call-path
  meter.
- Audio/video settings expose a one-click **Test speakers** action that creates
  a short local tone and routes it to the selected browser output when
  supported. It never opens a microphone, records, uploads, or changes Session
  consent.
- The existing private ten-second microphone listen-back remains optional for
  mouth noise, plosives, room sound, and routing checks. Technical RMS/peak
  evidence remains collapsed.
- The native permission audit confirms that hardware access is requested only
  from Join, Preview, Sound Check, or Record when iOS still reports an
  undetermined decision. Remembered grants proceed immediately; denials expose
  one Settings recovery action. Session recording consent is separate and
  remains saved for that person's exact Session/source choices.
- After Join, the main call status now follows the retained recorder's
  preparation projection. It immediately changes from recording-off to the
  honest saved/waiting or everyone-ready state instead of leaving stale
  instructions above the Record control.
- Thirty-four focused browser call/consent/speaker tests, strict Quipsly TypeScript,
  the 1,167-check Capture static gate, provider-room static smoke, and the full
  Capture release-source gate pass. The release gate now protects deliberate
  native video calling plus the separate retained Record action instead of the
  retired audio-only CallKit assumption. Physical browser/iPhone routing,
  remembered re-entry, and retained-source listening remain in the deferred
  validation ledger. Detailed decision record:
  `docs/coordination/2026-08-24-conventional-call-ux-review.md`.

### 2026-08-25 native join-muted call lobby

- Capture now separates using this iPhone for call audio from publishing its
  microphone. A primary endpoint can subscribe to the conversation while
  joining muted; a companion endpoint continues to subscribe to and publish
  no call media.
- The ordinary pre-join microphone choice is persisted independently from
  call-audio routing. A muted join does not request microphone access; the first
  explicit Unmute becomes the permission boundary and rechecks the stable
  signed-in owner before publication.
- A denied participant can remain connected and listen instead of being blocked
  by permission ceremony. Recording still starts and stops separately from
  provider-room membership.
- The 1,199-check Capture static gate, a dual-architecture Simulator build, and
  the focused operated outer-room journey pass. Real iPhone audibility,
  permission timing, remote mute visibility, echo behavior, and retained-source
  survival remain in the deferred validation ledger. Detailed decision record:
  `docs/sessions/native-join-muted-lobby-2026-08-25.md`.

### 2026-08-25 native pre-join camera lobby

- Capture's outer room now includes a remembered privacy-safe camera choice, a
  real prepared self-preview, and front/back switching before Join. Camera
  permission begins only from Camera on, and camera failure never blocks the
  audio call path.
- A prepared camera-on choice publishes only after room connection. Preview,
  provider video, and a later retained 4K/24 movie share Quipsly's one
  authoritative AVFoundation graph instead of competing camera sessions;
  recording remains a separate deliberate action.
- The model tracks ownership of the call preview. Turning it off or leaving
  Record before joining closes that preview without touching an active call or
  retained source.
- The 1,213-check Capture static gate, a dual-architecture Simulator build, and
  the focused operated outer-room journey pass. Physical camera permission,
  framing, rotation, provider transport, simultaneous 4K source survival, and
  second-participant observations remain in the deferred validation ledger.
  Detailed decision record:
  `docs/sessions/native-prejoin-camera-lobby-2026-08-25.md`.

### 2026-08-25 native call audio routing

- Capture's outer room now renders microphone and listening destination as
  separate route facts and exposes Apple's system audio-route picker whenever
  this iPhone owns call audio. Companion mode removes that control rather than
  implying local route ownership.
- The shared audio-session coordinator observes actual route changes and
  publishes the current output and built-in-speaker state. A persistent in-call
  Speaker action uses the supported audio-port override while external routes
  remain under CallKit and iOS authority.
- The 1,226-check Capture static gate, a dual-architecture Simulator build, and
  the focused operated outer-room journey pass. Physical audibility, Bluetooth
  profile behavior, wired/USB routing, route-loss recovery, echo, and retained
  source survival remain in the deferred validation ledger. Detailed decision
  record: `docs/sessions/native-call-audio-routing-2026-08-25.md`.

### 2026-08-25 native call reconnect recovery

- Provider reconnect exhaustion, programmatic CallKit cleanup, and a deliberate
  person/system hang-up now travel through one explicit end disposition. The
  asynchronous CallKit handler can no longer erase an exhausted provider
  **Rejoin call** state or accidentally reinterpret it as a source-ending
  hang-up.
- Reconnecting opens and closes explicit call-transport-gap evidence without
  asserting what the local microphone retained. Manual Rejoin requests fresh
  server authority while the existing participant master remains independent.
- Successful in-call mic and camera changes become the next remembered Rejoin
  choices. A focused relaunch journey operated safe call-audio, muted, and
  camera-off preference readback without repeated ceremony.
- The 1,235-check Capture static gate, a dual-architecture Simulator build, and
  the 1/1 relaunch journey pass. Physical network/CallKit event order, audible
  continuity, source survival, headset hang-up, and closed-Session behavior
  remain in the deferred validation ledger. Detailed decision record:
  `docs/sessions/native-call-reconnect-recovery-2026-08-25.md`.

### 2026-08-25 coordinated recording control recovery

- Ready non-controller participants now see an affirmative waiting state instead
  of a gray Record button. Capture claims Ready only when the exact endpoint has
  current Session consent and required system access.
- A controller whose own retained source joined late or failed can retry the
  existing durable START locally. Capture no longer issues a second conflicting
  room command in that recovery state.
- Browser consent/readiness now reuses the canonical Session control boundary,
  closing project owner/editor drift with the recording-command endpoint.
- The 1,243-check Capture static gate, five focused route tests, strict Quipsly
  TypeScript, a dual-architecture Simulator build, and the focused 1/1 operated
  waiting-state journey pass. Physical two-endpoint START/STOP, source retention,
  synchronization, upload, playback, and minimally instructed comprehension
  remain in the deferred validation ledger. Detailed decision record:
  `docs/sessions/coordinated-recording-control-recovery-2026-08-25.md`.

### 2026-08-25 coordinated recording receipt recovery

- Every iPhone coordinated endpoint transition is now persisted before network
  delivery in a protected, installation-scoped, account-partitioned outbox.
- Retryable failures schedule real recovery; ordinary app load and active room
  polling also resume pending delivery with the original idempotency identity.
- Pending status receipts never age out, and the outbox remains collaboration
  evidence rather than media, upload, or `RecordingAsset` truth.
- The 1,254-check Capture static gate, dual-architecture Simulator build, and
  focused operated relaunch/account-switch journey pass. Physical outage,
  process-death, server convergence, and exact-source playback remain in the
  deferred validation ledger. Detailed decision record:
  `docs/sessions/coordinated-recording-receipt-outbox-2026-08-25.md`.

### 2026-08-25 browser recording receipt recovery

- Browser endpoints now persist the complete coordinated status request before
  delivery instead of retaining only a UUID while callers swallow failures.
- Browser and iPhone receipts now preserve the device's original event time;
  delayed delivery no longer rewrites an endpoint transition as the reconnect
  time. Nest keeps receipt time separately and rejects idempotency drift.
- One local-storage record per receipt avoids shared-array lost updates;
  participant-scoped keys keep the normal application drain on the restored
  participant's queue. This is logical application isolation, not encrypted
  isolation from the owner of the same browser profile. Legacy idempotency IDs
  are reused safely.
- Room polling, browser-online recovery, and initial participant restoration
  drain pending work. Concurrent triggers are coalesced, terminal protocol
  conflicts remain diagnostic evidence, and corrupt bytes remain untouched.
- The browser shows a calm saved-status recovery notice without claiming that
  media exists or uploaded. Focused client/route tests pass 25/25 and the
  full Quipsly typecheck passes. Real navigation, outage, account-switch,
  server convergence, and exact-source playback remain deferred. Detailed
  record: `docs/sessions/browser-recording-receipt-outbox-2026-08-25.md`.

### 2026-08-25 shared-clock review and cloud audio experiments

- Capture recording quality now uses one shared-clock waveform rail with an
  explicit playhead and visually distinct signal warnings, capture boundaries,
  and audible-event suggestions. Tapping seeks the immutable source; it does
  not edit, confirm, repair, master, share, or publish anything.
- Dialogue Repair and the narrowly qualified DC/rumble treatment now accept
  exact generation-bound GCS sources as well as local media. Each uses a
  create-once control manifest and queue receipt, an expiring optimistic lease,
  a deterministic output object, exact-generation readback, independent
  measurement and diagnosis, and a terminal dead-letter path.
- Nest registers a cloud preview only after the worker result, source binding,
  output bytes, object metadata, duration/channel gates, and complete-decode
  evidence agree. Missing processor configuration retains the job as a visible
  blocked state instead of misreporting failure. Originals remain source truth;
  both outputs remain unpromoted experiments with separate listening and
  promotion authority.
- Focused worker, outbox, route, contract, real-FFmpeg, and media-vault checks
  pass, alongside strict package/app typechecks and production Quipsly builds.
  Live Cloud Run operation, protected listening, and human A/B judgments remain
  release-bound validation rather than inferred proof.

### 2026-08-25 Capture Build 35 exact-candidate qualification

- Detached committed source `d51651fffbef5e87ae406b7a4abcec32302eea7e`
  passed all four deterministic iPhone UI shards: 83/83 selected tests, zero
  failures, zero skips, and source-bound native result bundles.
- Quipsly Capture 1.0 (35) then archived and exported with Apple Distribution
  signing for team `585GUXMY5M`. App and Share extension metadata, privacy
  manifests, iPhone-only device family, background audio/VoIP modes,
  entitlements, provisioning profiles, and strict nested signatures passed
  packaged-artifact inspection.
- The qualified IPA is 27,856,831 bytes with SHA-256
  `f99ab738b23ce7a8325dd55ed9b8a4808ecc93b4884d0b859323a3578101d188`.
  Receipt and UI evidence are retained under the run-scoped
  `/tmp/quipsly-capture-release/d51651fffbef/20260825T213036Z-90342` and
  `/tmp/quipsly-capture-ui-tests/d51651fffbef/20260825T213036Z-90342`
  directories.
- Candidate qualification deliberately did not upload, assign testers, wait
  for App Store processing, or claim a physical TestFlight install. Those
  remain separate authenticated and human/device validation boundaries.

### 2026-08-25 unified cloud source transcription

- Exact generation-bound Studio audio/video sources now use the same hardened
  Cloud Run transcription worker as participant-owned Capture recordings.
  Studio no longer requires a local Nest media path and no second ASR pipeline
  was introduced.
- New manifests carry an explicit `studio-media` subject binding while keeping
  the historical room/recording projections readable by the v1 worker. The
  create-once outbox freezes source generation, SHA-256, byte size, media type,
  provider/model/version, language, topology, authorization, and terminology
  evidence. Re-entry recreates neither the manifest nor the queue receipt.
- Cloud provider results are converted into the existing Studio append-only
  transcript receipt, then registered only after the original source is
  re-inspected. Word and segment clocks, confidence, speaker labels, raw
  provider-response identity, worker identity, and deterministic quality
  warnings remain inspectable. Originals remain source truth and no task,
  goal, note, edit, share, or publication is implied.
- Missing worker configuration is a visible recoverable `blocked` state rather
  than a terminal transcript failure or an indefinite spinner. The adapter,
  local Whisper path, shared cloud worker, manifest policy, transcript evidence
  projections, strict TypeScript checks, worker builds, and the production Nest
  build all pass locally. Live provider execution and protected playback review
  remain deferred release validation.

### 2026-08-25 private Session video editing and sharing

- The existing reversible Session editor now produces either its qualified
  audio copy or a shareable 1080p24 H.264/AAC video copy without requiring a
  separate Studio app. Browser and iPhone expose the same format decision only
  when a verified camera source exists.
- Video binds one exact selected camera to the picture and chooses one audio
  program source per participant, preferring dedicated participant-owned audio
  over embedded camera sound. This prevents accidental double-mic mixing while
  retaining all source recordings unchanged.
- The v3 job/result contract remains backward compatible with v1/v2 audio work.
  Local and cloud workers verify duration, codecs, dimensions, frame rate,
  pixel format, full audio/video decode, exact source bytes, output bytes, and
  cloud generation readback before a private preview becomes releasable.
- Real-FFmpeg video generation, contract/cloud/local-worker tests, server and
  browser tests, strict typechecks, the media-processor build, and the Capture
  Simulator build pass locally. Physical iPhone, live Cloud Run, cross-account,
  and human sync/listening review remain deferred. Detailed decision record:
  `docs/sessions/private-video-edit-share-2026-08-25.md`.
- Capture can now hand off the exact reviewed MP4/M4A through the standard iOS
  share sheet without exposing a server URL. It authenticates, downloads,
  hashes, byte-checks, and file-protects the copy first. Coaches cannot export
  an unreviewed draft; clients cannot export before Session release. The system
  completion callback is reported without claiming a particular recipient.
