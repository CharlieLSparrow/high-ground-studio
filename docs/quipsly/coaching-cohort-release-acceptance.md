# Coaching cohort release acceptance

Date: 2026-08-19
Status: active release gate

## The standard

Quipsly Coaching is ready for a cohort only when a coach and client who did not
help build the product can complete the ordinary product journey with little or
no instruction. The acceptance scenario is a release to 50 coaches at once,
not a guided demonstration to one retained QA account.

Hard-coded Episode, Session, project, user, or invitation identifiers are
regression fixtures. They are useful for repeatable recovery, upgrade, and
longitudinal checks, but they cannot satisfy this release gate.

## Two distinct test lanes

### Regression lane

The retained dogfood corpus and scripted source-contract tests may:

- seed dedicated QA identities and known records;
- open a known Session or recording directly;
- preserve longitudinal artifacts between runs;
- verify data recovery, access isolation, schema compatibility, and rendering.

Those checks answer, "Did a known capability regress?" They do not answer,
"Can a new coach discover and use Quipsly?"

### Fresh-user acceptance lane

Every candidate release must also use:

- a newly provisioned coach identity with no preselected project or Session;
- a separate client identity invited through the ordinary coach UI;
- links copied from the rendered product, not assembled from database IDs;
- ordinary navigation from the coaching home;
- no direct database edits after the journey begins;
- no operator explanation beyond the invitation and a one-sentence request to
  use Quipsly for the coaching relationship.

If setup requires an administrator, that setup must be cohort-capable, visible,
idempotent, and completed before coaches receive their link. A shared password,
manual role repair per coach, or hidden test route is a release failure.

## Fresh coach and client journey

Record a pass, friction, or failure for every numbered step.

1. An administrator prepares a batch containing the fresh coach email.
2. The coach opens the supplied `/login?callbackUrl=/coaching` link and signs in
   with Google or their own Quipsly email.
3. Quipsly lands on Coaching, shows a useful empty state, and explains the next
   action without mentioning fixtures, Patreon internals, or staff repair.
4. The coach creates a client relationship and sends an invitation from the
   normal UI.
5. The client opens that exact invitation while signed out, understands who
   invited them and what access will be granted, signs in with the invited
   identity, accepts, and reaches the lobby. The invitation must not grant the
   surrounding Nest.
6. Coach or client schedules the next Session, confirms time and timezone, and
   can see the appointment in the shared space.
7. Both participants open the lobby, select and preview microphone, camera, and
   output, understand consent, and join without starting a recording silently.
8. Each participant records a local high-quality source while the real-time call
   remains usable. Disconnect, refresh, backgrounding, and delayed upload have
   visible recovery states.
9. Quipsly uploads and associates sources with one Session timeline, retains
   provenance and sync evidence, and never represents an unverified upload as
   safe.
10. The Session produces a speaker-attributed transcript with confidence or
    review visibility. A person can correct speaker assignment and text without
    changing the immutable media source.
11. Coach and client can create, edit, assign, complete, and find shared notes,
    tasks, and goals from the Session. Suggested outputs remain reviewable until
    a person accepts or edits them.
12. A permitted user can make a light edit, preview the result, and share the
    selected recording and transcript with an explicit audience. Revocation and
    privacy state must remain understandable.
13. Both users can return later from ordinary Coaching navigation and find the
    relationship, Session, recording, transcript, notes, tasks, and goals.

## Cohort-scale checks

Before inviting 50 coaches:

- provision a mixed batch of new and existing emails and verify exact created,
  refreshed, and failed counts;
- rerun the same batch and prove it is idempotent;
- prove one coach cannot discover another coach's clients or Sessions;
- prove one client cannot reach the coach's Home Nest or unrelated clients;
- exercise expired, revoked, already-used, wrong-account, and resent invites;
- verify support diagnostics identify the exact identity, access grant, Session,
  recording, upload, transcript, and share state without exposing private media;
- verify mobile layouts, VoiceOver/keyboard focus, slow-network states, and
  recovery copy on the critical journey;
- keep a rollback path and an auditable receipt for every cohort access change.

## Evidence required for a release claim

A green build or seeded script is not enough. The release note must name:

- the candidate commit and environment;
- the fresh coach and client QA identities (never their passwords);
- the UI-created relationship, invitation, and Session receipts;
- call/capture duration, source count, upload verification, and sync result;
- transcript attribution and correction result;
- notes, tasks, goals, light-edit, and share readback;
- privacy negative tests;
- every remaining friction point and its severity.

The retained regression lane should continue to run. It complements this gate;
it never replaces it.

## Invitation delivery checkpoint — 2026-08-19

The ordinary Session and Coaching interfaces now treat delivery as a product
operation instead of an instruction the coach must remember:

- creating an appointment remains separate from contacting the client;
- **Send invitation email** is the primary handoff action after creation and on
  every upcoming coaching card;
- copy and system share remain visible recovery paths;
- the existing one-time, expiring, exact-email, Session-only token remains the
  authority boundary;
- every email attempt begins with a durable delivery receipt and completes as
  `SENT` or `FAILED`; acceptance remains a separate state;
- provider requests use an idempotency key, and a client request ID prevents a
  network retry from creating another email operation;
- provider rate limiting becomes a visible retry/fallback state and never
  pretends the client received mail.

Unit and route tests may stub the delivery provider. That is regression-lane
evidence only. The fresh-user lane must use two real inboxes, open the delivered
message, and record delivery, wrong-account, acceptance, resend, expiry, and
revocation results. A copied local link is useful while developing, but it is
not mailbox-delivery proof.

The retained invitation operation passed again after its navigation was changed
to match the product order: prepare and invite first, then enter the live call.
That run proved wrong-account denial, one-time acceptance, two-browser provider
presence, Session chat, access removal/provider reconciliation, restoration,
and append-only history. It still reports `externalInvitationSent: false`.

A subsequent fully fresh browser flight (`8c89bcf4`) passed signup, coach setup,
appointment creation, two-endpoint call, two independently verified retained
sources with 4.275 seconds of overlap, participant-attributed transcript and
protected playback, shared/private relationship work, cross-account task
completion, light edit, explicit client release/playback, and revocation. The
first attempt found a real form failure: the relationship-work form used a
React form action wrapper that could fall through to same-page navigation
without persisting the note. The form now prevents native submission explicitly
and the complete fresh flight passed from scratch. This remains automation, not
novice-human or real-mailbox proof.

