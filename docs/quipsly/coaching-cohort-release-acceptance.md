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

Browser local-source state now distinguishes three ordinary facts without
overloading the word `safe`: `Saved on this device`, `Uploading`, and `Verified
in Quipsly`. A held local source explicitly says it is not yet verified in
Quipsly, and an interrupted source says `Recording interrupted`. Focused upload
recovery, recorder-surface, and recording-health tests pass 16/16 with the full
web typecheck. Browser process death, actual durable-storage eviction, and
network-resume evidence remain open.

Room-level stop intent now uses `Saving recording` and `Saved locally` across
browser and iPhone. It no longer uses `Stopped safely` as a shortcut for a
local stop receipt, which could be misread as completed cloud verification.
The updated call, recording projection, and browser recovery suites pass 31/31;
the full web typecheck and universal iOS Simulator build pass.

## Transcript voice-naming checkpoint — 2026-08-22

The transcript workspace now promotes unresolved speaker names into a short,
ordinary setup step before passage editing. It opens automatically once when a
Session still has unnamed or stale voices, asks the reviewer to listen to one
sample and choose a person, then reuses the saved name throughout the Session.
After every voice is named, the surface collapses into a quiet completed state
and does not ask the reviewer to repeat the work on each visit.

The primary language is now `Name the voices`, `Who is speaking?`, `Person`,
`Save name`, and `Change name`. Provider clusters, diarization, source authority,
and immutable receipt details remain preserved under transcription details but
are no longer concepts a coach must understand to name a speaker. The exact
playback-backed attribution request and source snapshot check are unchanged.

The focused transcript correction suite passes 22/22 and the full web
typecheck passes. This is component and contract evidence; natural multi-speaker
audio, human name recognition, mobile viewport comprehension, and minimally
instructed correction remain deferred acceptance evidence.

## Transcript correction versus recording edit checkpoint — 2026-08-22

The transcript workspace now names its two reversible actions according to
their actual consequence. `Correct transcript` updates only the reviewed text
and speaker overlay; the surface explicitly says it never cuts the recording.
`Trim or cut recording` opens the separate private-preview editor. The recording
editor says checked passages remain, cleared passages are removed from the
preview, and transcript wording does not change.

Each eligible passage now exposes an accessible `Keep in recording` or `Restore
to recording` name plus an `Included` or `Removed` status. Timing-unavailable or
overlapping passages remain disabled and visibly `Kept safe`. Preparing the edit
continues to preserve participant masters, exact word-timing fingerprints, and
the explicit listen-before-share boundary.

The focused transcript and recording-edit suites pass 27/27 and the complete
web typecheck passes. This does not yet prove natural-speech word alignment,
human selection comprehension, preview listening, renderer quality, or a
physical mobile edit; those remain deferred acceptance evidence.

The server-side recording-edit contract now also detects overlapping cut
intervals between adjacent passages from the same participant source. Both
passages become `timing-overlap` and stay in the preview until alignment is
repaired. This complements the existing cross-participant speech-overlap hold
and prevents a visually plausible transcript selection from cutting nearby
words. The exact source checksum, provider text hash, and timing fingerprint
still have to match again when the preview is prepared.

The focused server and recording-editor suites pass 14/14 and the full web
typecheck passes. Synthetic interval tests establish fail-closed contract
behavior; natural speech, imperfect provider alignment, and audible edit-seam
quality remain open evidence.

## Standard Session note capture checkpoint — 2026-08-22

The Notes mode now opens directly to a familiar note composer instead of hiding
creation behind a disclosure and teaching canonical identity policy first. A
person writes the note, optionally adds a title, and saves. Notes remain private
by default; note type and audience are available together under `Note type and
sharing` when a person needs them.

The saved result now says `Note saved` followed by the exact plain-language
audience rule. Editing says earlier versions remain available; tags say only
what was saved. Canonical note identity, append-only revisions, source anchors,
access enforcement, project taxonomy, and non-delivery behavior remain intact
under the simplified surface.

The focused Session Notes suite passes 5/5 and the full web typecheck passes.
This is component and request-contract evidence; a minimally instructed coach,
client visibility readback, mobile keyboard behavior, and screen-reader journey
remain deferred acceptance evidence.

The Work mode now presents `Tasks and goals`, ordinary per-kind counts, one
`Add task or goal` action, and a direct link to Work. It no longer leads with
`committed Session work` or explains canonical persistence before the user can
act. The underlying task and goal records, actor ownership, visibility,
transcript provenance, dates, tags, and cross-surface links are unchanged.

The combined Session Notes and Session review suites pass 53/53 and the full
web typecheck passes. Actual coach/client comprehension, keyboard-only entry,
cross-account visibility, and return-use task completion remain deferred
acceptance evidence.

## Client follow-up checkpoint — 2026-08-23

The coach follow-up flow now uses one named-recipient action: `Share with
<client>`. Quipsly still checks that the selected client-safe records match the
saved private draft, but no longer asks for a redundant attestation checkbox.
Stopping in-app sharing is equally direct and remains reversible without
deleting source notes, tasks, goals, revisions, or delivery history.

When the intended client actually renders a released follow-up, Quipsly records
the existing idempotent in-app open receipt automatically. The client is not
asked to press a button confirming that they opened the page they are already
viewing. The focused follow-up suite passes 7/7 and the full web typecheck
passes. Cross-account production readback, notification delivery, and
minimally-instructed mobile comprehension remain deferred acceptance evidence.

## Standard iPhone capture checkpoint — 2026-08-23

Quick Note, Task, Goal, and Source no longer narrate canonical IDs, protected
outbox mechanics, non-delivery policy, or duplicate destination facts beneath
every successful form. The safety mechanisms are unchanged: writes remain
account-bound, local-first, idempotent, and retryable. Their normal UI now leads
with familiar fields and plain result language; technical policy stays
available when recovery or support actually needs it.

Session notes remain private by default. `Note type and sharing` is a single
collapsed, accessible row with an ordinary chevron; expanding it reveals note
type, audience, and the exact visibility boundary. Tasks describe due dates,
reminders, recurrence, and travel-aware timezone behavior in familiar language
without requiring the person to understand Nest persistence or provider event
boundaries.

The universal arm64/x86_64 iOS Simulator build passes. Six focused simulator
journeys pass across private note capture, Home Nest destination, explicit
client-safe sharing, recurring tasks, due dates, and iPhone reminders. The
client-safe runtime smoke journey was updated to open the new disclosure before
changing its audience. Physical keyboard behavior, actual notification
permission prompting, offline process death, and minimally instructed human
comprehension remain deferred ledger evidence.

## Standard iPhone follow-through checkpoint — 2026-08-23

The next-Session card now leads with the prior Session, shared recipient, tasks,
goals, progress, and direct actions. `Open task`, `Open goal`, and `Updated since
this was shared` replace release-snapshot and canonical-state vocabulary. The
actor-private continuity card similarly says `Review previous Session` and
`Private to you`.

