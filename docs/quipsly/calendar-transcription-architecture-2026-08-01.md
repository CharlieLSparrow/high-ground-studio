# Quipsly calendar and session intelligence architecture

Status: implementation architecture

Date: 2026-08-01

Owners: Quipsly Capture, Nest, and QuipslyStudio

## Outcome

Quipsly should make a coaching practice and a podcast production feel organized
without turning Google Calendar, Apple Calendar, or an AI summary into a second
source of truth. Quipsly owns the session, episode, consent, source recording,
transcript, reviewed notes, goals, tasks, and provenance. Calendar providers
project selected scheduling facts. Speech providers propose anchored text.
People decide what becomes shared work.

The first production shape is deliberately asymmetric:

- Quipsly is canonical.
- Google Calendar is a connected operational projection with durable receipts.
- Apple Calendar receives explicit one-event exports from the iPhone and does
  not require broad read access.
- iCalendar feeds are revocable, read-only projections with stable identifiers.
- Recordings remain immutable source evidence.
- Transcript corrections are overlays, not mutations of provider output.
- Notes, goals, and tasks inferred from a transcript remain candidates until a
  person accepts or edits them.
- Coaching and podcast packets use different templates, permissions, language,
  and downstream actions.

## Product vocabulary

| Concept | Meaning | Canonical owner |
| --- | --- | --- |
| Session | A coaching, podcast, interview, or internal room with participants, consent, sources, and time | `CallRoom` |
| Appointment | A scheduled human commitment | Quipsly booking/session models |
| Work block | Personal intent to spend time, movable without changing a client appointment or release date | `WorkPlanBlock` |
| Production milestone | Recording, edit, review, approval, scheduled publication, or release date for an episode/project | Quipsly production records |
| Calendar projection | A provider event bound to one canonical object and its current version | Calendar binding and receipt records |
| Transcript source | Immutable provider response plus exact recording generation and checksum | Transcript manifest/result ledger |
| Transcript overlay | Human correction, speaker mapping, redaction, or annotation over source anchors | Revisioned Quipsly records |
| Session packet | Purpose-specific, source-linked candidates prepared for human review | Revisioned notes/output records |
| Commitment | A reviewed goal or task with owner, timing, visibility, and source | `Goal` / `ActionItem` / task model |

## Calendar experience

### Calendar setup

Nest presents three independent choices instead of one vague “calendar sync”
switch:

1. **Quipsly Coaching calendar** — client sessions, preparation windows, and
   follow-up due dates. A coach chooses whether attendee invitations are sent.
2. **Podcast Production calendar** — recording sessions, clip/script deadlines,
   edit reviews, approvals, and publication dates for selected projects.
3. **My calendar** — an optional personal connection for availability and
   explicitly published work blocks. Private work blocks stay private by
   default.

Every connection screen states what Quipsly can read, what it can write, the
selected provider calendar, the last successful sync, and how to disconnect.
“Connected” is never displayed from possession of a token alone; a read-only
provider check must pass.

### Coaching calendar

The default event shows the client-approved title, local time and timezone,
duration, attendance state, and a stable Quipsly session link. Private coach
notes, coaching goals, transcript text, and recording links never enter the
calendar description. Preparation and follow-up are separate Quipsly work
blocks so rescheduling a session does not silently rewrite private plans.

The scheduling flow is:

1. Select an offering and an available time.
2. Hold the slot with an expiration receipt.
3. Confirm the booking in Quipsly.
4. Create/update the provider projection using a deterministic provider event
   identity.
5. Invite attendees only when the booking policy explicitly enables it.
6. Record provider `etag`, status, update timestamp, link, and the exact Quipsly
   version projected.
7. On cancellation, cancel Quipsly first and then reconcile the provider event,
   preserving both receipts.

### Podcast production calendar

The episode workspace owns a compact production plan:

- research lock;
- script/run-of-show ready;
- guest/host technical check;
- recording session;
- source upload verified;
- transcript review;
- rough cut;
- editorial review;
- final approval;
- scheduled publication;
- clips and follow-up publication windows.

Milestones may be assigned and dependency-linked. Calendar events link back to
the exact episode and milestone. A shared HGO production calendar contains
team-visible milestones; personal editing blocks remain private unless their
owner explicitly publishes them.

### Google Calendar adapter

The existing managed coaching adapter remains the first organizational path.
It already uses deterministic event IDs, explicit sync/cancel commands,
conservative notification defaults, and append-only Quipsly receipts. Evolve it
behind a general adapter contract rather than replacing it.