The iPhone Coaching home now uses the same durable Session invitation operation
as Nest. **Send invitation email** is the primary action on an exact upcoming
appointment; the iOS share sheet remains a recovery path. A transport-ambiguous
request ID survives app termination and is reused until the server gives a
definitive response, so relaunching cannot turn an uncertain response into an
unrelated second email operation. The Coaching runway projects the exact
client's latest delivery receipt back to the phone after reload and keeps
`SENT`, `FAILED`, and acceptance distinct. The current candidate passed an iOS
simulator build and operated Coaching-home UI test plus the focused server
delivery/projection suite. Preview mode showed the real primary and fallback
controls but kept external sending disabled. No physical phone, provider-backed
mailbox delivery, or human invitation acceptance is claimed by that run.

### Production delivery configuration readback — 2026-08-19

The deployed `studio` service currently has neither
`QUIPSLY_SESSION_INVITATION_RESEND_API_KEY` nor `RESEND_API_KEY`. Its Google
Calendar projection is configured with `GOOGLE_CALENDAR_SEND_UPDATES=none` and
`GOOGLE_CALENDAR_INCLUDE_ATTENDEES=false`. Therefore Quipsly can create the
private invitation and expose copy/share recovery, but production has not yet
proved automatic invitation delivery through email or a Calendar attendee
notification. Do not hand this build to a minimally instructed cohort until a
provider-backed message reaches a real client inbox and acceptance, resend,
expiry, wrong-account, and revocation readback pass.

## Implementation checkpoint — 2026-08-19

- Ordinary Coaching and Session surfaces no longer name retained people,
  retained Episodes, or the `.dev.test` reviewer preset.
- Unsigned coaching and Session links preserve the exact destination through
  sign-in; Session invitation review is outside the general beta gate.
- Active Session or coaching-engagement grants can enter their narrow product
  surface without a Patreon or broad Nest grant. Route-level authorization
  continues to enforce the actual Session and relationship boundary.
- Administrators can prepare up to 100 coach identities in one idempotent batch
  without creating shared passwords. A dedicated admin-only test-login card
  remains separate from this cohort path.
- First-time coach setup is first on narrow screens, detects the device timezone,
  and does not require a price or Stripe configuration.
- The full optimized Quipsly production build passed after repairing the Nest
  settings page to await Next.js 16 route parameters.
- The generated coaching API regression now begins as a non-staff user, uses
  the ordinary self-service coach setup action, labels itself
  `api-regression`, and reports `humanAcceptanceSatisfied: false`. It no longer
  elevates its generated coach to OWNER or silently stands in for this gate.
- That regression exposed and repaired a cohort-blocking role leak: `COACH`
  had been included in the broad Studio authority helper, which made every
  coach `isStaff` and exposed cross-coach runway data. Product entry is now
  intentionally broader than Studio/staff authority. A coach can enter
  Quipsly, while only OWNER and TEAM_SCHEDULER retain the global Studio bypass.
- A local canonical-data run passed for an ordinary generated coach and a
  separate client: self-service setup, hold/release, booking conversion,
  client visibility, payment hold, private calendar export, consent
  decline/grant, recording unlock, reschedule, cancel, and exact generated
  artifact cleanup. The runner also has a narrowly validated interrupted-run
  recovery command for eight-character generated suffixes.

This checkpoint proves source, route, and build readiness. It does not yet claim
the fresh coach/client journey or real call/capture/share journey has passed;
those still require the operated evidence listed above.

## Rendered UI automation checkpoint — 2026-08-19

Test lane: `ui-automation`

Human acceptance satisfied: **no**

An isolated ordinary coach and separate client were created with generated,
verified credentials and operated through the rendered local product. No staff
role, known Session ID, retained project, database mutation, or QA login shortcut
was used after sign-in.

The operated run proved:

- the new coach created an account through the public email/password form and
  signed in through the ordinary coaching callback;
- coach setup was completed from the rendered first-run form;
- the coach scheduled a real coaching Session for the separate client;
- Quipsly returned the exact private Session handoff and both identities could
  open the same room without surrounding staff or Nest authority;
- the live room now places microphone/camera/call controls first, keeps iPhone
  handoff visible, and collapses source-retention diagnostics behind an explicit
  troubleshooting disclosure;
- the client created a Session-shared task and goal through the rendered Work
  surface;
- the coach read the same task as work created by another participant and could
  not open it as if they owned it;
- the coach created a client-safe note and the client read the same canonical
  note as read-only with the coach attribution intact;
- ordinary accounts no longer see staff test lanes, Admin Users, or auth
  diagnostics on the account-switch surface.

Because the generated `dev.test` mailbox cannot receive mail, the local Firebase
Auth emulator marked that one disposable address verified after the public
signup completed. That is an explicitly recorded test-lane adapter, not a
product shortcut and not evidence that real mailbox delivery has passed.
The exact-suffix recovery command now honors `FIREBASE_AUTH_EMULATOR_HOST`; a
separate auth-only probe proved it deletes the matching emulator identity
without making any human account eligible.

The operation also found and repaired first-run friction that contract tests did
not reveal: Quipsly now pre-fills the known coach identity, proposes a useful
next-day Session time, treats payment as optional rather than a mandatory-looking
journey step, and keeps the appointment controls ahead of diagnostics on narrow
screens. A follow-up readback caught the new appointment falling back to
`America/Los_Angeles` even after the coach selected `America/Denver`; the
ordinary appointment form now carries the coach-profile timezone explicitly,
shows it beside the local time, and sends it with the booking request. A second
fresh rendered run then created an appointment that displayed
`America/Denver` in the ordinary Upcoming Sessions card.

That second run also exposed acceptance-fixture language and provider internals
on the ordinary coach home. Staff readiness, receipt, Stripe, calendar-provider,
tentative-hold, lifecycle, and safety-copy evidence is now isolated behind a
staff-only operations disclosure. The coach-facing cards retain durable primary
actions after reload: Open Session, Coaching home, client invite, iCalendar,
Transcript & notes, Review & share, and collapsed reschedule/cancel controls.

A third disposable coach/client run operated the account-bound client entry as
the product actually presents it today:

- the coach created a fresh appointment and copied the client entry from the
  rendered confirmation;
- the signed-out client entry explained the private Session and preserved its
  exact callback through public account creation and mailbox verification;
- the invited client returned to that exact Session, ran browser audio
  preflight, joined the local LiveKit room, and disconnected cleanly;
- the client explicitly saved a recording/transcription consent receipt and
  opened the shared coaching home with its Session, shared goals, and shared
  commitments visible;