Revision numbers, hashes, original-record identity, no-copy behavior, and exact
transcript evidence remain available under `Details`; the app has not weakened
access checks, source links, or immutable history. Simulator build and focused
journey results for this checkpoint are recorded after validation below.

The universal arm64/x86_64 iOS Simulator build and the retained coaching-
continuity contract test pass. The signed-in continuity journey was not rerun
because the retained local Nest runtime was not active; its minimally instructed
human and physical-device evidence therefore remains deferred rather than
claimed.

## Standard iPhone follow-up sharing checkpoint — 2026-08-23

The native coach flow now matches the web flow: one `Share with <client>`
action replaces the release-attestation toggle plus release button. Sharing is
still disabled when editor values are unsaved, a selected source changed, the
surface is a deterministic preview, the device is offline, or a request is
already in flight. The server still rechecks the exact saved revision and
current eligible sources inside the mutation.

The intended client's iPhone records the existing idempotent open receipt when
the follow-up is rendered. There is no longer a `Confirm I opened this` button.
The card shows ordinary `New` or `Viewed` state, while the revision, SHA-256,
and original-source links remain under `Details`.

The universal simulator build passes, the native follow-up contract test
passes, and three focused iPhone simulator journeys pass for exact-source
preview, changed-source hold, and unsaved-editor hold in
`/tmp/quipsly-follow-up-simple-rerun-20260823T063900Z.xcresult`. A signed-in
client automatic-receipt readback and minimally instructed coach/client use
remain deferred physical/runtime evidence.

## Standard iPhone Session Notes checkpoint — 2026-08-23

The normal Notes workspace now shows note type, who can see each note, its
author, tags, source links, and an ordinary Edit action. Revision counts,
canonical-editor language, delivery-receipt explanations, and protected-outbox
terminology no longer dominate the successful path.

The editor uses `Note type`, `Who can see this`, `Tags`, `Save changes`, and
`Earlier versions stay available`. A pending write says `Saving changes`; a
real concurrent edit says a newer version was saved elsewhere and asks the
person to compare before saving. The underlying account-partitioned outbox,
optimistic revision check, atomic tags, idempotent retry, retained prior
revision, and explicit discard behavior are unchanged.

The universal arm64/x86_64 simulator build passes, both focused Session-note
contracts pass, and the full deterministic note-edit journey passes in
`/tmp/quipsly-session-notes-simple-final-20260823T064909Z.xcresult`. Signed-in
offline retry, true two-device edit conflict, VoiceOver comprehension, and
minimally instructed human use remain deferred release evidence.

## Current-source critical release checkpoint — 2026-08-23

Committed source `8d2a4db7` is 164 product and release commits ahead of the
native source currently represented by public TestFlight Build 33. Those
changes are intentionally being accumulated into a deliberate release train
rather than uploaded one at a time.

The source-candidate gate currently reports:

- 71/71 Session source-evidence and review tests passing;
- 15/15 native identity and account-partition tests passing;
- 11/11 rehearsal-preflight contract tests passing;
- 3/3 product-versus-fixture boundary tests passing;
- 4/4 bounded cohort-capacity contract tests passing;
- 16/16 Build 33 release-ledger and post-call verifier tests passing;
- 12/12 focused web login and account-switch tests passing, plus the full
  Quipsly TypeScript typecheck; and
- 14/14 operated critical iPhone UI journeys passing serially with zero
  failures in 264.423 seconds. The exact result bundle is
  `/tmp/quipsly-capture-critical-serial-20260823.xcresult`.

The planner discovered 72 deterministic shipping iPhone journeys and balanced
the complete lane across four shards with estimated weights 48, 48, 48, and
47. The first diagnostic run accidentally allowed Xcode to create simulator
clones; several clones failed to launch the XCTest runner while two clones
continued passing tests. Rerunning on one known simulator with parallel testing
disabled passed the complete critical lane. GitHub Actions and Fastlane already
require serial execution inside each shard, so the clone failure is retained as
infrastructure evidence rather than misclassified as an app failure.

This checkpoint makes the source eligible for the next qualification stage. It
does not yet authorize a new TestFlight upload: the complete 72-journey lane,
signed archive/export, exact App Store metadata readback, and a source-bound
candidate manifest still remain. Physical-device, natural-speech, real-mailbox,
human-listening, minimally instructed use, and 50-simultaneous-call claims also
remain explicitly unproved.

## Simple-UX release-contract checkpoint — 2026-08-23

The release contracts now match the standard call and follow-through language
that ships in the product instead of requiring retired permission lectures or
engineering vocabulary in the happy path. Durable identifiers, server
authorization, stable request identities, immutable source anchors, protected
outboxes, consent gates, measured audio evidence, and release-readiness rechecks
remain mandatory.

Current source proof after that reconciliation:

- 1,094/1,094 App Store and Capture static invariants pass;
- the complete mobile Capture source contract passes;
- 6/6 App Store listing operator tests pass and derive the exact target from the
  canonical release ledger;
- 8/8 submission-readiness auditor tests pass and derive their physical-build
  gate from the same ledger;
- 4/4 privacy questionnaire tests pass, and strict source inspection reports 11
  declared data types for Build 33; and
- 6/6 submission-configuration tests pass without adding a submission or
  screenshot mutation path.

The submission metadata correctly remains fail-closed. Five approved largest-
iPhone screenshots do not yet exist, no signed candidate archive was inspected
for this source checkpoint, and physical Build 33 acceptance has not been
performed. Those are real release proofs, not test failures, and remain queued
for the deliberate release train.

## Build 34 standard-call candidate — 2026-08-23

Exact app source `d86cf288cfaa510ebe3f090a28668023a3b1410c` is now a sealed,
not-uploaded Quipsly Capture 1.0 (34) candidate:

- 72/72 deterministic iPhone and Share Extension journeys passed in four serial
  shards with zero retries;
- 105/105 mobile source-contract checks and 1,094/1,094 App Store static checks
  passed;
- the signed archive and 25,803,921-byte IPA passed nested signature,
  distribution entitlement, App Store profile, privacy-manifest, extension,
  packaged permission-string, platform, and version inspection; and
- the IPA SHA-256 is
  `709fe8a45a7acff30635f2789bb8b515cf8f630fa9d46456ecf41f871a87991c`.

The standard workflow now exposes `Send invite` directly on an appointment and
keeps system sharing secondary. It retains one ordinary call green room,
contextual system permission requests, Session-scoped consent, remembered safe
preferences, local originals, account-partitioned offline work, source-linked
follow-through, and visible upload/Studio handoff state.

The receipt remains explicit: upload was not attempted, tester assignment was
not performed, and physical TestFlight installation was not read back. Those
steps belong to the next deliberate TestFlight train rather than being inferred
from simulator, signing, or App Store Connect evidence.

## Standard-call safety without setup paperwork — 2026-08-23

