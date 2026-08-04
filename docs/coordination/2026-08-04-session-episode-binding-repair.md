# Podcast Session Episode relationship repair

Date: 2026-08-04

Status: implemented, migrated locally, and operated through the real HTTP/auth boundary

## Outcome

A podcast recording Session whose Episode relationship is absent or invalid no
longer stops at a warning. An authorized Session host/producer or Nest
owner/editor can choose the exact same-Nest Episode Room and repair the
relationship in place. Quipsly never guesses from the Session title.

The repair changes only `CallRoom.episodeProductionId` plus the temporary
compatibility `metadataJson.episodeSlug`. It does not move, rewrite, or create
recordings, transcripts, participants, consent, Session chat, Episode chat,
calendar events, invitations, publications, or external-provider state.

## Write-surface audit

The runtime `CallRoom` creation surface remains intentionally narrow:

- `POST /api/mobile/capture/sessions` is the normal podcast creator. It resolves
  an Episode by exact `projectId_slug` and writes the first-class relationship.
- coaching runway creation writes only coaching Sessions and has no Episode
  authority;
- legacy mobile-ingest preservation may attach bytes to an existing Session or
  create a preservation room, but a caller-provided slug alone cannot authorize
  an Episode relationship;
- Calendar projects Session/milestone time and does not create podcast rooms;
- Episode Room selects an already-authorized recording Session and cannot
  rewrite its relationship as a side effect.

Rehearsal setup uses the production Capture Session API, so new rehearsal rooms
also receive the first-class relationship. Old scripts and fixtures that create
isolated podcast rooms without an Episode remain explicitly unbound test data.

## Mutation contract

`PUT /api/sessions/:roomId/episode-binding` requires:

- a verified signed-in Quipsly identity;
- canonical Session mutation authority;
- `purpose = PODCAST`;
- a canonical project on the Session;
- an exact Episode slug in that same project;
- the Session's exact `updatedAt` value;
- one stable UUID request identity; and
- for a non-null conflicting relationship, explicit replacement confirmation
  plus an audit reason of at least eight characters.

The service takes a PostgreSQL advisory lock and a serializable transaction.
The optimistic room update checks Session ID, project, purpose, prior Episode
ID, and exact `updatedAt`. Exact retries replay one receipt; changed intent under
the same UUID conflicts. Stale, unauthorized, cross-purpose, missing-project,
unknown-Episode, and cross-project operations fail before a relationship write.

## Append-only receipts

Migration `20260805020000_add_call_room_episode_binding_receipts` adds
`CallRoomEpisodeBindingReceipt`. Each receipt preserves:

- stable request ID;
- Session and project snapshots;
- actor ID and email snapshot;
- `BIND`, `REBIND`, or `NOOP` action;
- previous and next Episode IDs/slugs;
- rebind reason;
- expected, before, and after Session versions; and
- a versioned no-external-side-effect boundary.

The Session workspace exposes safe recent history without projecting actor
email. It labels the action, prior/next Episode slugs, reason, timestamp,
authorized-collaborator boundary, and no external side effects.

## UX

The existing “Episode relationship needs attention” card now contains the
repair control when the actor has authority. It lists exact Episode Rooms from
the Session's current Nest, includes status in every option, maintains a
44-point control path, and explains what will and will not change.

Viewers receive an authority explanation instead of disabled mystery controls.
An empty Nest explains that an Episode Room must be created first. Invalid
non-null relationships require a separate confirmation and audit-reason field.
The client retains the UUID across an ambiguous network retry and refreshes
canonical server readback only after success.

## Operated proof

Local PostgreSQL integration passed 5/5 and covered:

- same-project first-class binding;
- null-only metadata compatibility;
- conflicting cross-project relationship exclusion;
- normal bind plus exact replay with one receipt;
- immutable recording checksum preservation;
- request-identity conflict;
- unauthorized and stale denial; and
- explicit explained rebind from an adversarial cross-project relation.

A separate real HTTP operation used a disposable verified Firebase-emulator
identity, local Nest on port 3012, and the migrated PostgreSQL database. It:

1. created an unbound podcast Session and verified recording source;
2. called the production `PUT` route with a bearer token;
3. read `BIND`, the exact Episode ID/slug, one receipt, and unchanged source
   checksum;
4. repeated the same HTTP request and read `idempotentReplay: true`; and
5. proved all recording/transcript/participant/thread/calendar/invitation/
   publication/external-effect flags false.

Exact cleanup read back 0 disposable database users, rooms, receipts,
workspaces, and Firebase users.

Complete qualification passes 301 Nest suites / 1,571 runnable tests, both
database operations with 12/12 assertions, the optimized 172-page production
build, Prisma validation/current migration status, schema-release policy tests,
98/98 mobile source contracts, and 1,025/1,025 Capture/App Store contracts.

## Release boundary

Both Episode-binding migrations are applied only to the local development
database. Production rollout must use the committed immutable schema-release
job: disposable full-chain proof, exact image digest, on-demand Cloud SQL
backup/readback, `prisma migrate deploy`, current migration status, and zero
schema diff before application promotion.

The one retained unmatched legacy podcast Session remains unmodified. It now
has a safe product repair path, but choosing its Episode is a human production
decision and must not be guessed during deployment.