- exact-suffix cleanup removed one room, booking, appointment, engagement,
  calendar link, two narrow grants, two Home Nests, two memberships, two local
  users, and both local Firebase Auth identities. No human identity was
  eligible.

The operated preflight found one transcription-consent checkbox selected by
default. It is now opt-in. A fresh reload proved headphones attestation,
all-audible-participant consent, and transcription consent all begin unchecked.
Joining a conversation remains separate from starting or consenting to a
recording.

Separate regression-lane proof then used the fixed local mobile-coaching QA
identities. Both independently obtained room-scoped join authorization, reached
the same loopback LiveKit room, observed mutual presence, and delivered one
reliable coach-to-client data receipt with the authorized participant identity.
That operation retained its QA artifacts for inspection and explicitly reported
`consentStarted: false`, `recordingStarted: false`, no calendar/payment mutation,
and no external invitation. It proves two-endpoint signaling and authorization;
it does not prove human audio/video quality or replace fresh-user acceptance.

This is stronger evidence than an API smoke but still does not satisfy the
novice-human gate. It did not prove invitation-token acceptance, a two-endpoint
media call, local high-quality capture, upload/sync, transcript generation and
correction, light editing, sharing/revocation, accessibility, or 50-coach load.
The account-bound booking entry is proven locally; the separate reusable
engagement-invitation-token path and real mailbox delivery are not.

## Relationship-work checkpoint — 2026-08-19

The shared coaching home now operates as a relationship workspace instead of
only displaying work that originated elsewhere:

- a coach, client, or support member can create a note, task, or goal without
  knowing a Session or database identifier;
- tasks and goals are explicitly assigned to an active relationship member and
  cannot be assigned to an unrelated account;
- shared notes persist at the coaching-engagement boundary across Sessions;
  private notes are returned only to their author;
- permitted members can edit and reassign shared work, complete and reopen
  tasks, and achieve and reopen goals;
- mutations use stable request identities, optimistic concurrency, append-only
  edit receipts, and make no messaging, reminder, calendar, or publication
  claim;
- the empty-state form asks only the choices relevant to the selected item:
  note audience for notes, or owner and optional target date for tasks/goals.

The retained browser operation created one shared note, one client-owned task,
and one client-owned goal through the rendered coaching home, completed the
task, read the exact canonical records back, preserved the engagement chat, and
confirmed a separate account received HTTP 404 without seeing the relationship
title. It reports `testLane: retained-regression`,
`humanAcceptanceSatisfied: false`, and `fixtureIdentifiersUsed: true`. This is
durable regression evidence only. A fresh, minimally instructed coach/client
pair still needs to repeat the workflow for release acceptance.

### Fresh compiled-iPhone relationship path — 2026-08-20

The iPhone Coaching home no longer ends at an inert client-space card. A coach
can open the canonical relationship, filter its notes, tasks, and goals, create
and edit those items, assign tasks and goals to an active member, complete or
reopen them, and keep an author-private note visibly private. Nest and Capture
use the same engagement records; the phone does not maintain a parallel task or
note model.

The fresh-phone operation starts with a generated ordinary identity but then
uses only the compiled app and ordinary navigation for coach setup, scheduling,
invitation recovery, relationship entry, work creation, and Session entry. Its
receipt independently reads the exact relationship, shared note, task, goal,
private note, and Session from the canonical APIs. The receipt continues to say
that real mailbox delivery, a physical iPhone, minimally instructed humans, and
50-coach scale are unproved. Those claims belong only to the separate human
flight and cohort lanes.

## Minimal-instruction Session path — 2026-08-19

The coaching Session overview now leads with the four jobs most coaches need:

1. invite the client and check devices;
2. hold the call and record retained local sources;
3. review the source-backed transcript;
4. assemble and release the client-safe follow-up.

One primary action points to the first incomplete job. Completion is projected
from canonical participant, substantial-recording, transcript, and released
follow-up evidence. Downstream historical artifacts cannot make the path appear
complete while the retained recording is still below the production-readiness
gate. The eight deeper Session modes remain available as optional review and
troubleshooting tools.

A rendered local regression confirmed the path on the retained coaching
Session, correctly selected **Call and record** as the next action, held older
transcript and follow-up evidence behind the current source gate, and fit a
390-pixel viewport without horizontal overflow. This remains regression-lane
evidence; a minimally instructed fresh coach still must complete all four jobs.

## Two-endpoint call and retained-capture checkpoint — 2026-08-19

Test lane: `retained-regression`

Human acceptance satisfied: **no**

The rendered browser operation now exercises two separately authenticated
participants at the same time instead of treating two API grants as a call. It
uses one desktop-sized coach context and one phone-sized client context, joins
both to the same local LiveKit room, requires both rendered rosters to show two
participants, sends a collaboration message from coach to client, saves each
participant's own consent receipt, and starts two independent local-source
recorders concurrently. The operation then verifies exact bytes, checksum,
participant ownership, start/stop times, and at least two seconds of source
overlap in canonical PostgreSQL records. It never starts provider recording.

One cold operation exposed a clean client-requested disconnect of the coach
endpoint before the client arrived; a second cold operation repeated it. The
failure was traced to the local Next development server compiling the second
device route and remounting the already joined first page. The operation now
finishes both rendered device lobbies before either endpoint joins the measured
call. A fresh cold run then passed call, chat, both consent receipts, and two
independently owned sources with 4.133 seconds of overlap. This is a local
development warm-up boundary, not a reconnect retry and not evidence that
production disconnect recovery has passed.

The operation's result now always names its boundary with
`testLane: retained-regression`, `fixtureIdentifiersUsed: true`, and
`humanAcceptanceSatisfied: false`, and returns the exact verified source IDs.
Failure output includes the rendered roster, live status text, buttons, and URL
instead of only a timeout. It also reuses durable participant rows across runs.
The earlier delete-and-recreate behavior silently detached old source evidence
from its participant through the schema's `SetNull` policy; rerunning the
regression no longer damages prior ownership evidence.

This checkpoint proves repeatable local call and source mechanics. It does not
prove real speech quality, physical device routing, production disconnect
recovery, light editing, delivery, revocation, physical iPhone behavior, or
novice discoverability. Those remain fresh-user and physical-device acceptance
work.

## Participant-attributed transcript checkpoint — 2026-08-19

Test lane: `retained-regression`

Human acceptance satisfied: **no**

