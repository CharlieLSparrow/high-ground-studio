# Session note mutation authority checkpoint

Date: 2026-08-01

Branch: `codex/quipsly-product-20260724`

Scope: canonical Session-note creation/edit authority, iPhone contract coverage,
and authenticated local Nest operation

## Outcome

Session notes now use the same explicit read-versus-mutation policy as reviewed
transcript packets:

- An active project `VIEWER`, `EDITOR`, or `OWNER` can read the Session shell
  and its visibility-permitted shared evidence.
- A project-only collaborator must be an active `EDITOR` or `OWNER` to create
  or edit canonical Session-note state.
- Direct Session creators, non-observer participants, booked clients/coaches,
  and staff retain their scoped mutation authority. An observer remains
  read-only.
- Note editing remains author-owned. Project mutation authority does not grant
  one collaborator permission to rewrite another person's note.
- `PROJECT_TEAM` visibility, `PRODUCTION` purpose, and canonical tag changes
  retain the narrower Nest owner/editor/staff policy.
- Creation and editing recheck Session mutation authority inside their database
  transactions, so role downgrade or revocation cannot race from preflight
  into a write.

This closes a real ownership defect. Session-note creation and actor-owned edit
previously used the shared read predicate. A project-only viewer could create
private or shared Session rows, and an editor later downgraded to viewer could
continue changing notes they had authored.

## Permission classification audit

The broader Session call-site audit kept read predicates where the operation is
actually a projection or where a separate, narrower writer owns authority:

| Surface | Classification | Authority retained |
| --- | --- | --- |
| Session page, continuity, and source evidence | Read | Shared Session visibility only; actor-owned rows remain actor-scoped. |
| Transcript packet GET | Read | Project viewer may inspect visibility-permitted packet evidence. |
| Packet review/build and Session-note create/edit | Mutation | Canonical Session mutation predicate plus transaction recheck. |
| Client follow-up | Layered | Session read locates the room, then only the booked coach or recipient may proceed; writers reload that boundary in their transaction. |
| Calendar projection | Layered external projection | Session read supplies source evidence; the write targets only the actor's verified OAuth connection and owned calendar collection after exact preview revision review. It does not mutate Session truth. |
| Episode Room | Project write | Route POST/PUT resolves explicit project `write` access; recording-room access is used only to list and validate bound capture Sessions. |
| Recording promotion | Destination write | Promotion resolves destination Nest `write` access, and attachment authorization is rechecked with the same transaction client. |

## Operated local proof

The retained runner uses disposable generated identities and refuses non-loopback
Nest, PostgreSQL, or Firebase endpoints:

```bash
QUIPSLY_LOCAL_COLLABORATION_DOGFOOD=1 \
QUIPSLY_LOCAL_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5432/high_ground_studio' \
QUIPSLY_LOCAL_BASE_URL='http://127.0.0.1:3012' \
FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099' \
node --experimental-strip-types \
  --import ./scripts/register-ts-extension-loader.mjs \
  scripts/quipsly-local-session-collaboration-dogfood.mjs
```

Observed through authenticated HTTP and independent Prisma readback:

- outsider packet read: denied;
- active project viewer packet read: allowed;
- project-only viewer Session-note creation: HTTP 404, zero row created;
- active project editor Session-note creation: HTTP 200 with canonical mutation
  and transaction-recheck boundaries;
- editor grant downgraded to viewer;
- downgraded author edit: HTTP 404;
- original title/body retained and revision count remained exactly one;
- downgraded viewer retained packet read access but could not review packet
  state;
- revoked grant immediately lost packet read access;
- explicit fixture packet decision remained `DEFER`, with one review receipt and
  zero materialized tasks;
- no external side effects occurred.

The runner reported zero remaining rooms, projects, workspaces, users, and
finalization receipts. A separate Prisma process then queried fixture prefixes
and reported:

```json
{"users":0,"workspaces":0,"projects":0,"rooms":0,"clean":true}
```

## Verification

- Session-note model, workspace, access, and transaction tests: 5 suites / 16
  tests pass;
- enabled PostgreSQL note creation/edit and access integration: 3 suites / 12
  tests pass;
- the targeted transaction-race and access subset: 2 suites / 6 tests pass;
- Quipsly strict TypeScript gate passes;
- optimized 155-route Next production build passes with the established
  explicit 8 GB Node heap;
- full mobile Capture contract smoke passes, including explicit Session-note
  mutation-helper and response-boundary invariants;
- Capture App Store static gate passes 949/949;
- `git diff --check` passes.

## Evidence boundaries and remaining gates

- This operation used generated fixture text under the user's explicit
  permission for disposable test users. It did not read or alter real coaching
  or High Ground Odyssey content.
- No real task, goal, calendar event, message, assignment, client delivery,
  media mutation, publication, cloud deployment, TestFlight release, or App
  Store mutation occurred.
- Static iPhone contract coverage does not replace a physical-device downgrade,
  offline-retry, or separate-account privacy operation.
- Real HGO and coaching Session-note use, physical-iPhone operation, deployed
  committed-source parity, and cross-device readback remain required by the
  unified product goal.
