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
client through the rendered appointment form, copies the exact private client
entry exposed by the product, and opens that entry in an independent signed-out
browser. The client sees only the private Session sign-in gate, creates a new
account with the invited address, and returns to the exact Session. Read-only
database assertions confirm the `COACH` role record, absence of client staff
authority, requested timezone, participant identities, booking, room, and
durable coaching engagement.

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

Test lane: `fresh-ui-automation`

Human acceptance satisfied: **no**

`pnpm quipsly:fresh:coaching-flight` now creates a new coach and client and
passes one private context from the rendered start through every deeper
operation. It does not accept or construct a retained room ID. The second full
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

## Minimally instructed human flight

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

## Acceptance lanes are not interchangeable

Every result must name exactly one lane. A passing lower lane never promotes
itself into a higher claim.

| Lane | Starts from | Proves | Explicitly does not prove |
| --- | --- | --- | --- |
| Retained regression | Reserved fixture identities and durable fixture rooms | Known mechanics have not regressed | Discoverability, onboarding, or fresh-account integrity |
| Fresh UI automation | New `.dev.test` accounts created through rendered public pages | The ordinary product can create and continue a new coaching relationship without copied IDs or database repair | Real inbox delivery, natural speech, physical devices, or human understanding |
| Fresh audible automation | Fresh UI automation plus two isolated, role-specific audible sources | Each participant owns a distinct recording; Whisper recovers role-specific speech; protected playback and downstream share mechanics operate | Natural speech quality or a human playback-review receipt |
| Minimally instructed human flight | Real inboxes, ordinary navigation, real devices, and one sentence | A coach and client can understand and complete the end-to-end job without guidance | Fifty-person concurrency or organization-wide support readiness |
| Cohort operation | Instrumented 2, then 10, then 50-coach release | Recovery, support, privacy, and capacity remain healthy under real use | That future product changes remain safe without rerunning the ladder |

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