Normal coaching Sessions now derive their required participant masters from
the active, non-observer coach/client roster once capture evidence exists. They do not require a separate
retained-source plan before `Every recording is safe` can appear. The safe state
still requires one verified released participant master per expected person and
drained endpoint queues covering the exact sources. One missing participant
remains blocking even when all observed bytes are valid.

Explicit plans remain additive for extra phones, cameras, backups, and complex
productions. They do not appear as a prerequisite in the happy path. The change
passes 29/29 focused projection/status/UI tests, 112/112 broader Session source
regressions with one environment-gated integration test skipped, and Quipsly
TypeScript typecheck. No deployment or Build 34 mutation occurred.

## Transcript-to-recording edit continuity — 2026-08-23

A coach can now start a text-based recording edit from the exact transcript
passage being reviewed. `Edit recording here` opens the inline private-recording
editor and focuses the same transcript job and segment. It does not silently
exclude the passage or create/share a derivative. Unsafe timing stays included,
and passages outside an existing trim explain why they are not currently in the
cut list.

Focused correction/editor tests pass 29/29, the wider transcript/share set
passes 78/78, and Quipsly TypeScript typecheck passes. No render, share,
deployment, or Build 34 mutation occurred.

## Transcript-adjacent audio mastery — 2026-08-23

Transcript review now includes the automatic audio-quality result for the same
selected recording asset. The coach can see the whole-source check, compare the
immutable original with an improved listening copy when one exists, and retain
an explicit listening decision without leaving the transcript workflow. No
match means no substitute result, and completion never replaces or releases
media automatically.

Joined Session/transcript/audio UI suites pass 75/75 and Quipsly TypeScript
typecheck passes. No human audition, render release, deployment, or Build 34
mutation occurred.

## iPhone transcript-to-edit continuity — 2026-08-23

Quipsly Capture now carries the exact transcript-job and segment identity from
each precision transcript card into the native private-recording editor. The
focused passage appears at the top of the editor with its speaker, source time,
and current inclusion state. Opening the destination reveals edit controls but
does not select a source, widen the trim, exclude a passage, create a preview,
or change transcript truth.

The focused control remains fail-closed:

- a passage on an unselected source explains which boundary must change;
- a passage outside the current trim explains that the range was not widened;
- a passage without qualified non-overlapping timing stays included and shows
  the cut-safety reason; and
- a stale or missing transcript identity is not replaced by a nearby passage.

The former full recording editor at the bottom of a potentially long transcript
was removed. Coaches now use the exact per-passage action for text-based edits
or the existing Session-level `Edit and share` action for whole-recording work.
This keeps transcript review readable and avoids a second giant form embedded
inside it.

Current independent evidence is 105/105 mobile source-contract checks, a clean
iOS Simulator app build across both simulator architectures, and 1,094/1,094
App Store static checks. The remaining ledger item is a physical-iPhone pass:
open a real retained transcript passage, confirm the same words and timestamp
appear in the editor, verify opening alone produces no draft/output mutation,
exercise safe and unsafe passage states, back-navigate without losing transcript
position, then create and audition one private preview. This is deferred human
and device evidence, not a blocker for the next independent product lane and
not something the automated checks claim to prove.

Build 34 remains the sealed prior candidate and was not changed, uploaded,
assigned, or deployed by this work. This slice belongs to a later deliberately
qualified candidate.

## iPhone transcript-adjacent recording quality — 2026-08-23

The native transcript source card now resolves the exact local recording asset
before exposing audio-quality state. When that source includes audio, Capture
starts or resumes the existing idempotent whole-recording check and shows one
compact status: waiting for upload, checking, improved copy ready, checked with
no unnecessary derivative, or needs attention.

When the retained source already has a complete decoded signal scan, the same
compact card shows measured RMS dBFS, sample-peak dBFS, and the number of bounded
listen points. It labels RMS as distinct from LUFS and listen points as review
candidates rather than confirmed defects.

The transcript does not add a second pair of audio players. `Open recording
quality` navigates to the established exact-source surface for waveform and
signal evidence, original audition, verified improved-copy audition, and retry.
This prevents simultaneous or ambiguous playback while keeping the quality
result visible where correction decisions are made. A remote transcript, wrong
recording asset, missing audio profile, offline account, or incomplete upload
does not receive a substitute result.

The joined mobile source contract remains 105/105 and the dual-architecture iOS
Simulator app build succeeds. Physical-iPhone validation remains: verify the
card appears only for the transcript's recording asset, background/foreground
the analysis, audition original and improved copies in the quality destination,
and confirm route/interruption behavior with real headphones. Automated source
and simulator checks do not claim that human listening evidence.

## iPhone source-measurement to transcript navigation — 2026-08-23

Capture now maps bounded decoded-signal observations onto transcript passages
only when the retained recording asset identity matches exactly, the local
recording and decoded-signal clocks agree within a small duration-relative
tolerance, any supplied transcript playback duration also agrees, and mapped
passages stay inside that bounded source clock. A qualified observation can be
played from the exact local source and can focus its overlapping transcript
passage. An observation between
passages remains visible without inventing an anchor; a point spanning a passage
boundary preserves both overlaps; malformed or out-of-range evidence is held.

The surface calls these moments listen points and candidates. They are not
confirmed defects and cannot automatically correct transcript text, exclude a
passage, cut media, select an improved copy, or publish an output. Asset and
clock mismatches fail closed with a visible reason.

Independent evidence is 9/9 focused resolver cases, the source-only mobile
contract with no failures, a clean dual-architecture iOS Simulator app build,
and 1,094/1,094 App Store static checks. Build 34 remains sealed and unchanged.

Physical listening evidence remains on the ledger. On a real retained coaching
recording with headphones:

- confirm each shown point plays the expected source moment and no other asset;
- verify a known quiet region, peak candidate, and signal-gap candidate against
  the visible waveform and audible source;
- follow a one-passage and boundary-spanning point into the expected transcript
  location, then return without losing review position;
- verify merely listening or navigating creates no correction, cut, derivative,
  share, or publication receipt;
- background, foreground, interrupt, and route-change playback; and
- present a deliberately mismatched clock/asset fixture and confirm navigation
  remains held rather than approximately aligned.

These are deferred human/device validations, not a reason to stop independent
product work and not claims made by the automated checks.

## Browser live-call microphone confidence — 2026-08-23

The browser green room already remembered safe microphone, camera, headphone,
camera-on, and join-muted choices and requested media only from the ordinary
Join or optional Preview action. The call now keeps measuring the actual
published LiveKit microphone track after joining instead of discarding the
preflight meter at the room boundary.

One plain-language status sits beside the familiar Mute, camera, and Leave
controls: checking, healthy, low, loud, possible clipping, no signal, muted, or
needs attention. Muting stops the meter; unmuting resumes it from the newly
published track. A live device switch or automatic fallback rebinds the meter
to the replacement track. Detailed frame RMS, sample peak, channel/rate, and
browser-processing evidence remains collapsed under technical details. The
ordinary call path gains confidence without a mandatory sound-check ceremony.