A fresh two-endpoint capture produced two transcription-released sources owned
by different participants. The ordinary rendered Session transcript surface
observed both background jobs transition to **Completed** without a manual
refresh, selected each exact recording source, and exposed the source-routing
explanation in the correction desk. Both jobs preserved their immutable local
Whisper provider evidence while separately recording that the source topology
was `participant-isolated` and speaker authority was `source-binding`. The
projected transcript therefore identified one source as the retained client and
the other as the retained coach without inventing diarization evidence.

The same rendered path then prepared protected playback for each exact source,
decoded and advanced both media streams through Quipsly's authenticated media
route, and downloaded an effective transcript file for each source. Each file
retained the transcript job identity and source-bound participant label and
explicitly disclosed `Playback-reviewed turns: 0/1`. The operation did not
check the human confirmation box or create a correction receipt, because a
headless browser decoding audio is not evidence that a person heard it.

The exact operated sources were `cmt0p0kq6002dlnxllr3ra1pi` and
`cmt0p0krm002ilnxlqbgvdy8g`; their transcript jobs were
`cmt0p0kq8002flnxl7da0o13e` and `cmt0p0krq002klnxl8ylwt21w`. Both contained one
timed segment. The Playwright fake audio source caused local Whisper to emit a
short `Thank you.` hallucination, so this run proves routing, lifecycle, source
selection, and visible attribution—not real-speech accuracy. It also does not
prove human playback review, correction acceptance, light recording editing,
sharing, revocation, or novice discoverability.

The retained scripts remain deliberately fixture-based. Their output reports
`fixtureIdentifiersUsed: true` and `humanAcceptanceSatisfied: false`; these
checks catch regressions quickly but cannot release the 50-coach cohort. The
numbered fresh coach/client journey above remains the human acceptance gate.

## Recipient-bound recording share checkpoint — 2026-08-19

Test lane: `retained-regression`

Human acceptance satisfied: **no**

The ordinary Session Outputs surface now provides a mobile-first light-edit
journey for coaching recordings. It chooses the newest time-coherent take,
defaults to one local master per participant, names the intended client, lets
the coach set a common start/end range, and queues a non-destructive derived
AAC copy. The coach can preview or download the private draft, must explicitly
confirm that they listened and intend to release it to the named client, and
can later revoke access. The client can play or download only a released copy.

The derived-file worker binds its job to the exact source IDs, sizes, SHA-256
digests, storage generations, Session-clock offsets, edit range, output
revision, and recipient-bound output. FFmpeg aligns the sources, mixes and
levels the selected window, verifies AAC-LC stereo at 48 kHz, performs a full
decode, and writes an immutable receipt. A crash after file creation can reuse
only an exact matching file and receipt; it cannot overwrite an existing
target. Reconciliation creates a deterministic derived RecordingAsset and an
append-only output revision before release is allowed.

The operated run used the two retained participant sources from the preceding
call checkpoint. It created a 28,083-byte derived recording with SHA-256
`7bf9916f89654e5f1f9ce2fd0c72c0f48f59345cd2bc752eb9e081a00282d16d`,
decoded and advanced it in a desktop coach context and phone-width client
context, returned HTTP 200 to the exact recipient after release, and returned
HTTP 404 after revocation. Release and revocation created separate durable
delivery events. Repeating either visibility request with the same request ID
returned an idempotent replay and did not duplicate either event. The browser
retains a request ID after an uncertain network failure so a person's retry
converges on the same decision. Both original source checksums remained
unchanged.

The run also repaired three product-path faults that source-level tests did not
expose: repeated calls in one room were initially merged because a room-level
capture group is not a take identity; macOS `/var` and `/private/var` aliases
were initially treated as different authorized roots; and PostgreSQL required
explicit parameter casts in the worker lease and failure receipts. Regression
coverage now keeps repeated calls separated by a bounded source-start cluster,
and path normalization retains both configured-root and canonical-root
confinement checks.

This proves the local audio light-edit, private preview, recipient release, and
revocation mechanics. It does not prove a cloud renderer, video conform,
waveform editing, real human listening, physical iPhone sharing, real-speech
quality, accessibility, or novice discoverability. The operation reports
`testLane: retained-regression`, `fixtureIdentifiersUsed: true`,
`humanAcceptanceSatisfied: false`, `realSpeechAccuracyProven: false`, and
`freshNoviceJourneyProven: false`. It cannot satisfy the 50-coach release gate.

Regression labels and cohort-gate language remain in this evidence report and
machine-readable operation output only. The ordinary recording card explains
the coach/client privacy boundary in product language and does not expose test
fixtures, test lanes, or internal release bureaucracy to either participant.

## Fresh minimally instructed start checkpoint — 2026-08-19

Test lane: `fresh-ui-automation`

Human acceptance satisfied: **no**

A phone-width operation now starts without a known room, booking, engagement,
user, or fixture identifier. It creates a new disposable coach through the
public account form, completes the simplified coach profile, schedules a named
client through the rendered appointment form, and presses the same **Send
invitation email** action a real coach uses. Reserved `.dev.test` recipients are
refused before any provider request; the UI records the failed local delivery
and retains its copy/share fallback. The operation then follows the generated
one-time invitation through the signed-out join page, creates the exact invited
account, presses **Accept and open lobby**, and returns to the Session. The
one-time token is consumed and never written to the retained artifact. Read-only
database assertions confirm the `COACH` role record, absence of client staff
authority, requested timezone, participant identities, booking, room, and
durable coaching engagement, accepted invitation, consumed token, and failed
local-only delivery receipt.

The passing run created room `cmt0rj54f005fzvxl4gtqhbqb`, booking
`cmt0rj54b005ezvxlwo2sqa3m`, and engagement
`cmt0rj53v005azvxleni0j6so`. Its continuation context is retained with mode
`0600` at
`artifacts/coaching-acceptance/7e092367/fresh-start-context.json`; passwords are
stored only in macOS Keychain and are never printed or written to that file.
The product forms were exercised at 390 by 844 CSS pixels with no horizontal
overflow. The flight also removed a nested main landmark, gave the appointment
its own semantic region, and made optional offer, pricing, hold, purpose,
timezone, and payment choices progressive disclosure rather than onboarding
requirements.

Because the local Firebase Auth emulator cannot deliver mail, the operation
explicitly marks only its newly created `.dev.test` accounts verified through a
local mailbox adapter after first proving the public flow did not bypass
verification. The result reports `fixtureIdentifiersUsed: false`,
`humanAcceptanceSatisfied: false`, `realMailboxDeliveryProven: false`, and
`callCaptureTranscriptShareProven: false`. This is a repeatable fresh UX flight,
not evidence that 50 minimally instructed humans can yet complete the journey.
The retained regression fixtures remain separate and continue to prove deeper
mechanics while this fresh context becomes the input to call, capture,
transcription, correction, follow-through, light edit, and sharing acceptance.

