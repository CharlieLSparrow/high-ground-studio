# Domain Model

This file documents the real domain model in `prisma/schema.prisma` plus the app-layer content access model that sits beside it.

## Core Identity

### `User`

Canonical app identity.

Key fields:
- `primaryEmail`
- `name`
- `image`
- `newsletterOptIn`
- `announcementsOptIn`
- `isActive`

Relationships:
- `aliases` -> `UserEmail`
- `roles` -> `UserRole`
- `clientProfile` -> `ClientProfile`
- `memberships` -> `Membership`
- `clientAppointments` -> appointments where the user is the client
- `coachAppointments` -> appointments where the user is the coach

### `UserEmail`

Alias email table.

Purpose:
- lets one human authenticate with multiple Google accounts
- prevents duplicate internal identities when the “wrong” Google address is used

### `UserRole`

Role assignment table.

Current role enum:
- `OWNER`
- `TEAM_SCHEDULER`
- `COACH`
- `CLIENT`

App behavior:
- `OWNER`, `TEAM_SCHEDULER`, and `COACH` all count as team/internal access today
- membership management is narrower than general team access

## Client And Commercial Ops

### `ClientProfile`

One-to-one extension of `User` for client-facing people.

Current usage:
- display name
- internal notes
- anchor for team-client workflows

### `MembershipPlan`

Catalog of plans assignable by the team.

Current fields suggest eventual billing/commercialization support:
- `slug`
- `priceCents`
- `billingIntervalMonths`
- `isActive`

Current reality:
- plans are internal records, not live Stripe products
- seed action currently creates:
  - `coaching-monthly`
  - `coaching-quarterly`

### `Membership`

User-to-plan assignment.

Key fields:
- `status`
- `startsAt`
- `endsAt`
- `grantedByUserId`
- `notes`

Current status enum:
- `ACTIVE`
- `PAUSED`
- `CANCELED`
- `EXPIRED`

Current usage:
- drives the dashboard’s “active membership” display
- managed from the team console, not from Stripe webhooks

## Appointments

### `Appointment`

Scheduling record connecting client, coach, and internal operators.

Key fields:
- `clientUserId`
- `coachUserId`
- `createdByUserId`
- `updatedByUserId`
- `scheduledStart`
- `scheduledEnd`
- `timezone`
- `status`
- `locationType`
- `locationDetails`
- `notes`
- `clientNotes`
- `googleEventId`

Current status enum:
- `SCHEDULED`
- `CONFIRMED`
- `COMPLETED`
- `CANCELED`
- `NO_SHOW`

Current location enum:
- `VIDEO`
- `PHONE`
- `IN_PERSON`
- `OTHER`

Current reality:
- appointments are managed through internal forms and can also be created by converting a coaching request
- request conversion creates an appointment with client, coach, creator, scheduled start/end, timezone, location, and notes
- generated Google Calendar event-template links remain the fallback behavior
- `/team/worldhub` can queue appointment sync jobs and, when dedicated
  `GOOGLE_CALENDAR_*` credentials are mounted, create/update Google Calendar
  events and write `googleEventId`

## Quipsly Goals, Tasks, And Personal Planning

### `Goal`

Durable direction owned by one Quipsly user. A goal may retain room, coaching
booking, Studio project, and parent-goal context without becoming a copy of any
of those records.

Current lifecycle:
- `ACTIVE`
- `PAUSED`
- `ACHIEVED`
- `ARCHIVED`

Session Plan v2 dual-writes canonical goals while retaining its source-marked
`CoachingNote` compatibility projection. Goal progress is append-only evidence;
recording 100 percent does not silently change lifecycle state.

### `GoalTaskLink` And `GoalProgressReceipt`

`GoalTaskLink` connects one canonical ActionItem to one Goal as `CONTRIBUTES`,
`BLOCKS`, or `OUTCOME`. It does not copy either record or synchronize their
statuses. `GoalProgressReceipt` records status/progress decisions, notes, actor,
time, and evidence separately from the current Goal row.

### `TaskRecurrenceSeries` And `TaskOccurrence`

`TaskRecurrenceSeries` is the actor-owned wall-clock rule for repeating
`ActionItem` work. `TaskOccurrence` is the durable, idempotent receipt joining
one scheduled occurrence to at most one canonical `ActionItem`; the series is
never presented as an external-calendar event or notification schedule.