Focused browser-room behavior passes 23/23; the joined room, private sound-check,
and audio-meter suites pass 35/35; and Quipsly TypeScript typecheck passes.
Physical browser validation remains: join with the MV7i, speak quietly,
normally, loudly, and at intentional near-clipping level; verify the simple
status and detailed meter describe the same live call track; mute/unmute; unplug
and reconnect the interface; switch microphones; background/foreground; and
confirm the separate retained source is still independently analyzed. No
natural-speech, hardware-route, or human-listening proof is claimed yet.

## iPhone live-call microphone confidence — 2026-08-23

The iPhone call surface now shows one compact microphone state derived from the
exact LiveKit local-input PCM after Join: checking, healthy, low, loud, possible
clipping, no signal, muted, or needs attention. It does not expose dBFS or a
mandatory sound-check workflow to an ordinary participant. Healthy audio adds
no instructions; only actionable states show a short recovery suggestion.

The one-time iOS system permission copy now truthfully covers both ordinary call
audio and explicit recording. The system remembers the answer; Quipsly does not
present a second permission ritual or claim that Join starts recording.

The observer is transient and separate from Quipsly recording. It retains no
PCM, writes no file, performs no upload, creates no transcript, and cannot imply
consent. Mute, Leave, provider disconnect, CallKit reset, account change, and
failed activation detach it. Unmute and recovered connection reattach it to the
same SDK-owned microphone path. The retained participant master remains behind
the explicit Record action and its Session consent receipt.

Joined-call presence now says `Waiting for others`, `2 people here`, or the
larger total including the local participant. Mute and Leave move with the
person in a persistent bottom call dock while consent, recording, notes, and
transcript tools scroll independently. Leaving during a retained take still
uses the existing protected-source stop-and-save boundary before disconnect.

Independent evidence is the focused deterministic health-state harness, the
107/107 source-only mobile contract, a successful arm64 plus x86_64 iOS
Simulator build, and 1,094/1,094 App Store static checks. Build 34 remains sealed
and unchanged; this slice belongs to a later deliberately qualified candidate.

Physical-device evidence remains on the continuous validation ledger:

- join a real Session unmuted and confirm normal speech reaches healthy without
  starting a retained recording;
- scroll from the top of a long Session through recording, notes, and transcript
  surfaces and confirm Mute and Leave remain reachable without duplicate controls;
- join alone, then with one and multiple remote participants, and confirm the
  waiting/total-person copy changes without exposing provider identifiers;
- speak very softly, normally, loudly, and at intentional near-clipping level
  and compare the plain state with headphones and the retained-source meter;
- mute and unmute from Capture, CallKit, and a connected headset where supported;
- change between iPhone, Bluetooth, wired, and supported interface routes;
- interrupt, background, foreground, lose/recover network, and end from the
  native call surface; and
- confirm no meter-only source, upload, transcript, consent, or recording receipt
  exists afterward.

These checks require real hardware and human listening. They remain deferred
evidence and do not stall the next independent product lane.

## Plain post-call recording safety — 2026-08-23

Capture no longer puts endpoint-queue and server-master terminology in the
ordinary finishing path. The Session and Today finishing queue now lead with
one truthful state:

- "Recording is safe": every expected recording has a verified cloud copy and
  all reconciled device queues are drained;
- "Cloud copies are safe": exact cloud bytes are verified, while a device may
  still be draining protected local recovery work;
- "Keep Quipsly open": at least one required server copy is still finishing;
  or
- "A recording needs attention": an expected participant or planned master is
  missing.

Exact counts, source-plan revisions, device queue receipts, recovery holds, and
Nest source details remain available under Recording details. Missing-source
states expand that section automatically. Normal progress does not demand a
decision or a repeated acknowledgement.

Independent evidence:

- focused source-exit experience harness: pass;
- Capture source-only contract: 107/107 pass;
- App Store static suite: 1,094/1,094 pass;
- arm64 plus x86_64 iOS Simulator build: pass; and
- targeted testTodayFinishQueueOpensExactSessionWithoutPerformingAction
  Simulator journey: pass after verifying the collapsed summary and expanding
  exact source/device evidence.

Still required on physical devices: stop a real multi-participant capture,
background and foreground each endpoint during upload, interrupt networking,
force-quit and reopen one endpoint, and verify the simple status never advances
beyond its durable server and queue evidence. This is deferred validation, not
a blocker for the next independent product lane. Build 34 remains sealed and
unchanged.

## Clean-commit fresh coaching product flight — 2026-08-23

The full local coaching flight passes from exact clean source commit
`2ff92867b85b049e4d4645a11c5323a3eb7e786f`. The flight initially exposed five
acceptance selectors that still described older, more technical UI language.
The product retained its simplified language; the automation was repaired to
operate the ordinary controls. The appointment duration selector now also has
an explicit label/control association rather than relying on nested-label
inference.

One orchestrated run created entirely fresh coach and client accounts and then
proved, without fixture identifiers or direct database acceptance writes:

- rendered account creation, appointment scheduling, invitation creation,
  one-time invitation acceptance, and return to the exact Session;
- coach/client isolation from real neighboring Nests, Sessions, and coaching
  relationships, with no unrelated podcast or test-artifact leakage;
- one conventional two-endpoint call, remembered Session consent, live chat,
  two participant-owned audible sources, 27.168 seconds of overlap, complete
  recording visibility, and immutable source readback;
- two source-bound transcript jobs, protected playback, deterministic speaker
  attribution, and recovery of the controlled coach and client phrases;
- shared and private notes, tasks, goals, cross-account task completion, and a
  collaboration-message round trip;
- light edit, private preview, explicit client release, decoded client
  playback, explicit revoke, and denied playback after revocation; and
- automatic post-call audio readiness, original-source checksum preservation,
  collapsed technical recording evidence, inline trim/cut editing, linear and
  side-by-side transcript views, and automatic exact-source playback before a
  transcript correction.

The private machine-readable receipt is
`artifacts/coaching-acceptance/59e3d3a1/fresh-coaching-flight-receipt.json`.
It truthfully records `humanAcceptanceSatisfied: false`, fake browser media,
controlled text-to-speech, local mailbox delivery, no external invitation, no
physical-device proof, no natural-speech accuracy proof, no human listening,
and no production-scale claim. Those remain on the continuous validation
ledger and do not invalidate the independently proven local product path.

Build 34 remains the sealed prior candidate. This work was not deployed,
uploaded, assigned, or folded into that archive.

## Multi-source mentor report flight — 2026-08-23

The mentor transcript exporter no longer assumes one participant recording
contains the whole conversation. For a participant-isolated coaching call it
now selects one source per coach/client from the same coherent take, validates
the latest completed transcript against each verified source checksum, binds
speaker identity from the participant-owned recording, applies reviewed
corrections without changing provider evidence, and projects both sources onto
one shared Session clock. A single diarized source remains supported only when
its speaker attribution is explicit.

