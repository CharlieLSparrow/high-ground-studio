# Session source exit readiness

Date: 2026-08-06

Status: endpoint receipt contract implemented, tested, and operated in the authenticated local Nest

## Outcome

The Session **Takes** and **Recording room** topology now answers the first half
of a deceptively dangerous production question: which server-observed masters
are actually retained, and which capture evidence is still waiting for media?

The projection deliberately refuses to answer the second half until Quipsly has
endpoint-owned drain receipts. A complete server copy does not prove that every
browser and iPhone finished or reconciled its local upload queue. The interface
therefore distinguishes:

- `Do not close recording devices yet`;
- `Server copy complete · check each recording device`; and
- the still-false global claim `Safe to leave every endpoint`.

This is the first production slice of the Episode and Session Finishing Cockpit
recommended by the depth portfolio in
`docs/research/2026-08-06-quipsly-obvious-depth-feature-portfolio.md`.

## Architecture

`buildSessionReadinessTopology` remains a read projection over canonical
records. It does not add a mutable readiness table. Each retained source now
combines:

1. `RecordingAsset` status and exact-byte verification;
2. a finalization receipt matched by `recordingAssetId` only;
3. processing and transcription dispositions;
4. upload-session identity and finalization time; and
5. pending START/STOP evidence that has no RecordingAsset yet.

Provider safety mixes remain useful witnesses but do not count as required
local masters. An asset with verified bytes but no matching finalization receipt
is explicitly incomplete. Ambiguous `captureId` matching is not accepted as a
substitute for the canonical recording-asset relationship.

The derived `exitReadiness` state exposes exact required/source-safe counts and
keeps both `allEndpointQueuesConfirmedEmpty` and `safeToLeaveAllEndpoints`
false. That is a contract, not placeholder copy: the next slice must add
endpoint-owned drain receipts before either value can become true.

## Runtime repair found by operating the UI

The first authenticated render failed safely as `Session review is
unavailable`. Server evidence showed that the page was selecting
`governedActionId` from `CallRoomEpisodeBindingReceipt`, a model that does not
own that field. It belongs to `CallParticipantPreflightReceipt`.

The query now selects governance evidence from the correct preflight relation.
A page-level regression inspects the real Prisma selection so typechecking or a
mocked component cannot silently reintroduce the wrong-model projection.

## Authenticated local operation

A disposable, verified Firebase-emulator identity
`quipsly.finishing.cockpit.qa@local.test` received bounded local EDITOR access
to retained QA projects. No production identity, provider, message, calendar,
publication, or deployment was touched.

Two existing retained Sessions exercised both meaningful states:

### Pending local media

Session `retained-session-topology-20260805` rendered:

- `0/1 server-safe masters`;
- one iPhone START/STOP trail awaiting retained media;
- no RecordingAsset presented as uploaded media; and
- `Safe to leave every endpoint: no`.

The same state was operated at a 390 x 844 iPhone viewport. The recovery region
remained uniquely reachable and exposed the full warning through the
accessibility tree. Mobile title size and header padding were tightened after
visual inspection so operational evidence reaches the viewport sooner.

### Server copy complete, device confirmation still required

Session `retained-coaching-follow-up-20260731` rendered:

- `4/4 server-safe masters`;
- exact verified bytes plus released finalization receipts for every
  server-observed required source;
- a clear request to check each recording device; and
- `Safe to leave every endpoint: no` because endpoint-local drain confirmation
  does not yet exist centrally.

The existing local test artifacts remain intentionally retained for ongoing
dogfood.

## Verification

- 4 focused Jest suites passed, 50 tests total.
- Quipsly Next route generation and TypeScript typecheck passed.
- `git diff --check` passed.
- Authenticated rendered operation passed for both pending-media and
  server-copy-complete states.
- Visual inspection passed at normal desktop and 390 x 844 mobile viewport.

## Endpoint drain acceptance slice

Quipsly now has the append-only endpoint drain receipt this first pass
deliberately refused to fake. `CallEndpointQueueReceipt` is owned by one exact
browser or app installation and is bound to the Session, capture group,
participant, actor, and monotonically increasing queue revision.

The browser publishes only after its durable local source ledger changes. The
iPhone uses a protected Application Support outbox, persists its next snapshot
before network delivery, and retries transient or still-processing server
states without deleting local recordings. Both send stable request IDs for
idempotent replay. A later `NOT_EMPTY` revision revokes an earlier drain.

The server serializes writes for one Session and installation with a PostgreSQL
advisory transaction lock. It refuses:

- an installation with no matching provider-grant or private-preflight receipt;
- a stale or replay-conflicting request ID;
- a drain that does not enumerate one capture ID and one RecordingAsset for
  every local source; or
- a source whose exact server bytes are not verified and whose finalization is
  not released.

An iPhone deletion tombstone counts as complete only when the local deletion
audit says a verified cloud copy existed at deletion time. Merely retaining an
asset ID cannot turn an unsafe historical deletion into a green endpoint.

The topology reads the latest receipt for each installation. Global
`SAFE_TO_LEAVE` requires every server-required master to be safe and every
latest endpoint receipt to be `DRAINED`, with the exact capture and asset sets
still covered. A missing receipt, a stale source set, or any later non-empty
revision fails closed.

### Authenticated operation

The retained coaching Session was first rendered with `4/4 server-safe
masters` and `0/0 latest installation queue receipts drained`; Quipsly did not
claim it was safe to leave. The local operation harness then posted revision 2
`NOT_EMPTY` and revision 3 `DRAINED` for a retained QA browser installation
covering all three of its local sources. The same signed-in Session page then
rendered:

- `Safe to leave every reconciled recording endpoint`;
- `4/4 SERVER-SAFE MASTERS`;
- `SAFE TO LEAVE EVERY ENDPOINT: YES`; and
- `1/1 LATEST INSTALLATION QUEUE RECEIPTS DRAINED`.

This proves a real before/after database, route, authorization, and rendered-UI
loop. It does not claim production deployment or a physical-iPhone receipt yet.

### Verification

- Six focused Jest suites pass 26 tests, including route authentication,
  latest-installation projection, unknown endpoint, stale revision, incomplete
  server copy, monotonic drain, and idempotent replay.
- Quipsly route generation and TypeScript typecheck pass.
- The browser outbox test also proves that a lost first response replays the
  exact durable request and that a corrupt local revision repairs from server
  readback before advancing.
- The complete Quipsly Capture iOS simulator target builds successfully for
  arm64 and x86_64 with the protected outbox compiled into the app.
- The local database reports all migrations applied, and the authenticated
  operation harness completed without printing credentials.

## Next acceptance slice

The Finishing Cockpit can now build on a truthful exit boundary. Its next
ranked slice should:

1. rank recovery problems across endpoints and retained sources;
2. rank transcript, audio, and assembly attention without treating proposals
   as source truth;
3. expose the output/master graph and exact blockers; and
4. operate the native receipt path on a physical iPhone before production
   release promotion.