## Complete fresh coaching flight checkpoint — 2026-08-19

Test lane: `fresh-product-automation`

Human acceptance satisfied: **no**

`pnpm quipsly:fresh:coaching-flight` now creates a new coach and client and
passes one private context from the rendered start through every deeper
operation. The source context remains `fresh-ui-automation`, but the combined
receipt is deliberately `fresh-product-automation`: signup, setup, scheduling,
entry, call controls, relationship work, and sharing use rendered product
surfaces, while transcript execution and protected authorization readbacks also
exercise browser-initiated service mechanics. It is not labeled as pure UI
automation. It does not accept or construct a retained room ID. The second full
run created room `cmt0rwb6o008bzvxl2i0s9bd0`, booking
`cmt0rwb6l008azvxl1pryhbec`, and engagement
`cmt0rwb690086zvxlvrm46zwk`, then proved:

- two independently signed-in participants connected to the same LiveKit room;
- both chose recording and transcription consent and exchanged Session chat;
- two participant-owned local sources were byte-verified with 4,562 ms of
  overlapping Session time;
- both sources reached completed, source-attributed transcript jobs, protected
  playback decoded, and the product generated transcript downloads;
- the client created a shared note, an author-private note, a task, and a goal
  from the coaching home;
- the coach could not see the private note, completed the shared task, and the
  client observed that change after returning;
- Quipsly created a non-destructive light edit, the coach previewed it privately,
  explicitly released it to the client, the client decoded it at phone width,
  and revocation changed recipient media access from HTTP 200 to HTTP 404;
- original source checksums stayed unchanged and no fresh-context database
  repair was performed outside the ordinary product writes.

The continuation file is private (`0600`), contains no password, and is used
only to name what the rendered UI already created. Retained fixtures still run
without that environment variable and remain a separate regression lane.

This full flight uses the local mailbox adapter and browser-generated media. It
therefore does **not** prove real email delivery, physical-device routing,
real-speech transcription quality, human listening, accessibility, novice
discoverability, production infrastructure, or 50-coach scale. Its combined
result keeps all of those claims false.

## Fresh native recovery and Studio handoff checkpoint — 2026-08-19

Test lane: `fresh-native-recovery-automation`

Human acceptance satisfied: **no**

`pnpm quipsly:fresh:coaching-native-recovery` now creates a new coach, client,
booking, relationship, and Session through the rendered public product before
launching Quipsly Capture. It does not accept a retained room or known fixture
identity. The native operation saves each participant's ordinary consent,
records with `AVAudioRecorder`, plays the finalized local source, kills the app
during a second take, proves protected offline relaunch and playback, returns
online, records a reasoned append-only decision for the undecodable interrupted
take, and continues the verified source into Studio.

The passing `b4e47d6d` run created room `cmt0vpn9900serdxlskqwa92q`, booking
`cmt0vpn9600sdrdxl4w23etmf`, and engagement
`cmt0vpn8p00s9rdxl0a335w8y`. The app first showed **Attach to Studio**, performed
that ordinary action, refreshed, and only then showed **Review in Studio**.
Read-only canonical verification confirmed production
`cmt0vtqle00ubrdxlkg54enpa`, boundary kind `coaching-session`, one verified and
released RecordingAsset, its exact StudioMediaAsset, and the project attachment
role `spine-audio-candidate`. The private receipt is retained at
`artifacts/coaching-acceptance/b4e47d6d/native-capture-recovery-receipt.json`.

A second fresh run, `6f32ec15`, passed after strengthening the flight's final
postcondition. The coach's ordinary authenticated Sessions projection had to
read back production `cmt0w0yex00wvrdxl3393xr0j`, the canonical coaching slug,
capture group `e0074c3a-c878-4ad1-a148-20895c3de30f`, RecordingAsset
`cmt0vzh5700vprdxlv88vxo30`, StudioMediaAsset
`cmt0vzh5000vordxlxg5p6bl8`, exact-byte verification, and released processing.
The reusable command now fails if the UI changes its badge without that complete
source-to-production projection. Its private receipt is retained at
`artifacts/coaching-acceptance/6f32ec15/native-capture-recovery-receipt.json`.

The current `ff9bdf63` candidate passed the same fresh operation as run
`69e09be5`, creating room `cmt0xz3i600802cxlubgi2k9x` without a fixture ID. It
verified and released RecordingAsset `cmt0y1kbf008r2cxlu269x2dh`, preserved the
process-killed second take without claiming its bytes were playable, and read
back Studio production `cmt0y311200a02cxlyqgjsnd7` with capture group
`e64f1b01-a479-4855-baf3-c4923389c28a`. The result bundle and private receipt
are under `artifacts/coaching-acceptance/69e09be5/`. The run remains simulator,
generated-audio, and automation evidence; every physical-device, natural-human-
speech, human-listening, novice-discoverability, and production-scale boundary
is explicitly false.

The failed runs remain useful evidence rather than being hidden:

- `09515842` exposed that first-install microphone permission can return the
  person to Today while recording is active. The persistent global recording
  banner already provided recovery; the operation now follows that visible
  affordance instead of assuming the recorder stayed foregrounded.
- Recovery flights build first, install into a fresh simulator app container,
  then pregrant microphone access and record both harness boundaries explicitly.
  They prove recorder interruption and source recovery without stale app state,
  not first-run permission-prompt comprehension; that remains a physical-device
  and minimally instructed human-flight requirement.
- Xcode DerivedData remains a reusable ignored compiler cache under `.tmp`.
  Per-run acceptance artifacts retain the result bundle and receipt, not another
  gigabyte-scale copy of rebuildable compiler output.
- The native recovery receipt records the exact 40-character Git source SHA and
  whether tracked source was clean when the flight began. A passing behavior
  run without that source identity is diagnostic evidence, not release proof.
- `c18e4114` exposed a real product dead end: ingest had minted media, but the
  Session had no production/editor container, so neither a truthful review
  destination nor a working attach action existed.
- `3aa64070` exposed a cross-runtime SwiftUI accessibility mismatch for the
  review Link. The operation now uses the stable identifier plus the visible,
  class-independent action label.