The clean exact-commit flight at
`95c0f5d6dbf1dd73c4b163f6512d3184ed67f19e` passed the complete product path
again. Its private receipt is
`artifacts/coaching-acceptance/b4f77f2f/fresh-coaching-flight-receipt.json`.
In addition to the prior acceptance coverage, it records a rendered UI
download of a 12,575-byte OOXML mentor report using
`quipsly-coaching-transcript-report-v2`, exactly two source-bound participant
recordings, and a retained report SHA-256. The report route fails closed on
missing perspectives, source drift, ambiguous coach/client membership, stale
transcripts, or unresolved speaker identity.

The same flight re-proved fresh-account scheduling and invitation acceptance,
neighboring-tenant isolation, a two-endpoint call, remembered consent, 27.562
seconds of independently captured source overlap, protected transcript
playback, relationship work, inline editing, recipient release/revoke, and
automatic post-call audio readiness. The source commit was clean when the
flight began. Human understanding, real mailbox delivery, natural speech,
physical devices, human listening, and production scale remain explicitly
unclaimed.

## Post-call recording exit flight — 2026-08-23

Leaving the conversation no longer unmounts the participant-owned recorder
while its protected source is uploading or waiting for recovery. The post-call
surface removes setup and consent controls, keeps the recovery owner rendered,
and presents one conservative answer: **Keep Quipsly open**, **Safe to close**,
or **Recording needs attention**. Active recording and transfer also use the
browser's standard leave warning and a best-effort screen wake lock; completed
or merely historical work does not create a recurring warning ceremony.

The clean exact-commit flight at
`f028416bda08f8e159544850400af7c8f850980e` passed the complete product path.
Its private receipt is
`artifacts/coaching-acceptance/d04ecae3/fresh-coaching-flight-receipt.json` and
records `safePostCallRecordingExitOperated: true`. Both disconnected browser
participants retained the rendered recovery surface and reached **Safe to
close** only after their independent masters were server-verified.

The same run re-proved fresh signup and exact-link client entry, neighboring
tenant isolation, remembered Session consent, two verified participant-owned
sources with 27.502 seconds of overlap, two-source attributed transcription,
protected playback, shared/private work, text-based editing, explicit
release/revoke, and automatic post-call audio readiness. It downloaded a
12,552-byte `quipsly-coaching-transcript-report-v2` mentor report from the
rendered UI. The receipt continues to report physical-device, natural-speech,
real-mailbox, human-listening, and production-scale evidence as unproven.

## Build 35 exact-commit candidate — 2026-08-23

Quipsly Capture 1.0 (35) is a sealed, signed, not-uploaded candidate built from
exact clean source commit `8d019469d251b564ce25c31dccef27ab406dcb1c`.
The fresh qualification run selected 72 deterministic UI journeys across four
shards. All 72 passed with zero failures, skips, or expected failures. The
same run archived and exported the iPhone app, verified the app and share
extension signatures and App Store profiles, inspected packaged privacy and
permission metadata, and confirmed matching app/extension version 1.0 (35).

The first exact-commit attempt at `4227425d` failed closed before archive when
`testRehearsalControlsRemainReachableAtLargestAccessibilityTextSize` timed out
twice while auditing an unnecessarily expanded, off-screen readiness hierarchy.
It produced no qualified candidate. The product control was already reachable;
the test now collapses the checklist after proving that control and audits the
current manuscript/watch screen with the same hit-region, element-description,
and clipped-text categories. The focused repaired journey passed in 49 seconds,
and the subsequent fresh 72-test qualification passed without suppressing an
accessibility issue category or accepting a failure.

Retained machine evidence:

- UI manifest:
  `/tmp/quipsly-capture-ui-tests/8d019469d251/20260823T160026Z-12078/quipsly-capture-ui-test-evidence.json`;
- signed release receipt:
  `/tmp/quipsly-capture-release/8d019469d251/20260823T160026Z-12078/QuipslyCapture-1.0.35-release-receipt.json`;
- IPA size: 25,985,973 bytes; and
- IPA SHA-256:
  `098082d50c005a3fdc77fb2b0f26a8a9db36bfca07a3e225ec5ed06c9273fde3`.

No upload, tester assignment, processing wait, TestFlight installation, or
physical-device readback was attempted. Build 34 remains unchanged. Build 35
is eligible for a deliberate release only after the matching Nest production
compatibility lane passes; physical-device, natural-speech, human-listening,
real-mailbox, and multi-account production evidence remain on the continuous
validation ledger and do not stop independent product work.

## Shared iPhone call camera and retained master — 2026-08-23

The iPhone now owns one coordinated camera graph instead of forcing a choice
between familiar call video and a high-quality local source. The persistent
call dock exposes conventional Mute, Camera, and Leave controls. Camera begins
off, asks for the ordinary iOS permission only from the person's action, shows
the remote participant as the main stage, and shows the local camera as
picture-in-picture. Front/back switching remains available from that stage.

The same `AVCaptureSession` feeds the preview, a custom LiveKit buffer track,
and `AVCaptureMovieFileOutput`. Live transport is bounded to 720p/24 while the
separately selected retained master can remain 4K/24. The implementation never
calls LiveKit's camera convenience API and therefore never opens a competing
camera session. Join and Camera still do not record; retained recording remains
behind current Session consent and the durable source ledger. Teardown detaches
the frame consumer before unpublishing or dropping the track.

Independent evidence:

- arm64 plus x86_64 iOS Simulator build: pass;
- iOS capture durability contract: 93/93 pass, including one-session ownership,
  non-blocking frame delivery, provider publication, teardown ordering, profile
  separation, and the conventional native video stage;
- App Store/capture static suite: 1,128/1,128 pass, including shared-session,
  custom-buffer-track, teardown, standard control, near/far stage, and camera-
  switching invariants; and
- no TestFlight upload or modification of the sealed Build 35 candidate.

Physical-device evidence remains on the continuous validation ledger:

- join one iPhone and one browser endpoint, turn the iPhone camera on and off,
  and prove the far-end browser sees the expected video without call-audio
  interruption;
- start a 4K/24 retained camera master while live video is published, capture
  sustained motion and speech, and prove the local file retains its declared
  profile while the call remains usable;
- switch front/back before and during recording and verify the visible call,
  explicit local source boundary, capture-group continuity, upload, and
  synchronized editor materialization;
- repeat in second-device mode while the browser owns microphone/headphone
  audio and prove the iPhone creates no echo or remote-audio playback;
- interrupt network, background/foreground, end through CallKit, change
  accounts, and rejoin; verify no stale camera indicator or publication remains;
  and
- sustain the combined workload long enough to assess thermal pressure, frame
  cadence, battery behavior, audio quality, and human-perceived call quality.

