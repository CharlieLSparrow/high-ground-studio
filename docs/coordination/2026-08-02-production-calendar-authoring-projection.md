# Production calendar authoring and Google projection

Date: 2026-08-02

## Outcome

Calendar is now an operating surface for the canonical podcast-production
runway, not just a read-only projection. A user with episode-project write
access can create a typed production milestone, start it, complete it, or
cancel it from Calendar. Every mutation is revisioned in Quipsly before any
provider action is possible.

The existing Google Calendar boundary now also understands
`StudioEpisodeMilestone`. Milestone projection is deliberately separate from
canonical authoring:

1. create or revise the Quipsly milestone;
2. inspect an exact provider preview;
3. explicitly create or update the selected owned Google calendar;
4. retain the provider receipt and ETag;
5. explicitly remove the provider event when required.

No milestone authoring or lifecycle action implicitly mutates Google Calendar.

## Canonical operation

- Calendar delegates creation and lifecycle to the same canonical
  `episode-production-milestones` service used by Episode Room. It does not own
  a second milestone transaction or revision format.
- Creation requires current project write access and an episode in the active
  Nest. A client-generated request ID is retained across retry.
- The server derives an actor-, episode-, and request-specific idempotency key,
  takes a transaction advisory lock, and rejects a changed retry.
- Lifecycle updates use an expected revision. A stale client receives a
  conflict instead of overwriting newer work.
- Every accepted create, update, complete, or cancel operation appends a
  `StudioEpisodeMilestoneRevision` snapshot.
- Dates retain the chosen IANA timezone. A point milestone has no invented
  blocking duration; an explicit start/end window is a real reservation.
- Calendar only exposes lifecycle controls when the signed-in user still has
  project write access.

## Provider boundary

- Call Room Sessions and production milestones now use one provider-operation
  service for access-token acquisition, deterministic create recovery, ETag
  protection, source revalidation, effect receipts, explicit cancellation, and
  conflict persistence. The routes own authorization and source projection;
  neither route owns a second Google transaction implementation.
- The milestone route resolves the exact selected
  `PODCAST_PRODUCTION` collection for the current user, Nest, and verified
  Google connection. It cannot borrow another lane or another user's calendar.
- Exact preview is a provider-free read. Create/update/cancel is explicit.
- Existing Call Room event IDs remain byte-for-byte stable. Milestones use a
  source-type namespace before deterministic ID hashing to prevent cross-model
  collisions.
- Point milestones project as `transparent`; explicit reserved windows project
  as `opaque`.
- Writes retain provider event ID, ETag, source revision, request fingerprint,
  and an operation receipt. A no-op replay does not reacquire OAuth or call the
  provider.
- Provider ETag conflict, provider deletion, Quipsly changing during a provider
  call, and unknown provider outcome all become retained conflicts with an
  explicit retry or review path.
- If Google responds but source or authorization revalidation fails, the shared
  service retains the observed provider identity and a conflict receipt before
  returning. A storage failure is distinguished from an unknown provider
  outcome so an operator is never told a write was safely absent.
- Conflict review is now source-polymorphic but authorizes Call Rooms and
  milestones at their actual domain boundary before exposing safe source
  context or accepting a resolution.

This follows Google's guidance to use supplied event IDs for duplicate
prevention, ETags for conditional updates, incremental sync tokens with a full
resync after `410 Gone`, and private extended properties for application
identity:

- <https://developers.google.com/workspace/calendar/api/guides/create-events>
- <https://developers.google.com/calendar/api/guides/version-resources>
- <https://developers.google.com/workspace/calendar/api/guides/sync>
- <https://developers.google.com/workspace/calendar/api/guides/extended-properties>
- <https://developers.google.com/workspace/calendar/api/guides/errors>

## Real retained operation

The retained local QA coach operated the rendered Calendar against PostgreSQL:

- Created episode production `qa-calendar-episode-production-20260802` in the
  QA coach's Home Nest because that test Nest had no episode.
- Created point milestone `cmscdv4lg0000ayxl3g7fk6mq`, titled
  `QA Retained · Clip review handoff`, in `America/Denver`.
- Calendar reported that the milestone was saved in Quipsly and that no
  external calendar changed.
- Started the milestone through the rendered lifecycle control.
- Independent database readback found status `IN_PROGRESS`, revision `2`, and
  append-only `CREATE` and `UPDATE` revision receipts.
- Final architecture review then removed a duplicate Calendar transaction and
  routed the surface through Episode Room's canonical milestone service. The
  current rendered product created and started
  `QA Retained · Canonical Calendar writer` (`cmsceftqe0007ayxlcvlx759p`).
  Independent readback found `IN_PROGRESS`, revision `2`, and exactly two
  canonical revision rows whose operations are namespaced
  `CREATE:calendar-create-*` and `UPDATE:calendar-revision-*`.
- Created a private Episode Nest subscription, fetched it over HTTP, and found
  status `200`, `text/calendar`, a strong ETag, exactly one VEVENT, the retained
  milestone title, and `TRANSP:TRANSPARENT`.
- The feed contained no email address, credential reference, token digest, or
  alarm. The capability was revoked after verification.

The QA episode and both in-progress milestones intentionally remain as labeled
test artifacts. There is no active feed bearer token.

## Verification

- Focused Calendar/provider/authoring verification: 10 suites, 64 tests.
- Broader Calendar and Schedule verification: 19 suites, 106 tests.
- Quipsly product contracts: 245 tests.
- Complete Quipsly Jest run: 239 suites and 1,254 tests passed; 37 suites and
  107 tests were deliberately skipped by their existing environment gates.
- Quipsly strict TypeScript: pass.
- Optimized Next.js 16.2.7 production build: pass, 160 routes/pages.
- `git diff --check`: pass before documentation.
- Real rendered create and lifecycle operation: pass.
- Independent PostgreSQL revision readback: pass.
- Real private ICS fetch, content inspection, and revocation: pass.

No Google account was connected locally, so no provider event was written. No
Cloud Build, cloud deployment, production database migration, TestFlight
action, or physical-device mutation occurred.

## Release boundary

Before calling Google projection production-proven:

1. configure the dedicated production OAuth client and complete provider
   consent with a purpose-built QA account;
2. select an owned QA calendar for the podcast lane;
3. prove rendered preview, create, no-op replay, update with ETag, conflict
   recovery, cancel, and independent provider readback;
4. rerun the broader Quipsly contracts and optimized build from the exact
   release source;
5. deploy one authenticated zero-traffic preview and promote only that verified
   revision.

Cloud builds should remain deliberately batched. Provider-operation proof does
not require a deploy for every local product iteration.
