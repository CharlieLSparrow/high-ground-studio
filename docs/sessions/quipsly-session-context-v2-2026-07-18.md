# Quipsly Capture Session Context v2

Date: 2026-07-18

## Outcome

The iPhone session-plan surface and Nest context route now share one
revisioned, source-aware contract without a Prisma migration.

- `CallRoom.metadataJson.captureSessionContext` remains the compatibility and
  revision envelope.
- Responses retain `note`, `goals`, and `tasks` while adding schema version,
  revision ID/number, parent revision, stable structured entries, projection
  IDs, and bounded revision receipts.
- A string-only legacy context receives deterministic IDs and a deterministic
  read revision. Its first explicit save upgrades it to v2. Once v2 exists, a
  missing or stale revision cannot overwrite it.
- Explicit saves run in one serializable transaction. The room metadata update
  is additionally guarded by the selected row's `updatedAt`, so projection
  writes roll back if another room mutation wins the race.
- The quick note and each goal project to source-marked `CoachingNote` rows.
  Each explicit task projects to a source-marked `ActionItem` assigned to the
  authoring user.
- Exact resaves return the same revision and do not duplicate projections.
- POST uses explicit full-replacement semantics. A client must send all of
  `note`, `goals`, and `tasks`, or a complete structured `entries` object with
  note/goals/tasks. Omitted, partial, malformed, over-limit, or contradictory
  legacy/structured payloads return HTTP 400 before Prisma is opened, so a
  transport/client bug cannot be mistaken for an intentional delete-all.

## Reconciliation and removal

Structured clients reconcile by the server-issued context entry ID. Legacy
string clients reconcile by exact normalized text, then by position. Client
projection IDs are never trusted as ownership authority; the server only uses
IDs that resolve to a room-scoped record with the exact
`quipsly-capture-session-context-v2` source marker.

Removing a quick note or goal leaves its body intact and marks the projection
inactive/archived in `sourceJson`. Removing a context-owned task marks its
source inactive and changes its status to `CANCELED` only when it is still
`OPEN`. Completed and already-canceled tasks retain their outcome. Records
without the session-context source marker are never changed by this route.

Both context revisions and projection provenance use bounded receipt arrays.
The envelope keeps 24 revision summaries and each projection keeps 16 recent
source receipts; removed evidence itself remains in the durable row.

## Conflict UX

A stale save returns HTTP 409 with both `remoteContext` and `localContext` and
performs no mutation. HighGroundCapture keeps its exact phone draft in protected
local storage and displays the latest Nest summary beside it. `Use Nest
version` replaces the phone copy explicitly. `Keep phone draft` only rebases
the draft onto the latest Nest revision; a second tap on Save Nest is required
before it can overwrite the remote text.

Loading Nest while unsynced phone edits exist uses the same two-version review
surface instead of replacing the local draft. The actual capture-first iPhone
Record screen exposes this workflow under `Session plan`.

## Verification

- Server route suite: 11 passing tests covering unauthenticated and inaccessible
  rooms, omitted/partial/malformed/mismatched replacement rejection, complete
  structured-only requests, deterministic legacy reads, transactional
  projection creation, idempotent resaves, legacy text/position reconciliation,
  stale 409 payloads, and archive/cancel behavior.
- `pnpm --filter quipsly typecheck`: passed.
- `node scripts/quipsly-mobile-capture-session-context-static-smoke.mjs`:
  passed.
- iPhone target build: passed against the iOS 26.2 SDK on the iPhone 17 Pro
  simulator.
- `CaptureExperienceUITests`: 6 passing tests, including the new primary iPhone
  session-plan test and the existing consent, creation, navigation, layout, and
  accessibility checks. Result bundle:
  `/tmp/quipsly-capture-derived/Logs/Test/Test-HighGroundCapture-2026.07.18_09-18-15--0600.xcresult`

## Remaining caveats

- This slice deliberately uses existing JSON/source fields and therefore does
  not provide an unbounded event store. A future canonical session graph can
  promote these stable entry and projection IDs without a destructive cutover.
- Installed clients that never send a revision can perform the one legacy-to-v2
  migration save, but later saves fail safely with 409 until the client is
  upgraded and reloads the current revision.
- The Xcode project still declares an iOS 17 deployment target and emits the
  existing missing-AppIntents/deprecated AVFoundation warnings. The active
  platform policy calls for a deliberate iOS 26 target migration; this slice
  did not mix that project-wide change into context concurrency work.
- No production database, provider, deploy, or external-service mutation was
  performed.