These hardware and human observations are required before a released claim of
mobile video parity. They do not stop the next independent product lane.

## Conventional browser video stage — 2026-08-23

The browser call no longer presents the local preview and remote participant
media as two vertically separated regions. It retains one stable stage across
the green room and connected call. The local camera fills that stage before a
remote video exists; the first remote video becomes the primary far-end view
and the local camera moves to a labelled picture-in-picture preview. Turning
the local camera off leaves the remote person in place and replaces only the
small self-view with a conventional `You · Camera off` state. When the remote
video unsubscribes, the local preview returns to the main stage without leaving
stale media elements or stale participant counts.

The retained browser source remains intentionally separate from the processed
conversation track. Call audio requests echo cancellation, noise suppression,
and gain control. The retained recorder requests the same selected physical
device with processing disabled, 48 kHz audio, and the highest available video
profile, then journals and uploads that independently verifiable source. Device
selection is locked during the retained take. This preserves quality and source
truth, but simultaneous access to the Canon R8, MV7i, and ordinary webcams still
needs explicit hardware/browser proof; automated DOM and source checks cannot
establish that a particular driver permits both tracks for a sustained call.

Independent evidence:

- the focused browser room suite passes 27/27, including remote-video
  subscription, main-stage promotion, local picture-in-picture, unsubscribe
  restoration, green-room ordering, reconnect, remembered devices, and
  second-device behavior;
- the Quipsly TypeScript 7 typecheck passes after route generation; and
- the iPhone durability and shared mobile source suites remain green at 93/93
  and 107/107 after the camera teardown race and camera-switch affordance were
  tightened.

Physical evidence remains on the continuous validation ledger: run Chrome with
the MV7i and Canon R8, confirm the far-end video and call audio remain stable
while a raw retained source starts and stops, inspect the actual retained track
settings, and prove upload, synchronization, and playback. Repeat with the
built-in microphone/camera and a second participant. A failed hardware driver
must produce one plain-language recovery action while keeping the conversation
usable; it must not silently substitute the call track and claim studio quality.

## Plain-language recording readiness — 2026-08-23

The retained browser recorder now distinguishes the only two routine consent
holds beside the Record control. If the current person has not chosen, it says
`Choose Allow recording before this Session is recorded.` If their current
Session choice is already saved, it says `Your choice is saved. Waiting for the
other participant.` The disabled control no longer depends on a collapsed
settings panel or an internal `all registered participants` explanation.

The boundary remains deliberate: one choice is reused for every take and reopen
inside the same Session, but a different private Session requires its own
choice. Source and transcript settings remain editable under Recording settings
and are restored from the canonical Session receipt. No mailbox action,
additional permission page, or reconfirmation is introduced.

Independent evidence: the focused retained-source consent and domain suites
pass 6/6, the shared domain TypeScript 7 gate passes, and the complete Quipsly
typecheck passes after route generation. Minimally instructed two-person proof
that each participant understands the state remains on the human validation
ledger and does not stop continued development.

## Browser join degradation instead of call failure — 2026-08-23

Once the provider room is connected, microphone and camera startup are now
independent recovery boundaries. If the microphone fails, the participant stays
in the room muted and can choose another input before using Unmute. If the
camera fails or is already owned by another application, the participant stays
in the room with video off and can retry Start camera. The exact browser error
remains under technical details; the primary message says what happened and
confirms that the conversation is still connected.

This removes a brittle all-or-nothing join path without weakening retained
recording: a failed call device is not silently relabelled as a studio source,
and the separately consented recorder still fails closed if its selected master
cannot start.

Independent evidence: the focused browser room suite passes 28/28, including an
in-use camera rejection that preserves provider connection, exposes Leave and
Start camera, and never calls room disconnect. The complete Quipsly TypeScript
7 typecheck also passes. Physical MV7i, Canon, built-in camera, and cross-device
recovery remain on the continuous hardware ledger.

## Retained recorder recovery without call loss — 2026-08-23

The high-quality browser recorder no longer exposes raw browser or device
exceptions as its primary participant instruction. Permission denial asks the
person to allow the selected source for the site; an occupied or disconnected
device asks them to close the competing app or choose another source; an
unsupported source request points to Recording settings. Every path explicitly
confirms that the independent conversation remains connected.

The exact exception name, browser message, and failed constraint remain under
the collapsed **Recording health** disclosure for support. A non-device start
failure uses the same calm boundary without inventing a cause. If the encoder
was already writing before the Session rejected its start receipt, Quipsly
stops and finalizes the local source safely and does not claim a confirmed
recording.

Independent evidence: four focused start-failure classifications and eleven
Session guardian projections pass, the browser room and retained-consent
regression set passes 44/44, and the complete Quipsly TypeScript 7 typecheck
passes after route generation. Physical proof of simultaneous Canon R8/MV7i
conversation and retained recording remains on the continuous hardware ledger;
this product slice does not convert automated error simulation into a hardware
compatibility claim.

## Remembered recording setup without blanket consent — 2026-08-23

The browser recorder now remembers whether this device uses headphones and
keeps separate preferred source modes for coaching and episode Sessions. A
coach who consistently records audio with headphones, or camera plus audio,
does not have to rebuild the same setup for every new Session. Corrupt or
unsupported stored values fail back to the familiar coaching-audio and
episode-video defaults without blocking the recorder.

This is intentionally setup memory, not consent reuse. An existing Session's
canonical source and transcription receipt still wins when it reopens, while a
new private Session still presents one ordinary recording choice to each
participant.

Independent evidence: three preference-model regressions prove defaults,
per-workflow retention, headphones retention, merge behavior, and corrupt-data
fallback. The retained-recorder source contract also asserts that the controls
use the remembered preference layer. Responsive visual proof remains pending
because the local in-app and Chrome browser-control connections were
unavailable during this slice; that did not stop source, interaction, or type
verification.

## One coordinated Record action with explicit recovery — 2026-08-23

A ready participant no longer has to press **Join recording** merely because
the host started before their browser observed the directive. If the current
Session's recording choice and retained source are ready, the endpoint starts
its participant-owned master automatically. If consent or source readiness is
not ready yet, Quipsly waits and starts automatically when that state becomes
valid; it does not convert an old Session preference into consent.

Automatic start does not hide real failure. A browser endpoint that returned a
local `START_FAILED` receipt now exposes **Try recording again** while the
conversation remains connected. It never loops an actual device failure, and
the host can still stop the coordinated directive while one endpoint is being
recovered.

Independent evidence: the directive model proves that a ready `JOIN_REQUIRED`
endpoint auto-starts, a not-ready endpoint waits, and manual retry is offered
only for a ready local `START_FAILED` state. The focused directive and rendered
source-contract suites pass 11/11, and the complete Quipsly TypeScript 7 gate
passes after route generation. Two-browser physical proof remains on the
continuous validation ledger and does not stop the next product lane.

## One coordinated Record action on iPhone — 2026-08-23