The series stores both an IANA timezone and the human local date/time rule.
Each occurrence stores that local date plus its exact resolved instant. This
keeps a 9:00 AM Denver commitment at 9:00 AM across daylight-saving changes
while giving Today and Calendar one unambiguous timestamp to render. Monthly
rules retain their anchor day, so January 31 can resolve to February's last day
and then return to March 31 rather than drifting to the 28th.

Current cadence semantics:
- `FIXED` materializes the first three occurrences and tops the horizon back up
  when the next open item is completed or canceled;
- `COMPLETION` materializes one occurrence, then creates exactly one successor
  from the completion's local date;
- pause stops future materialization without altering already-created tasks;
- resume restores a bounded horizon of three fixed or one completion-based open
  task without altering already-created tasks; end is terminal;
- cancel skips an occurrence; a completion-based series schedules its next item
  from that explicit skip time instead of becoming an invisible active series;
- stable occurrence keys and completion receipts make retry converge on the
  existing task instead of creating a duplicate; a transaction-scoped lock on
  that exact identity makes simultaneous materialization attempts converge too.

Current boundary:
- a missed occurrence remains an ordinary open task until its owner explicitly
  marks it done or chooses `Skip missed` on the oldest overdue open occurrence;
  that decision preserves the task as `CANCELED`, the occurrence as `SKIPPED`,
  and a shared resolution receipt before topping up the bounded horizon. There
  is no unattended catch-up or auto-skip scheduler;
- fixed schedules are bounded to a three-item planning horizon rather than
  expanding forever;
- Quipsly creates no provider calendar event or local/push notification from a
  recurrence rule;
- native iPhone Task quick capture can author an explicit fixed-schedule or
  completion-based rule into its protected retry outbox. Nest commits the
  deterministic series and canonical occurrences transactionally, and Today
  reads those same occurrence IDs back;
- after a recently verified identity loses transport, the native protected
  shell can capture Note, Task, Goal, or Source only against a cached accessible
  Session. It journals the actor-partitioned payload before attempting sync,
  survives process relaunch, and deletes the phone copy only after Nest
  acknowledges the same client UUID. Recording and every other network action
  remain unavailable in this shell;
- an owner can edit one open occurrence's wording without moving it or changing
  series identity. `THIS_AND_FUTURE` is allowed only from the next open
  occurrence: Quipsly transactionally ends the predecessor, preserves completed
  and skipped history, marks only its still-open horizon as superseded, and
  creates a new versioned series with a stable retry identity;
- there is deliberately no "rewrite the entire historical series" operation.
  Reusing a revision UUID with different wording or rule is an identity
  conflict, and a concurrent task edit/completion aborts the whole revision
  instead of overwriting newer evidence;
- this-and-future editing accepts an explicit IANA timezone on iPhone and Nest.
  Original quick authoring still defaults to the phone's active timezone.
  Physical-device recovery remains open.

### `WorkPlanBlock`

Personal Quipsly planning intent for exactly one accessible open ActionItem or
one active Goal owned by the actor.

Key boundaries:
- a block start/end is when the actor intends to focus, not the task deadline;
- it is not a Goal target, Appointment, CallRoom schedule, publish time, or
  external calendar event;
- completing a block never completes its ActionItem or achieves its Goal;
- create/status/reschedule receipts explicitly record that no provider calendar
  or target lifecycle was mutated.

Current lifecycle:
- `PLANNED`
- `COMPLETED`
- `SKIPPED`
- `CANCELED`

### `WeeklyCommitment`

The existing coaching cadence remains a distinct record rather than being
flattened into tasks. Client-authored weekly commitments now have source receipt
metadata and `clientReviewedAt`; coach review continues to use
`reviewedByUserId`, `reviewedAt`, and `coachNotes`. This keeps self-reflection
from impersonating a coach decision.

## Coaching Requests

### `CoachingRequest`

Client-facing request for a coaching follow-up conversation.

Key fields:
- `clientUserId`
- `preferredContactMethod`
- `email`
- `phone`
- `availabilityNotes`
- `coachingGoals`
- `contactConsent`
- `status`
- `assignedCoachUserId`
- `convertedAppointmentId`
- `internalNotes`

Current status enum:
- `NEW`
- `CONTACTED`
- `SCHEDULED`
- `CLOSED`
- `DECLINED`

Current usage:
- created from the signed-in dashboard coaching request form
- listed on `/dashboard` for the client
- managed from `/team/coaching-requests`
- can be assigned to a coach before conversion
- can be converted to an `Appointment`