Its side-effect-free readiness probe must exercise the same event collection as
the adapter's writes. With the intentionally narrow `calendar.events` scope,
`events.list` succeeds while the separate calendar-metadata endpoint can return
HTTP 403. Quipsly therefore requests the event-list resource with a partial
response restricted to its collection kind, never requests event content, and
never creates, updates, deletes, or sends during readiness verification.

The connected-account path requests the narrowest useful scopes:

- calendar list read-only to let a person select a destination;
- `calendar.events.owned` when projecting only to calendars the person owns;
- `calendar.app.created` when Quipsly creates and manages a dedicated secondary
  calendar;
- broader `calendar.events` only when the user selects a shared calendar that
  the narrower scope cannot manage.

Provider access and refresh tokens live in Secret Manager or an encrypted
credential store and are referenced by opaque IDs. Tokens, authorization codes,
and attendee addresses never enter sync receipts or client logs.

Each event carries private extended properties with the canonical object ID,
binding ID, projection version, and truth owner. Google event creation uses a
deterministic ID to make retries idempotent. Updates use `PATCH`, preserve
conference data, and compare `etag`/provider update time. An initial full sync
produces a sync token; later syncs are incremental. A rejected sync token
triggers a bounded full resync. Push channels are renewable leases, not proof
that events are current.

Provider-side changes are classified:

- attendee RSVP: import as evidence;
- time/title changed on a Quipsly-owned projection: show a conflict proposal;
- provider event deleted: mark missing and ask whether to recreate or cancel in
  Quipsly;
- unrelated provider event: availability only, never a Quipsly session;
- changes made during an in-flight Quipsly write: resolve using projection
  version, `etag`, and a visible conflict record.

### Apple Calendar and iCalendar

On iPhone, the first action is **Add to Calendar…** using the system event editor.
That lets the person choose the calendar and approve the event without Quipsly
requesting access to read every calendar. If a later feature needs background
creation, request write-only EventKit access. Full calendar access is reserved
for an explicitly enabled local calendar view and must never be requested just
to export one event.

Quipsly also provides:

- a standards-compliant `.ics` download for one appointment or milestone;
- revocable `webcal` subscription feeds for a coaching calendar, production
  project, or “my Quipsly commitments”;
- stable `UID`, `DTSTAMP`, `SEQUENCE`, timezone, and `VALARM` behavior;
- `RECURRENCE-ID` only when Quipsly owns an actual recurring series;
- CRLF line endings, UTF-8 escaping, and RFC line folding;
- no secrets or private notes in calendar fields;
- a capability token stored hashed, scoped to one feed, and revocable.

ICS subscriptions are read-only in the first release. Quipsly does not pretend
that inbound ICS edits can be reconciled safely. CalDAV is deferred until real
customer demand justifies a full bidirectional protocol implementation.

## Calendar data evolution

The existing `CalendarEventLink` remains readable. Add normalized models through
an additive migration and backfill existing Google receipts:

```text
CalendarConnection
  id, workspaceId/nestId/userId, provider, connectionKind, credentialRef
  grantedScopes, status, verifiedAt, revokedAt, metadataJson

CalendarCollection
  id, connectionId?, workspaceId/nestId/ownerUserId, purpose
  displayName, timezone, providerCalendarId?, visibility, isDefault

CalendarProjection
  id, collectionId, sourceType, sourceId, sourceRevision
  providerEventId?, providerEtag?, providerUpdatedAt?
  uid, sequence, status, conflictState, lastSyncedAt

CalendarSyncCursor
  id, collectionId, syncTokenRef?, channelId?, channelResourceId?
  channelExpiresAt?, lastFullSyncAt?, lastIncrementalSyncAt?

CalendarSyncReceipt
  id, projectionId?, connectionId, operation, outcome
  requestDigest, responseDigest, providerStatus, occurredAt, metadataJson

CalendarFeed
  id, nestId/userId, purpose, tokenDigest, status, timezone
  lastGeneratedAt, revokedAt
```

Source references are constrained to supported canonical types. A unique key on
collection/source type/source ID prevents duplicate projections. Provider IDs
are unique within a connection/calendar, not globally. Receipts are append-only;
the projection is current state.

## Transcription architecture

### Capture and provider selection

Quipsly already binds every transcript job to an exact recording object,
generation, byte count, media type, checksum, room, asset, consent gate, and raw
provider response. Keep that contract.

Deepgram remains the production primary while it wins real Quipsly evaluation:

