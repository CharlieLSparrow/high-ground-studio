# Session packet collaboration access checkpoint

Date: 2026-08-01

Branch: `codex/quipsly-product-20260724`

Scope: canonical Nest Session packet read/build/review authorization and local operated proof

## Outcome

Nest collaborators now use one canonical Session authorization policy instead
of route-local copies that disagreed about project grants. Shared Session access
and shared mutation authority are deliberately separate:

- An active `VIEWER`, `EDITOR`, or `OWNER` project grant can read a project
  Session.
- Only an active `EDITOR` or `OWNER` project grant can build a packet or mutate
  packet lane, task-candidate, or goal-candidate review state.
- Direct Session creators, non-observer participants, booked client/coach
  identities, and staff retain their scoped mutation authority. Observer
  participants remain read-only.
- Task and goal records remain actor-owned. Session membership does not confer
  ownership of another person's private follow-through.
- Every packet mutation rechecks Session mutation authority after acquiring the
  transcript-job advisory transaction lock. A revoked or downgraded grant
  cannot race from a successful preflight into a write.

This closes a real ownership defect: the packet build/read path already admitted
active project grants, but task- and goal-candidate review routes duplicated a
narrower creator/participant/booking predicate. A project editor could therefore
enter and rebuild the Session packet but could not review its candidates.

## Runtime defect found by operating the route

Preparing the real HTTP operation found three packet mutation queries ordering
`TranscriptSegment` rows by `segmentIndex`, which does not exist in the canonical
Prisma schema. The routes used an `any`-typed Prisma boundary, so TypeScript did
not catch it. Packet build, lane review, action review, and goal review now share
one deterministic order: `startSeconds ASC`, then stable `id ASC`.

## Operated local proof

The retained local dogfood runner is:

```bash
QUIPSLY_LOCAL_COLLABORATION_DOGFOOD=1 \
QUIPSLY_LOCAL_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5432/high_ground_studio' \
FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099' \
pnpm quipsly:local:session-collaboration-dogfood
```

It refuses non-loopback Nest, PostgreSQL, or Firebase targets. It created only
disposable fixture evidence, authenticated three generated users through the
Firebase emulator, and operated the actual local Nest routes.

Observed result:

- separate outsider packet read: HTTP 404;
- active project `VIEWER` packet read: HTTP 200;
- active project `VIEWER` candidate review: HTTP 404
  `ROOM_ACCESS_DENIED`;
- active project `EDITOR` candidate review: HTTP 200;
- explicit disposable decision: `DEFER`;
- persisted review receipts: 1;
- materialized `ActionItem` rows: 0;
- after grant status changed to `REVOKED`, collaborator packet read: HTTP 404;
- response advertised both canonical Session mutation access and transactional
  recheck boundaries;
- external side effects: none.

The runner deleted its generated Firebase identities and database fixture. Its
own readback reported zero remaining rooms, projects, workspaces, users, and
finalization receipts. A separate Prisma process then independently reported:

```json
{ "users": 0, "workspaces": 0, "projects": 0, "rooms": 0, "receipts": 0 }
```

## Verification

- canonical Session and packet route tests: 5 suites / 32 tests pass;
- enabled PostgreSQL access integration: 1 suite / 3 tests pass;
- rendered Session/source-evidence tests: 3 suites / 32 tests pass;
- adjacent transcript draft/goal/handoff/run/task tests: 6 suites / 19 tests
  pass;
- Quipsly TypeScript gate passes;
- optimized 155-route Next production build passes with an explicit 8 GB Node
  heap. The first local attempt compiled successfully but exhausted Node's
  default 4 GB heap during the post-compile TypeScript phase;
- packet static ownership/evidence gate passes;
- full mobile Capture contract smoke passes;
- Capture App Store static gate passes 949/949;
- `git diff --check` passes.

## Evidence boundaries and remaining gates

- The operated decision used generated fixture text under the user's explicit
  permission for disposable test users. It is not a claim that a real HGO or
  coaching transcript was listened to or reviewed.
- No real goal, task, calendar event, assignment, message, client delivery,
  media mutation, publication, Cloud Run deployment, TestFlight release, or App
  Store mutation occurred.
- Mid-transaction revocation is covered by route-level transaction harnesses;
  the real HTTP operation proves immediate revocation across transactions.
- Physical-iPhone, TestFlight, real HGO/coaching packet review, deployed
  committed-source parity, and human playback decisions remain required by the
  unified product goal.