- `9f143d93` exposed a more important false-positive: fallback episode metadata
  was being treated as proof that a production existed. The mobile contract now
  carries the explicit `episodeProductionId`; a media asset and a navigation
  slug can no longer make the UI claim a durable Studio destination.

Resolved interrupted-capture evidence remains visible with its exact reason and
revision, but no longer blocks the verified required source. No bytes are called
playable when iOS cannot decode them, and the decision neither deletes the
receipt nor rewrites the source plan's history.

This checkpoint uses an iOS Simulator and synthetic silence. It keeps
`physicalDeviceProven`, `naturalHumanSpeechProven`, `humanListeningProven`,
`noviceHumanAcceptanceProven`, and `productionScaleProven` false. It makes the
candidate eligible for physical-device and minimally instructed human testing;
it does not replace either.

## Minimally instructed human flight

The concise operator handoff is
[`coaching-human-flight-runbook.md`](./coaching-human-flight-runbook.md). This
section remains the authoritative acceptance rationale and evidence history.

Give a coach only this sentence:

> Use Quipsly to invite this client, schedule and record a coaching Session,
> keep a shared note, task, and goal, then lightly edit and share the recording
> and transcript with the client.

Give the client only the invitation produced by the coach. The observer may
stop an unsafe action, but must not name a menu, route, hidden prerequisite, or
workaround. Record where each person pauses, mispredicts an action, asks for
help, abandons the path, or cannot explain the current privacy/recording state.
The test uses real inboxes, real devices, natural speech, and ordinary product
navigation; it never starts from an artifact context or a copied database ID.

A human pass requires both people to return later and independently find the
appointment, coaching home, Session, recording, transcript, shared work, and
recipient visibility state. Automation failures block the candidate before a
human sees it. Automation success merely makes the candidate eligible for this
human flight; it never marks this section complete.

## Fresh iPhone start checkpoint — 2026-08-20

`npm run quipsly:fresh:coaching-phone-start` begins with one newly verified
ordinary disposable account and no coach profile, relationship, appointment,
or room. A clearly labeled loopback Firebase adapter creates and verifies only
that identity. The compiled iPhone app then discovers Coaching from Today,
sets up the coach, creates the exact client identity and private relationship,
schedules a uniquely titled appointment, attempts the invitation, retains the
system Share fallback, and opens the exact canonical Session. Independent API
readback must find the same coach role, engagement, booking, room, client entry,
and custom title.

Clean source `9d8f9e38251871393df783c7fff29849a082ff7f` passed as run
`8f44b4b6`, creating engagement `cmt1h1j8v01o62cxl5gnbnxjo`, booking
`cmt1h1j9701oa2cxlp191qaja`, and room `cmt1h1j9d01ob2cxlfcf8vv5w`.
The private receipt is
`artifacts/coaching-acceptance/phone-start-8f44b4b6/phone-start-receipt.json`.
The `.dev.test` invitation was intentionally stopped before external mail and
recorded `LOCAL_TEST_RECIPIENT`; the phone visibly retained Share and Session
entry. This run repaired two low-instruction UX/accessibility problems it
exposed: the just-created appointment no longer duplicates its actions in both
the handoff and Upcoming cards, and the card container no longer competes with
the distinct Send, Share, and Open controls.

The receipt keeps real mailbox, physical iPhone, minimally instructed human,
and fifty-coach scale proof false. It is a product-path regression gate, not a
substitute for the one-sentence human flight.

## Acceptance lanes are not interchangeable

Every result must name exactly one lane. A passing lower lane never promotes
itself into a higher claim.

| Lane                              | Starts from                                                          | Proves                                                                                                                                       | Explicitly does not prove                                                     |
| --------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Retained regression               | Reserved fixture identities and durable fixture rooms                | Known mechanics have not regressed                                                                                                           | Discoverability, onboarding, or fresh-account integrity                       |
| Fresh UI automation               | New `.dev.test` accounts created through rendered public pages       | The ordinary product can create and continue a new coaching relationship without copied IDs or database repair                               | Real inbox delivery, natural speech, physical devices, or human understanding |
| Fresh phone automation            | New verified ordinary account with no coaching records               | The compiled iPhone UI can set up a coach, schedule and invite a client, and enter the exact canonical Session without seeded rooms           | Real mailbox delivery, physical-device behavior, or human discoverability     |
| Fresh audible automation          | Fresh UI automation plus two isolated, role-specific audible sources | Each participant owns a distinct recording; Whisper recovers role-specific speech; protected playback and downstream share mechanics operate | Natural speech quality or a human playback-review receipt                     |
| Minimally instructed human flight | Real inboxes, ordinary navigation, real devices, and one sentence    | A coach and client can understand and complete the end-to-end job without guidance                                                           | Fifty-person concurrency or organization-wide support readiness               |
| Cohort operation                  | Instrumented 2, then 10, then 50-coach release                       | Recovery, support, privacy, and capacity remain healthy under real use                                                                       | That future product changes remain safe without rerunning the ladder          |

The 2 → 10 → 50 progression is an operational safety valve, not a committee.
Advancement is automatic when the prior group has no unresolved data-loss,
privacy, invitation, call-entry, recording-finalization, or recipient-access
failure and the recovery path has been exercised. Cosmetic friction becomes a
ranked product fix; it does not silently become a release-blocking approval
ritual.

## Controlled audible speech checkpoint — 2026-08-19

`pnpm quipsly:fresh:coaching-speech-flight` extends the fresh journey without
reusing a fixture. It creates two owner-readable audio artifacts in the same
private acceptance directory as the fresh context, launches one isolated
Chromium process per participant, records both sources concurrently, and
requires the local Whisper worker to recover terms spoken only by the matching
role. The command fails if either participant source is absent, not independently
owned, does not overlap the other source, cannot be decoded, or loses its
role-specific terms.

The passing run retained context
`artifacts/coaching-acceptance/8ff229b4/fresh-start-context.json` and created
room `cmt0s887r000lrdxl5jch5xhq`, booking
`cmt0s887h000krdxlgh85iojw`, and engagement
`cmt0s886t000grdxlt65j81tq`. It verified two participant-owned masters with
23,241 ms of overlap, two completed source-bound transcripts, protected
playback, shared/private relationship work, cross-account task completion, and
preview → release → recipient playback → revoke.

This lane uses macOS text-to-speech and browser fake-media routing. Its result
therefore keeps `naturalHumanSpeechProven`, `humanListeningProven`,
`physicalDeviceProven`, `realMailboxDeliveryProven`,
`minimallyInstructedHumanAcceptanceProven`, and `productionScaleProven` false.
Automation plays and decodes protected media but does not tick the product's “I
listened” control or create a `TranscriptSegmentVerification`; that receipt is
reserved for the person who actually listened.