Conversion behavior:
- creates an `Appointment`
- marks the request `SCHEDULED`
- sets `assignedCoachUserId`
- links `convertedAppointmentId`
- appends the scheduling note to `internalNotes`
- leaves later appointment edits to `/team/appointments`

Notification behavior:
- new request creation attempts a best-effort internal Resend email after the request transaction commits
- email failure is logged and does not block request creation or redirect

## Studio Manuscript Snapshots

### `StudioManuscript`

Private Studio manuscript library record.

Current intended usage:
- gives `/manuscript` a named manuscript/project layer above the flat snapshot
  stack
- separates `WORKING` manuscripts from `SYNTHETIC` smoke/test drafts
- lets manual snapshots belong to a selected manuscript when possible
- keeps old snapshots loadable when they do not have a manuscript parent

Key fields:
- `ownerEmail`
- `title`
- `description`
- `sourceFileName`
- `kind`
- `lastSnapshotAt`
- `archivedAt`

Current reality:
- the browser-local draft remains the active working copy
- creating a library record stores metadata only, not the full draft JSON
- snapshots are still the explicit server write for manuscript content
- deletion, ownership transfer, autosave, and collaboration are not active

### `StudioManuscriptSnapshot`

Private Studio manuscript snapshot row.

Current intended usage:
- stores an explicit full `ManuscriptDraft` JSON snapshot from `/manuscript`
- supports cross-device loading, especially desktop-to-phone/tablet Recording /
  Reading mode
- remains separate from canonical public manuscript content and public
  projections

Key fields:
- `manuscriptId` optional parent link
- `ownerEmail`
- `title`
- `description`
- `schemaVersion`
- `sourceFileName`
- `draftJson`
- `contentHash`
- `clientUpdatedAt`
- word, character, block, structure, cited quote, and quote review counts

Current reality:
- snapshots are manual, not autosaved
- snapshots can belong to a `StudioManuscript`, but legacy/orphan snapshots
  without a manuscript id remain valid and loadable
- the browser-local draft remains the active working copy
- the schema must be applied to a safe Studio database before snapshot routes can
  persist data
- this is not real-time collaboration or a canonical manuscript document model
- SMS/Twilio notification sending is not wired into the current request flow

## Source Evidence and Annotations

### `StudioSourceUnit`

Canonical imported or captured source identity. `immutableText`, source URL/path,
asset attachment, author, capture time, and metadata describe preserved evidence;
editable interpretation belongs in overlays rather than this source body.

### `StudioPersonalSourceFiling`

Explicit promotion receipt from one actor-owned `Snippet` or `Bookmark` into a
canonical `StudioSourceUnit` in a chosen writable Nest. The operation creates
preserved Research evidence without moving, editing, or sharing the personal
capture record. The receipt pins the source fingerprint, capture type, actor,
destination, and negative side-effect boundary; a stable client request ID and
per-Nest capture uniqueness make retries idempotent.

Once the receipt commits, the personal source leaves Inbox triage but remains
available in Collections. Collaborators receive the new Nest source through
normal project access, not access to the owner's private Collection record. A
saved web link preserves its URL as link evidence and explicitly records that
Quipsly did not import the page body.

An actor-owned `Snippet` may also preserve a selected passage's HTTP(S)
`sourceUrl` plus bounded `metadataJson` for capture mode and the original
device timestamp. A URL-only share remains a `Bookmark`; a passage shared from
Safari's page Share control while selection is active becomes a `Snippet` with
both exact text and webpage provenance. Safari's contextual text-only Share
path does not provide a webpage URL, so Capture labels that state honestly
instead of inferring one. Later Research filing reads the original captured
time from this metadata rather than substituting the delayed Nest sync time.

### `StudioSourceAnnotation`

Permission-aware overlay anchored to one `StudioSourceUnit` and optionally its
document projection. Text anchors retain UTF-16 character positions, the exact
quote, prefix/suffix context, and a SHA-256 fingerprint of the preserved source.
Time/media selectors have separate second-based fields. A selector mismatch is
a conflict requiring reselection; Quipsly does not silently move the note.

Key boundaries:

- `private` annotations are visible only to their author; `project` annotations
  also require active Nest access;
- the author owns active/resolved/archived review state;
- `StudioTag` remains the canonical project taxonomy and joins through
  `StudioSourceAnnotationTag`;