The compiled iPhone path now follows the same rule as the browser. When a host
has started recording, an iPhone with the current Session's source consent and
already-granted iOS microphone or camera access starts its participant-owned
source automatically. It does not invent a second Quipsly permission or
**Join recording** ceremony. If either ordinary prerequisite is missing, the
call remains connected and Quipsly waits for the person's normal Record action
to resolve it.

A real local start failure also stays recoverable. The iPhone keeps the call
connected, explains that recording did not start, and leaves one retry path
instead of silently looping or ejecting the participant. A host STOP directive
still clears any pending start state.

Independent evidence: the native durability contract passes 95/95, the App
Store static contract passes 1128/1128, the source-evidence contract passes
30/30, and a universal unsigned iOS simulator build succeeds. Physical-device
proof remains on the continuous validation ledger; Build 35 remains sealed and
was not replaced by this local source change.

## Standard HTTPS app handoff — 2026-08-23

Session entry no longer depends on a brittle `quipsly://` action. Nest now
builds one canonical HTTPS link that iOS can open in Quipsly Capture when it is
installed and that remains the exact browser Session when it is not. The link
carries only the opaque Session identifier plus inert `open=capture` and
`mode=live` navigation hints; invitation and provider authority never cross the
handoff.

The native target declares `applinks:nest.quipsly.com`, Nest publishes a
bounded Apple association document for only `/sessions/*` with the explicit
Capture query, and the registered Apple App ID now has `ASSOCIATED_DOMAINS`
enabled. The idempotent Apple operation first proved the capability missing,
enabled only that capability, then read it back as present.

Independent evidence: eight focused web/link tests pass, the Swift parser
harness passes, the universal unsigned iOS simulator build succeeds, the
App Store static gate passes 1134/1134, and the Apple capability operation
passes 4/4 regressions. Production endpoint and signed physical-iPhone opening
remain release-candidate checks after the Nest route is deliberately deployed;
the current public/TestFlight build was not replaced in this slice.

## Clean-commit fresh coaching flight after call simplification — 2026-08-23

The complete local product flight passed from pushed source
`6e19a00df888af9dd5fa011dbb46ac1e4c54c6d1` with a clean tracked worktree at
start. It created fresh ordinary coach and client accounts, scheduled the
Session, used the exact rendered invitation and HTTPS app-or-browser handoff,
returned the client to the same Session, and found no neighboring Nest,
Session, coaching-relationship, podcast, or private-test leakage through normal
navigation, direct URLs, or direct API probes.

Both browser participants then joined the conventional lobby, kept advanced
device and technical evidence collapsed, reused unchanged Session consent after
re-entry, and produced two independently verified participant-owned sources
with 7,921 ms of overlap. The same Session produced a two-source attributed
transcript, protected playback, a rendered/downloaded mentor DOCX report,
shared and private relationship work, cross-account task completion, a light
edit, private coach preview, client release/playback, and verified revocation.

Receipt:
`artifacts/coaching-acceptance/28ba7419/fresh-coaching-flight-receipt.json`.
The operation made no direct acceptance writes to the database. Its boundaries
remain explicit: local mailbox delivery, synthetic browser media, no natural
human-speech or human-listening claim, no physical-device proof, and no
production-scale claim.

The retained local `shomers@gmail.com` persona was also repaired through the
idempotent starter and guarded coach-reset operations. It now has one active
free membership, one private empty Home Nest, a COACH role and active Scott
Sparrow profile, while its prior High Ground Odyssey grant and Episode 9
participant access are revoked/removed. This repair was local only because
Google Cloud reauthentication expired before the read-only production audit;
no production identity mutation was attempted.

## Clean-commit controlled-speech and audio-quality flight — 2026-08-23

The extended fresh coaching flight passed from exact pushed source
`4af74732a5caca8067edfaba14b78d8d03f51024` with a clean tracked worktree. It
sent distinct controlled coach and client speech through the ordinary rendered
two-endpoint call and produced two verified participant-owned sources with
28,516 ms of overlap. The attributed transcript recovered the expected terms
from each source, decoded protected playback, and exported the two-source
mentor report through the rendered UI.

The same Session proved the higher-quality workflow without a separate admin
surface: audio preparation began automatically, ended with an improved
listening copy, rendered original and improved playback together, and preserved
the original source plus capture manifest unchanged. The ordinary transcript
appeared before packet administration, opened its recording editor inline,
operated both linear and side-by-side recording/transcript views, and began
exact-source playback automatically when correcting a passage without a
repeated listening-attestation step. The calm recording summary rendered while
expert evidence stayed collapsed by default.

Receipt:
`artifacts/coaching-acceptance/c4c0da37/fresh-coaching-flight-receipt.json`.
Its boundaries remain deliberate: controlled text-to-speech and synthetic
browser devices are pipeline evidence, not natural-speech accuracy, physical
device, human listening, external email delivery, or production-scale proof.
The improved listening copy was not published automatically.

## Compiled iPhone phone-first coaching flight — 2026-08-23

The production-shaped iPhone workflow passed from exact pushed source
`3b9ae14daf000ac3f26733901ad8d0afc87704be` with a clean tracked worktree at
start. A fresh ordinary verified account opened the compiled Capture app,
enabled Coaching from the phone, and scheduled a Session using only the
client's email address. The app supplied a conventional future time and the
neutral default title `Coaching session`; client name and custom title remain
optional and use standard Next/Done keyboard progression when chosen.

From that same phone workflow, the app created the client relationship,
appointment, invitation handoff, and Session; opened the relationship; created
a shared note, shared task, shared goal, and private coach note; returned to
Coaching; and opened the exact new Session in the recorder. Independent API
readback verified all canonical identifiers, shared work, edit authority, and
the private note's `PRIVATE` visibility.

Receipt:
`artifacts/coaching-acceptance/phone-start-b61dcf2e/phone-start-receipt.json`.
The compiled UI test passed 1/1 in 93.687 seconds with no unexpected runtime
warnings. Its boundaries remain explicit: iPhone simulator rather than a
physical device, local Firebase and mailbox adapters rather than production
identity and external email, and no human comprehension or 50-coach load
claim. The invitation's standard Share path was present because outbound email
is intentionally unconfigured in this local flight.

## Fresh invited-client and native recorder recovery flight — 2026-08-24

The complete native recovery flight passed from exact pushed source
`2e8f012844a46da89ca8a00de825647977a283b5` with a clean tracked worktree at
start. It created fresh ordinary coach and client accounts and a fresh Session,
then opened the rendered client invitation in a fresh compiled Capture app. The
app reauthorized the exact invited client and canonical Session without joining
the call or beginning a recording automatically. The client and coach each
completed the ordinary in-product consent flow; the recording consent included
transcription by default.