## Production web checkpoint — 2026-08-19

The production schema is current through
`20260820033000_fix_invitation_delivery_index_name`. The guarded release first
replayed the complete migration chain in a disposable Cloud SQL database,
verified zero schema drift, created production backup `1787197023921`, applied
the migration, and verified zero production drift. The disposable database and
job were removed after their exact identities were read back.

Exact web source `a82a64d0484268dcb4f85a183f0cb628ce9f791d`, image digest
`sha256:79f5d95f823244b1af2ca5529fd22688ba1c2d6161db488a98792750139b090a`,
and Cloud Run revision `studio-00504-giw` passed the no-traffic preview,
authenticated database-backed Session smoke, configured-host checks, and
post-promotion recovery gate before receiving 100 percent production traffic.
The service may scale to two instances so one unavailable instance no longer
exhausts the entire login and Session service.

The first authenticated preview smoke failed because its retained assertion
still required the removed labels `Edit timeline` and `Live cut`. The rendered
Episode Room correctly exposed the calmer canonical workflow: `Plan &
collaborate`, `Record`, and `Edit`. Release tooling commit `eb30417b` now checks
those visible labels and their exact canonical destinations. It does not
restore obsolete product jargon to satisfy a fixture. The repaired smoke then
passed the same immutable preview before promotion.

A normal Chrome network probe reached Firebase and returned the intended
friendly invalid-account response for synthetic credentials. The isolated
in-app browser returned `auth/network-request-failed` for the same operation,
so that result is classified as test-harness failure rather than product auth
failure. The signed-in production coaching response returned the real dashboard
with `Set coach profile`, `Create session`, `Meet and record`, `Review and
share`, `Upcoming sessions`, `Capture rooms`, `Schedule a Session`, and
`Requests`, and contained no retained acceptance account or release-smoke
marker.

This checkpoint proves deploy integrity and a real persisted reviewer journey.
It does not prove a minimally instructed human flight. Durable invitation
receipts and copy/share recovery are live, but automated real-mail delivery
remains disabled until a sender domain and provider credential are configured;
`realMailboxDeliveryProven` therefore remains false.

## Production authenticated-read capacity checkpoint — 2026-08-19

`pnpm quipsly:production:coaching-capacity` is a bounded, read-only production
probe. It authenticates one dedicated test account once, then gives each
virtual coach the same three reads a newly opened coaching workspace needs:
coaching runway, Session index, and Today. The command accepts only
`nest.quipsly.com` or a loopback origin, caps the virtual-coach count at 100,
prints status and latency evidence, and exits nonzero if any read fails.

The 2-coach floor passed 6 of 6 reads with 1,575 ms p95. The 10-coach floor
passed 30 of 30 reads with 6,827 ms p95. The 50-coach floor correctly failed:
65 of 150 reads returned HTTP 500 or exceeded the 20-second bound. Cloud Run
system evidence identified the first hard cause: an instance used 522 MiB and
was killed by its 512 MiB limit. The deployed service also combined concurrency
80 with a two-instance maximum, allowing a single Next process to absorb an
unsafe share of the burst.

The 50 gate remains failed. The proposed repair is 1 GiB memory, concurrency
20, and maximum four scale-to-zero instances, followed by the same 2 → 10 → 50
probe. Even a repaired 50-coach read floor will keep
`distinctAccountsProven`, `concurrentCallsProven`,
`recordingUploadLoadProven`, `minimallyInstructedHumanAcceptanceProven`, and
`productionScaleProven` false.

## Production capacity correction and Build 32 checkpoint — 2026-08-20

The earlier 50-coach failure above is retained as history, not current state.
Direct Cloud SQL inspection found a second, tighter boundary: the shared-core
production database exposes 25 connections, 22 after PostgreSQL reserves, while
one fresh coaching workspace can fan into several reads. Allowing Cloud Run
concurrency 80 did not create database capacity; it admitted substantially more
work than the bounded Prisma pools could serve.

Release tooling now sets Cloud Run concurrency `8`, Prisma pool maximum `4`,
maximum instances `2`, and validates both live and preview pools against a
rollout connection budget of `16`. Exact production revision
`studio-00516-haf`, source
`14428169924eecb26eda363afcc66a753e473a26`, and image digest
`sha256:8108f3491d1eb5aa82e7e312c7a5c49070db7628db21d734a897e7abedee6861`
carry that boundary. A 50-coach probe arriving over ten seconds passed all 150
authenticated reads with no HTTP 500s or client timeouts. This is a production
read-capacity floor, not proof of 50 simultaneous calls, recordings, uploads,
transcripts, or minimally instructed people.

Quipsly Capture `1.0 (32)`, exact native source
`aaf3e83633f36792cbe461f69b0fa7d78e2ab35c`, is the public TestFlight target.
That native source is an ancestor of the live Nest source, so production keeps
the complete Build 32 contract plus later invitation, lobby, follow-through,
and capacity corrections. Apple's public handoff returns HTTP 200 and names
Quipsly Capture. Xcode Organizer's current two-week feed shows
`CaptureRecorderView`/SwiftUI construction crashes for Builds 27, 28, and 30,
but no Build 31 or 32 crash group and no separate feedback item. Absence of a
report is not proof that Build 32 survives a physical-device journey.

Current-source simulator tests pass both the exact consent-needed full Session
opening regression and the ordinary Today → Session → Record navigation. A
clean local two-account flight also passes rendered invitation acceptance,
negative tenant visibility, two endpoints, explicit consent, independent
overlapping sources, participant-attributed transcript, protected playback,
shared/private relationship work, light edit, recipient release, playback, and
revoke. It uses synthetic browser media and local invitation delivery, so the
physical iPhone, natural speech, human listening, real-mail delivery, and
minimally instructed human flags remain false.

## Fifty-coach human flight scorecard

Give every coach the same one-sentence mission above and give every client only
the invitation Quipsly produced. Capture these events without adding hidden
test-only navigation or observer coaching:

1. invitation requested, delivered, opened, accepted, expired, resent, or
   recovered;
2. appointment created, found again, joined, rescheduled, or canceled;
3. device preflight, consent choices, call join, reconnect, source retention,
   upload/finalization, and participant ownership;
4. transcript ready, playback opened, correction accepted, proposal rejected or
   revised, and speaker attribution reviewed;
5. shared/private note visibility, task ownership and completion, goal updates,
   and later return navigation;