- it returns word timestamps and speaker labels needed by the editor;
- the existing worker is resumable and stores the raw response once;
- `diarize=true` is deprecated and pinned to the old diarizer, so new batch
  manifests use `diarize_model=latest` while old manifests remain replayable;
- isolated participant channels use multichannel transcription;
- a mixed microphone or room recording uses diarization;
- sources with multiple speakers within each isolated channel may use both, with
  channel-local speaker identity normalized deliberately.

Provider choice is configuration on an immutable job, not a global mutable
switch. A versioned evaluation harness runs consented representative podcast and
coaching recordings through candidate providers and scores:

- word error rate on a human reference sample;
- speaker confusion and speaker-map editing time;
- timestamp drift at 15, 30, 60, and 120 minutes;
- names, brands, jargon, and profanity;
- overlapping speech and room echo;
- action/decision retrieval recall after transcript correction;
- latency, cost, retry behavior, and privacy terms.

No provider migration is approved from vendor marketing alone.

### Transcript review UX

The session review surface has four clear states:

1. **Source** — recording health, consent, provider, model, language, and exact
   immutable receipt.
2. **Transcript** — playback-following words, speaker colors/names, confidence
   cues, search, and keyboard/touch correction tools.
3. **Packet** — purpose-specific candidate notes and tasks, each linked to the
   source time range.
4. **Shared follow-through** — only reviewed notes, goals, and tasks with named
   owners and visibility.

Editing text creates a correction revision. Renaming a speaker creates a speaker
map revision. Redaction is a separate overlay with an audit trail and export
policy. The raw provider response and recording are never overwritten.

### Coaching packet

A coaching packet starts private to its author. It contains independently
reviewable lanes:

- session arc and themes;
- decisions and insights;
- client commitments;
- coach commitments;
- goals and progress evidence;
- obstacles, support, and resources;
- questions to revisit;
- next-session agenda;
- private coach notes;
- client-safe recap.

Each candidate shows speaker, timestamp, text excerpt, and confidence/provenance.
Actions are **Accept as task**, **Add to goal**, **Keep as note**, **Edit**,
**Dismiss**, and **Play source**. Accepting a task requires owner, due semantics,
visibility, and optional project/goal. Sharing creates a recipient-bound,
revisioned snapshot; it never flips every source note to shared. Multiple coaches
can collaborate only through explicit Nest/session membership and role-aware
visibility. Client-safe material is separate from team and author-private notes.

This design follows coaching confidentiality practice: Quipsly records the
agreement about who receives what, applies the same obligations to AI-assisted
processing, and supports retention/deletion policies rather than treating a
transcript as casual chat history.

### Podcast packet

A podcast packet uses a different vocabulary and permissions:

- episode arc and chapters;
- claims and fact-check queue;
- title, description, and show-note candidates;
- clip/short candidates with source ranges;
- quote candidates;
- edit decisions and continuity issues;
- source/licensing and sponsor checks;
- production tasks and owners;
- publication and repurposing plan.

Accepted candidates become episode-scoped documents, annotations, edit
decisions, or tasks. QuipslyStudio reads the same stable source anchors for deep
timeline work. A podcast packet must never inherit coaching-only client-safe or
private-coach semantics.

### Automated notes and tasks

Automation is a staged proposal pipeline:

```text
verified source + consent
  -> immutable transcript job
  -> human speaker/correction review
  -> deterministic candidate retrieval
  -> optional model annotation/synthesis
  -> purpose-specific review packet
  -> human edit/accept/dismiss
  -> revisioned note/goal/task
  -> explicit share/release
```

Deterministic retrieval supplies recall for commitments, decisions, questions,
dates, and notable moments. Models may cluster, label, summarize, and suggest
wording. They may not create shared commitments, publish copy, alter source
media, or infer consent. Every accepted result stores source anchors, packet and
model version, reviewer, review time, and the final human-edited text.

## Security and privacy invariants

- Recording and transcription consent are independent, versioned, participant-
  scoped decisions.
- Calendar descriptions never contain transcript excerpts, private coaching
  notes, or unreviewed goals.
- Private coaching notes are excluded from shared packets and provider events by
  construction, not just by UI convention.
- OAuth tokens and feed bearer tokens never appear in database receipts, logs,
  analytics, URLs shown in screenshots, or Git.
- Feed tokens are high-entropy, stored as digests, scoped, revocable, and
  rotatable.
- Every model-produced item is visibly a candidate and retains provenance.
- Deletion and retention operate separately on raw recording, transcript,
  corrections, packets, shared outputs, and provider projections.
- Separate-account tests prove that another client, coach, project member, and
  anonymous user cannot read private session artifacts.