- client request IDs make retried saves idempotent per author;
- annotation creation, review, and archive never mutate source text/media;
- legacy `StudioTaggedSpan` and `QuipLoreUserAnnotation` rows remain readable
  compatibility stores until an explicit, verified migration maps them.

### `StudioSourceAnnotationRevision`

Append-only created/updated/resolved/reopened/archived receipt containing the
selector, note, visibility, status, source fingerprint, and tag IDs at that
revision. This is audit/recovery evidence, not a second editable annotation.

### `StudioSourceAnnotationUse`

Typed evidence-to-writing link from an annotation to the exact project,
document, and block that used it. It snapshots the quote and citation label,
retains a stable citation key and source fingerprint metadata, records the human
actor, and supports idempotent client retries. The first supported operation
creates a private draft plus reversible `StudioDocumentOperation`; it never
changes the source or annotation. `evidence`, `quotation`, `inspiration`, and
`counterpoint` remain distinct use meanings rather than generic backlinks.

### Research export and restore

`quipsly-research-export-v1` is the portable envelope for one actor-visible Nest
research graph. It contains full preserved source text and per-source SHA-256,
canonical tags, actor-scoped annotation overlays and their revision history,
writing-use references, explicit privacy/provider boundaries, and a stable
whole-manifest digest.

Restore is intentionally a new import receipt, not a rewind or an overwrite:

- validation checks the whole manifest, each source fingerprint, exact text
  anchors, record counts, destination write access, and bounded bundle size
  before mutation is offered;
- validate is the default mode and returns a visible create/reuse/collision plan;
- apply requires an explicit second request, creates versioned source copies on
  slug/content collision, reuses exact sources and existing taxonomy, and never
  edits destination source text;
- deterministic per-actor restore request IDs make a retry idempotent;
- restored annotation provenance retains the source manifest, original IDs,
  exported revision history, and `restored-from-export` receipt;
- writing-use rows are exported but deliberately deferred until their target
  document/block payload is portable too. The UI states that boundary instead
  of inventing a backlink to a document that was not restored.

### Research to Studio handoff

`StudioOutputPacket.kind = research-studio-handoff` is the canonical, read-only
bridge from a reviewed Nest annotation into Quipsly Studio. Each packet uses the
`quipsly-research-studio-handoff-v1` envelope and is immutable for one
`annotationId + revision` pair.

- the packet pins the exact quote, offsets, annotation revision/operation, tags,
  source path, and full-source SHA-256 without copying or changing source media;
- only `project`-visible annotations can enter the shared Studio inbox; private
  annotations must remain private until their author deliberately changes the
  sharing boundary;
- public writing-use pointers may be carried, but private writing is represented
  only by a count and privacy receipt. Its document/block IDs, titles, and bodies
  are not disclosed;
- a retry reuses the same packet slug, while a later annotation revision produces
  a new packet; source-fingerprint or exact-anchor drift blocks handoff;
- `ready-for-studio` means the verified brief is available for human review. It
  does not authorize an edit, media mutation, export, upload, or publication;
- the Mac app receives these records only through its Firebase bearer-token
  session context and shows them in the read-only Nest evidence inbox.

### Playback-reviewed transcript corrections

`TranscriptSegment` is immutable provider evidence. `TranscriptCorrection` is
the canonical overlay for corrected words and speaker assignments, and
`TranscriptCorrectionRevision` is its append-only decision history.

- each correction pins the provider job/segment, original text SHA-256, exact
  original text/speaker, and unchanged media start/end times;
- a human correction can become `accepted` only when protected promoted media
  exists, the reviewer explicitly confirms listening, and the player's current
  position is inside the segment window;
- AI output always enters as `proposed`. Accepting an AI proposal requires the
  same playback proof; rejecting it preserves the proposal and its receipt;
- optimistic provider and active-overlay checks prevent a stale browser from
  replacing evidence it did not see. A retry is actor-idempotent;
- accepting a replacement marks the previous overlay `superseded`; provider
  text is never updated or deleted. Corrected transcript versions make in-place
  provider-segment regeneration fail closed and require a new job;
- consent/release policy and room access are rechecked on reads, writes, and
  idempotent replays. Held sessions return no transcript fallback;
- Nest owns correction decisions beside protected playback. Studio receives a
  Firebase-bearer, read-only correction inbox with proposals visibly distinct
  from accepted overlays and a link back to the session review desk.

## Coaching Feature Access

Coaching tools are modeled separately from subscription tiers. This lets Homer
turn a tool on for a specific client because it fits the coaching work, not
because the client happened to be in a broad plan bucket.