The coach recorded a real `AVAudioRecorder` take, added a mark, stopped and
saved it, played the immutable local source, and reached server-verified byte
size and SHA-256 evidence. Another take remained directly reachable after
Library re-entry. The harness then terminated the app during that second take,
relaunched against an unavailable server, and found both exact local source
identities. The finalized source remained playable offline; the crash-open
receipt was preserved without falsely claiming its bytes playable or its take
still active. Reconnection retained those identities and the verified first
source completed a durable Studio handoff.

Receipt:
`artifacts/coaching-acceptance/4b63e92b/native-capture-recovery-receipt.json`.
The native client-entry and recovery UI tests each passed 1/1 with no unexpected
runtime warnings. The flight used a fresh simulator container and pre-granted
simulator microphone permission, so it does not claim first-run system-prompt
UX, physical microphone or camera behavior, natural speech, human listening,
novice comprehension, TestFlight networking, or production scale. Those remain
physical/human release checks rather than hidden assumptions in this evidence.

## Conventional call setup with durable recovery — 2026-08-24

The simplified call setup and the complete native recovery flight passed from
exact pushed source `eba326388aad1bb256e53f0c2cf440f54874ea81` with a clean
tracked worktree at start. The routine lobby now leads with the selected
Session, microphone route, the standard this-iPhone call-audio choice, one
primary **Join call** action, and one secondary **Record without joining**
action. It no longer follows those obvious controls with another instruction
paragraph or presents an idle disconnected call as a warning. The less-common
second-device choice retains concise echo guidance. Device and sound check
evidence stays available in one optional disclosure, while real recording,
signal, storage, call-recovery, and source-integrity interventions remain
visible when they become actionable.

The focused lobby and rehearsal UI tests pass, including accurate preview
manuscript and shared-clip evidence without depending on a later lazy card.
The App Store/static contract passes 1,138/1,138. The fresh end-to-end receipt
at `artifacts/coaching-acceptance/54f0fef8/native-capture-recovery-receipt.json`
again proves invited-client reauthorization without auto-join, ordinary
in-product client and coach consent, real local recording and playback,
server byte/checksum verification, another-take reachability, process-death
recovery, protected offline readback, reconnection, and durable Studio handoff.
Its simulator, pre-granted microphone permission, natural-speech, human
listening, novice comprehension, TestFlight, and production-scale boundaries
remain unchanged and explicit.

## Deferred physical flight: crash-safe encoded-audio review — 2026-08-24

Local source now protects an encoded AAC approval or rejection before network
delivery and replays only the identical account- and artifact-bound request.
Automated proof covers relaunch persistence, stable request identity and
timestamp, retryable delivery, held conflicts, two-account ledger isolation,
exact acknowledgement, corrupted-primary last-known-good recovery, dual-
architecture compilation, 12 focused server tests, and both Capture static
contracts.

Before a TestFlight train claims this behavior on device, use a real retained
recording and authenticated encoded artifact to:

1. proof-listen beginning, middle, and ending on a physical iPhone;
2. approve or reject, interrupt connectivity or terminate the app during the
   response boundary, and relaunch;
3. confirm the screen recovers or acknowledges the saved decision without
   offering a second competing decision;
4. confirm Nest contains exactly one receipt with the same decision and
   listening evidence; and
5. switch to a second account and confirm it cannot see or transmit the first
   account's protected entry.

No physical-device, human-audibility, TestFlight-networking, or production
deployment claim is made by the local checkpoint.

## Deferred authenticated flight: Session Episode package isolation — 2026-08-24

Local service and component proof now binds packet selection to the canonical
Episode, not merely any approved audio attached to the same Nest. It also
retains one exact browser request UUID and timestamped body through an
ambiguous-response retry. Before release evidence claims the behavior live:

1. create or use two canonical Episodes in one disposable Nest;
2. prepare distinct approved delivery audio for both;
3. verify direct wrong-Episode packet coordinates fail without a packet or
   selection receipt;
4. select the correct multitrack program or single-source branch from its
   Session output graph;
5. interrupt one selection response, retry or refresh, and verify exactly one
   active selection with coherent append-only history; and
6. verify selection still performs no upload, public hosting, RSS mutation, or
   publication.

The local 17-test and strict-TypeScript checkpoint is not a production deploy
or authenticated cross-Episode runtime claim.

## Local checkpoint: exact-passage text-edit audition — 2026-08-24

The inline coaching recording editor can now audition every text-based cut
against its exact participant master before rendering. Session program time is
translated to source-local time using the retained participant offset; playback
seeks to the word-timed in-point and stops at the proposed out-point. Camera and
audio sources share the protected Session media boundary. The UI explicitly
distinguishes source audition from the later rendered private preview.

Focused editor, edit-contract, and private-media suites pass 27/27 and strict
Quipsly TypeScript passes. Before release acceptance, use a real two-participant
Session to listen near the beginning, middle, and end of both sources, confirm
the selected words match the audible source, create the private derivative,
and compare both joins around a removed passage. This local checkpoint does not
claim human audibility, natural-speech correctness, production GCS streaming,
or physical-device playback.

The iPhone editor now reaches the same exact-source boundary through Capture's
existing protected Session cache. It verifies the complete source bytes before
mapping the transcript's program interval into participant source time and
playing that bounded range. The control labels the source audition as distinct
from the unapplied cut and later rendered private preview. Native static
contracts and a generic iOS Simulator build pass; a physical phone still must
prove routed audio, actual word boundaries, video-master audio, and the final
rendered joins with real dialogue.

## Local checkpoint: revision-bound private-preview review — 2026-08-24

Sharing a rendered coaching recording is no longer unlocked by advisory copy.
The server derives review checkpoints for the derivative opening, middle,
ending, and every text-edit join. The standard player records contiguous
browser playback bins and automatically writes one idempotent
`PLAYBACK_REVIEWED` output revision after coverage is complete. The receipt is
bound to the current output content hash, rendered RecordingAsset, and rendered
SHA-256. A single **Play next review point** control navigates to missing
checkpoints without hiding the ordinary player. The Release transaction refuses
missing or stale review evidence.

The combined Session regression passes 109/109 and strict Quipsly TypeScript
passes. Physical acceptance still requires a coach to hear real dialogue and
every rendered join, refresh on a second authenticated endpoint, release to the
named client, and then prove a changed/rerendered edit invalidates the earlier
review. Client-observed playback cannot prove human attention or audibility;
the checkpoint makes no such claim and performs no deployment or external
delivery.

### Native parity checkpoint

Capture now decodes the same server review plan, verifies the exact downloaded
preview bytes, records contiguous player coverage, offers one **Play next review
point** action, and automatically submits the revision-bound `REVIEW` request.
The native release button and client mutation both refuse release until fresh
server readback marks that exact derivative reviewed; a failed receipt save has
an explicit retry. Static contracts and a generic Simulator build are the local
acceptance target for this parity slice. They do not replace a physical-iPhone
headset/speaker listen, real-dialogue join judgment, cross-device readback, or
named-client delivery flight, all of which remain in the ledger above.