6. edit preview, recipient selection, explicit release, recipient playback or
   download, revocation, and post-revoke denial;
7. every point where a person pauses, mispredicts, asks for help, abandons, or
   cannot explain who can see or hear the current artifact.

The dashboard must separate product failure, infrastructure failure, user
confusion, observer intervention, and unfinished use. “No event received” is
unknown, never success. A support workaround can unblock a person, but the run
remains failed for self-service acceptance until another minimally instructed
person completes the repaired path unaided.

## Standard call source-candidate checkpoint — 2026-08-22

Committed source `739696687c2315e2407c2e99006f2a482043c1f8` now gives browser
and iPhone callers the conventional green-room hierarchy: preview, visible
microphone/camera state, one Join action, direct in-call controls, secondary
device settings and sound check, and remembered safe choices. Recording and
transcription consent remain a separate explicit Session decision.

The detached-source Capture preflight, 68 operated simulator journeys, signed
App Store archive/export, and packaged artifact verification passed. The exact
Nest Session evidence suite passed 66/66 and its strict optimized production
build completed. This is source-candidate evidence, not a cohort release: Build
33 already points at older public source, Google Cloud authentication expired
before preview checks, and physical iPhone, real two-person call, local media,
sync, transcript, mailbox, and minimally instructed acceptance remain open.

The complete source identity, artifact hash, flaky-test note, and validation
ledger live in
`docs/coordination/2026-08-22-standard-call-candidate.md`.

## Standard invitation and re-entry checkpoint — 2026-08-22

The current working tree now treats invitation administration as an exception
surface rather than the client journey. A host enters one email and sends the
invitation or creates a shareable link. Name, role, expiry, raw URL, provider
presence, join-key leases, and immutable access history remain available under
progressive disclosure. Opening the general invitation manager no longer
starts repeated provider-presence reads; those occur only while the explicit
access and device history view is open.

The invitation link now has two distinct cryptographic states. Pending
acceptance authority is single-claim and consumed atomically. Its HMAC then
moves to a separate re-entry locator that carries no authorization: reopening
the original email requires the exact accepting account and an active canonical
Session participant. Participant removal immediately denies the route, while a
deliberate restoration revives it without creating another identity.

The retained local flight passed the simplified host UI, wrong-account denial,
phone-width immediate-action ordering, pending acceptance, accepted-link
re-entry, two-browser LiveKit audio, Session chat round-trip, two-device
provider readback, canonical removal and provider disconnect, removed Session
and chat denial, removed-link denial, restoration without automatic media join,
and restored-link re-entry. It sent no external invitation, started no retained
source or provider recording, and exposed no provider credential or identity.
This is strong local product evidence, not physical-iPhone, production-mailbox,
natural-speech, or minimally instructed human evidence; those ledger items
remain open and do not block further independent development.

## Routine call administration checkpoint — 2026-08-22

The current coaching candidate now reserves its primary visual weight for the
ordinary job. Scheduling asks for client email and start time, applies the
coach's saved duration and timezone, and places uncommon fields under `More
options`. Appointment creation automatically attempts configured invitation
delivery without losing the canonical Session if the provider fails.

Both the creation result and existing appointment cards lead with `Open
Session`. Resend, copy-link, system Share, calendar projection, and payment
management are recoverable under secondary disclosures. An unpaid client sees
`Payment needed` expanded; a routine coach does not see internal room status,
provider receipts, or lifecycle evidence. Reopening an accepted invitation as
the same verified account removes the token from the URL and enters the
canonical Session directly instead of requesting acceptance again.

Focused coaching surface tests and the complete web typecheck pass. The prior
universal iOS simulator build also passes the matching native invitation
hierarchy. The in-app browser did not attach to a new local page during the
visual review attempt, so this checkpoint does not claim a rendered visual
inspection. Real mailbox delivery, physical iPhone use, minimally instructed
human comprehension, accessibility operation, and cohort scale remain open
evidence and do not block the next independent implementation lane.

## Live participant-source safety checkpoint — 2026-08-22

The live Session now keeps its pre-call surface quiet while no retained capture
exists, then automatically exposes the canonical per-person recording-safety
projection as soon as a recorder reports work. Hosts and participants can see
whose source is safe, whose device must remain open, and whether recovery is
required without opening a provider or receipt panel. The projection continues
to require exact released server bytes and a drained reporting-device queue
before saying every endpoint is safe to leave.

The focused component operation begins with an inactive Session and proves the
safety surface is absent, then returns a participant queue with a pending local
source and proves `Recording is finishing` plus the affected participant
appears. Existing safe, disagreement, failed, observer, and ended-missing-master
tests remain green. This is rendered-component and contract evidence, not a
physical-device upload, backgrounding, force-quit, natural-media, or human
comprehension claim.

The same projection now keeps the affected participant and the needed action
aligned. An ended Session with a missing required master no longer combines a
global `needs recovery` result with a participant row that says only `Not
recorded yet`. It identifies the missing participant and tells the current
actor to reopen Quipsly on the recording device, or tells another participant
who to contact. Technical queue, plan, and receipt evidence remains under
`Recording and upload details`.

The iPhone now renders the recording-directive projection for every authorized
participant, not only the person who can control the room-wide Record button.
The API remains the privacy authority: controllers receive all endpoint states,
while a client receives only their own opaque participant and endpoint state.
This fixes the prior UI loss of the client's own recording confirmation without
broadening what the server returns. The source library also no longer labels a
held or retryable upload `Safe on this iPhone`; it leads with `Upload needs
attention`, keeps the protected-original assurance visible, and offers one `Try
upload again` action with technical cause behind `What happened?`.

The recording-directive API suite passes 8/8, and the updated Capture target
builds successfully as a universal arm64/x86_64 iOS Simulator app with signing
disabled. This does not claim a physical-device background upload, interruption,
or minimally instructed recovery pass.

Browser recording coordination now follows the same rule. The client sees the
self-only directive projection already authorized by the API instead of losing
it behind a host-control UI condition. Non-controller API projections label the
single authorized participant and endpoint `You`, allowing both browser and
iPhone to say `Your recording is working`, `Starting your recording`, or `Your
recording needs attention` without falsely inferring that everyone else is
recording. Controllers still receive named room-wide status.

The focused browser projection, consent-surface, and recording-directive API
suites pass 16/16; the web typecheck and another universal iOS Simulator build
also pass. Cross-browser media permission, two-participant network, and
physical-device proof remain ledger evidence rather than inferred completion.