### `CoachingFeature`

Internal catalog of coaching tools that can be shown to clients.

Current reality:
- seeded from `/team/clients`
- stores feature key, title, category, client summary, coach summary, status,
  and sort order
- starter catalog includes session prep, weekly commitments, reflection journal,
  values scorecard, milestone tracker, resource library, post-session actions,
  and between-session check-ins

### `CoachingFeatureGrant`

Manual client-specific access row for one `User` and one `CoachingFeature`.

Current reality:
- written from `/team/clients`
- supports `enabled`, `paused`, and `disabled` status values
- supports `client_and_coach` and `coach_only` visibility
- stores source, optional notes, optional end date, and the granting team user
- `/dashboard` only shows enabled, non-expired, client-visible grants

## WorldHub Business Infrastructure

WorldHub keeps provider state, growth work, and commercial follow-through
app-owned before specific providers mutate app state.

### `WorldHubProviderConnection`

Provider readiness ledger for Stripe, Patreon, Google Calendar, merch,
transactional email, analytics, search, ads, affiliates, sponsors, and the
app-owned cart boundary.

Current reality:
- stores provider kind, capabilities, expected env names, configured env names,
  missing env names, setup notes, and health/readiness state
- does not store secret values
- refreshed from `/team/worldhub` and `/team/growth`

### `WorldHubProviderEvent`

Verified provider-event inbox.

Current reality:
- Stripe and Patreon webhook routes can verify signatures and write safe event
  summaries
- payment reconciliation, entitlement mutation, and fulfillment mutation are
  still later steps

### `WorldHubProviderSyncJob`

App-owned job ledger for provider sync attempts.

Current reality:
- Google Calendar appointment sync writes queued/completed/failed job rows
- the model is generic enough for analytics, search, merch, or fulfillment sync
  jobs later

### `WorldHubCatalogItem`, `WorldHubOffer`, `WorldHubCart`, `WorldHubOrder`,
and `WorldHubFulfillmentJob`

Commerce staging records.

Current reality:
- these are app-owned cart/order/catalog/fulfillment rails
- no Stripe Checkout session creation, automatic payment reconciliation, or
  merch fulfillment provider call is active yet

### `WorldHubSeoBrief`

Private SEO planning brief for a page, offer, episode page, book page, or
collection.

Current reality:
- stores target path/URL, keyword fields, meta title/description, intended
  structured data type, checklist JSON, notes, and creator email
- written from `/team/growth`

### `WorldHubAnalyticsSnapshot`

Manual or future-provider-imported analytics snapshot.

Current reality:
- stores source, channel, content path, period dates, metrics JSON, notes, and
  capture metadata
- written manually from `/team/growth` until GA/Search Console/AdSense imports
  are added

### `WorldHubMonetizationPlacement`

Private ad, affiliate, book recommendation, sponsor, or merch placement record.

Current reality:
- stores placement type, target path, provider key, destination URL, disclosure
  text, call to action, and metadata JSON
- public affiliate/ad publishing remains a reviewed later step

### `WorldHubMonetizationResearchNote`

Private research note for monetization options, comparable project patterns,
provider rules, and commercial next actions.

Current reality:
- stores project profile, monetization type, status, confidence, source title
  and URL, source publisher/date, summary, takeaways, risks, next actions, tags,
  and creator email
- seeded and written from `/team/growth`
- supports the research map in
  `docs/analysis/worldhub-monetization-research-map.md`

## Content Access Model

Content access is currently an app-layer model, not a Prisma model.

### Access values

From `src/lib/content-access.ts` and `src/lib/content-mode.ts`:
- `public`
- `members`
- `team`
- `private`

### Content modes

For staff/internal review:
- `public`
- `editor`
- `charlie`
- `skippy`

Current behavior:
- non-team users only see public/published content
- team users can switch modes via cookie-backed content mode logic
- `/library` and `/episodes` rely on this model for visibility decisions

## Important Domain Boundaries

- Auth identity and staff bootstrap are env-assisted.
- Clients, memberships, and appointments are Prisma-backed and operational.
- Coaching requests are Prisma-backed and operational, including internal request-to-appointment conversion.
- Stripe commercialization is not the source of truth yet.
- Donation/payment support is currently an external link, not app-owned Stripe Checkout state.
- Google Calendar support is generated links, not OAuth/API sync.
- Content publishing is split between stable metadata arrays and a guarded MDX route path.