## Delivery plan

### Slice 1 — provider and packet truth

- move new Deepgram jobs from deprecated boolean diarization to the versioned
  diarizer while preserving legacy manifest replay;
- record audio-layout intent for future isolated-channel sources;
- stamp packets with session purpose and a versioned template;
- show only coaching lanes for coaching sessions and production lanes for
  podcast sessions;
- keep all candidates author-private until accepted/released;
- test source anchors and the no-automatic-task boundary.

### Slice 2 — calendar export and managed calendars

- factor the existing Google adapter behind purpose/collection configuration;
- add coaching and HGO production managed calendars;
- add safe one-event ICS generation and iPhone system event editing;
- expose sync state and receipts in the session/episode UI;
- test idempotent retry, cancellation, timezone/DST, secrets, and privacy.

### Slice 3 — connected accounts and subscriptions

- add per-user Google OAuth with incremental authorization and narrow scopes;
- add calendar selection and a clear disconnect/delete-token flow;
- add revocable read-only webcal feeds;
- add incremental sync, renewable watches, conflict inbox, and provider RSVP
  evidence;
- complete Google OAuth verification before public use.

### Slice 4 — collaborative coaching follow-through

- packet review/editor with private, coaching-team, and client-safe lanes;
- explicit task/goal materialization with owner/due date/project/tag controls;
- recipient-bound shared recap revisions and opening receipts;
- next-session agenda carried forward with source links;
- two real coaching sessions and separate-account privacy proof.

### Slice 5 — podcast production intelligence

- episode production milestones and project calendar;
- podcast packet review into manuscript, show notes, fact checks, clips, and
  tasks;
- synchronized handoff to QuipslyStudio timeline anchors;
- two real HGO episodes, export/listen proof, and publication readback.

## Acceptance gates

A feature is not complete because an API returned 200. Release evidence must
show:

- one coaching appointment created, rescheduled, and canceled across Quipsly and
  a real calendar without duplication;
- one episode plan projected to a production calendar with private work blocks
  excluded;
- timezone and DST boundaries verified;
- revoked OAuth and ICS feed access fails closed;
- an iPhone can add one event without Quipsly reading the entire calendar;
- one mixed coaching recording and one isolated-track podcast recording produce
  speaker-usable, source-linked transcripts;
- corrections survive reload and remain overlays;
- candidate tasks remain candidates until explicitly accepted;
- a coach edits, shares, revises, and revokes a client-safe recap;
- another client and an unrelated project member are denied;
- accepted podcast annotations open the exact source range in Studio;
- provider/source/model/build IDs and external effects are preserved in redacted
  receipts.

## 2026-08-01 implementation checkpoint

The first provider-independent calendar spine is implemented as an additive
schema migration and an authenticated Schedule read model:

- `CalendarConnection`, `CalendarCollection`, `CalendarProjection`,
  `CalendarSyncCursor`, `CalendarSyncReceipt`, and `CalendarFeed` separate
  credentials, selected calendars, canonical projections, provider cursors,
  append-only effects, and revocable subscriptions;
- database checks require every connection and collection to have exactly one
  Quipsly owner boundary (workspace, Nest, or person);
- credentials and provider sync tokens remain opaque references, while feed
  bearer material is represented only by a digest;
- `/api/calendar/overview` authenticates before database access, reads only the
  signed-in person's collections and accessible Nests, forbids shared caching,
  and returns no provider calendar IDs, credentials, tokens, attendee lists, or
  provider error details;
- `/schedule` now explains coaching, podcast-production, and personal-calendar
  boundaries independently, including what is copied, what is never copied,
  the recommended provider, the honest fallback, current verification state,
  and the latest redacted receipt;
- external writes remain held unless a relevant provider connection is
  `VERIFIED`; configuration or token availability alone does not display as
  connected.
- after a managed Google write succeeds, Quipsly now atomically records its
  legacy compatibility link and the normalized workspace connection,
  collection, stable projection, and redacted effect receipt. Provider failures
  expose only HTTP status, never a raw response body.

This checkpoint does not claim Google OAuth, subscription-feed delivery,
provider reconciliation, or production deployment. Those remain in Slices 2
and 3 and must pass the real-calendar acceptance gates above before release.

Exact implementation source `64294dc2a7162b757fed0bb91e0fddac35c9bc30`
passed an empty-database replay of all 34 migrations, idempotent second replay,
and zero Prisma schema drift. A retained `.test` user then operated the local
rendered Schedule at desktop and phone width and proved the authenticated,
redacted overview contract with no provider or external effect. Evidence is
recorded in `docs/coordination/2026-08-01-calendar-projection-spine.md`.

## 2026-08-01 subscription and provider research refresh

The read-only subscription boundary is now implemented for three explicit
scopes: one person's accepted commitments, one person's coaching appointments,
or scheduled podcast rooms in one accessible episode Nest. Creating a feed
returns 256 bits of bearer material once; Quipsly stores only its domain-
separated SHA-256 digest. Replacing or revoking the feed makes the old URL return
the same non-enumerable 404. Every successful render records a no-external-
mutation receipt. Feed events use stable UIDs, monotonic integer revisions,
CRLF, UTF-8 folding, one-hour refresh hints, and transparent task/goal due
markers so a deadline does not pretend to reserve availability. Private notes,
transcript text, recordings, participant addresses, and provider identifiers
are excluded by the server-side projection.

The same boundary is now reachable natively from a compact, expandable
**Calendar continuity** card near the top of Capture's Today surface. It uses
the signed-in Nest identity rather than handing the user through a second web
login. A person can create, replace, or revoke the personal, coaching, and
selected podcast-Nest feeds; Apple Calendar receives a `webcal` action while
the standard HTTPS subscription URL can be shared to Google Calendar or other
clients. The raw bearer capability remains in process memory only and is
cleared when hidden, replaced, revoked, or the app process ends. Status refresh
returns metadata only and cannot reconstruct the private link. Preview mode
renders the entire decision surface read-only without inventing a capability.
The card stays collapsed outside setup/maintenance so calendar plumbing does
not displace Today work.

The current provider guidance changes the implementation details, not the
source-of-truth architecture:

- Google incremental sync must preserve the exact original query parameters,
  page until the final `nextSyncToken`, include deletions, and discard local
  provider projection state for a bounded full sync after HTTP 410. Push
  notifications are wake-ups rather than data; channels expire and must be
  renewed. Channel verification material must not contain OAuth credentials or
  private Quipsly data. Quota guidance favors push plus randomized maintenance,
  exponential backoff, and a separate test project over synchronized polling.
- RFC 5545 requires persistent globally unique `UID` values. `SEQUENCE` starts
  at zero and increases for significant organizer revisions. Quipsly feeds use
  source-derived stable identities and revision timestamps constrained to the
  interoperable integer range; they do not mint a new identity when an event is
  rescheduled or canceled.
- Deepgram's current prerecorded path supports Nova-3, the versioned diarizer,
  multichannel audio, word timings, utterances, smart formatting, paragraphs,
  callbacks, and request tags. Async callbacks should be authenticated, made
  idempotent by provider request ID, and stored before acknowledgement because
  the provider retries unsuccessful callbacks. Large video should have its
  audio extracted before submission, and long jobs should use the async path
  rather than relying on one synchronous request.
- Apple requires age rating, Content Rights, DSA status where applicable,
  version review information, support/privacy links, and accurate App Privacy
  declarations before submission. Starting in July 2026, the questionnaire
  includes social-media capability. The canonical Capture packet now records
  the exact shipping facts and privacy-manifest data types but deliberately
  keeps legal/privacy publication account-holder gated.

## Research basis

- Apple EventKit access levels and iOS 17 usage descriptions:
  https://developer.apple.com/documentation/eventkit/accessing-the-event-store
- Google Calendar OAuth scopes:
  https://developers.google.com/workspace/calendar/api/auth
- Google event creation and deterministic event IDs:
  https://developers.google.com/workspace/calendar/api/guides/create-events
- Google incremental synchronization:
  https://developers.google.com/workspace/calendar/api/guides/sync
- Google push notifications:
  https://developers.google.com/workspace/calendar/api/guides/push
- iCalendar RFC 5545:
  https://www.rfc-editor.org/rfc/rfc5545
- Deepgram diarization and versioned diarizer:
  https://developers.deepgram.com/docs/diarization
- Deepgram multichannel guidance:
  https://developers.deepgram.com/docs/multichannel-vs-diarization
- Deepgram prerecorded API and async callback authentication:
  https://developers.deepgram.com/docs/pre-recorded-audio
  https://developers.deepgram.com/docs/callback
- Apple required App Store properties and July 2026 age-rating change:
  https://developer.apple.com/help/app-store-connect/reference/app-information/required-localizable-and-editable-properties/
  https://developer.apple.com/app-store/whats-new/
- ICF Code of Ethics confidentiality and technology obligations:
  https://coachingfederation.org/credentialing/coaching-ethics/icf-code-of-ethics/
