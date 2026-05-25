# HGO Episode Publish Operator Handoff Result

Date: 2026-05-25

## Scope

Advanced the private HGO episode-page publish workflow without adding a public
publish action, writing content files, changing `/episodes`, or changing
Prisma schema.

This slice stays in the existing publish queue and HGO packet library. It
packages the next operator handoff step so a ready staged artifact can move
from private review toward a future approved public publish with clearer
preflight, approval, and rollback evidence.

## Result

New private packet kind:

```text
hgo-episode-publish-operator-handoff-v1
```

The packet is derived on `/team/hgo-publish-queue/[recordId]` from the existing
candidate packet and review brief. It includes:

- exact artifact, route, and publish-candidate identity
- route collision check commands
- validation commands, including `git diff --check`
- required review evidence for citation, public safety, route collision, and
  rollback readiness
- proposed private-review source and deferred public target
- operator steps for a later approved publish change
- explicit stop text requiring owner approval before any public publish action
- rollback steps for both pre-publish handoff and future post-publish backout

The detail page now shows a private operator handoff panel with copy/download
controls for the handoff JSON and visible preflight commands.

## Safety Boundary

This change does not:

- create public routes
- write `apps/web/content/_staging`
- write `apps/web/content/publish`
- replace or change `/episodes`
- mutate staged artifact JSON
- add a public publish action
- call providers
- certify citation review
- certify public-safety review
- change Prisma schema

The packet explicitly records `publicPublishApproval:
required-not-granted` and tells the operator to stop until the owner approves a
public publish action for the exact route and artifact hash.

## Files

- `apps/web/src/lib/hgo/publish-candidate-packet.ts`
- `apps/web/src/app/team/hgo-publish-queue/[recordId]/OperatorHandoffPanel.tsx`
- `apps/web/src/app/team/hgo-publish-queue/[recordId]/page.tsx`
- `scripts/hgo-publish-candidate-packet.test.mjs`
- `docs/sessions/hgo-episode-publish-operator-handoff-result.md`

## Validation

Passed:

```bash
pnpm hgo:publish-candidate:test
git diff --check
```

Result:

```text
11 tests passed
git diff --check passed with no whitespace errors
```

Blocked by shared checkout lock:

```bash
pnpm --filter web build
```

Result:

```text
Unable to acquire lock at apps/web/.next/lock; another next build process was
already running in the shared worktree.
```

Additional local typecheck attempt:

```bash
pnpm --filter web exec tsc --noEmit
```

Result:

```text
Command "tsc" not found
```

Still to run before merge/deploy after the active build releases the lock:

```bash
pnpm --filter web build
pnpm --filter web exec next build --webpack
```

## Rollout

No deploy or database action was performed in this slice.

Next integration step:

1. Open a saved staged artifact detail page at
   `/team/hgo-publish-queue/[recordId]`.
2. Download the operator handoff packet.
3. Confirm citation/public-safety evidence, route collision checks, and rollback
   target.
4. Ask for explicit owner approval before any future public content diff or
   publish action.

## Rollback

Before any future public publish, rollback is deleting or ignoring the private
handoff packet and reverting this code/docs change if needed.

If a later approved public publish uses the handoff packet, rollback must be
recorded in that later publish result note with the exact content diff, deploy
revision, and Cloud Run rollback revision.

## Remaining Risks

- The route collision checks are operator commands in the packet, not a server
  write-time gate.
- Citation and public-safety review evidence are still external review facts;
  this packet records that they are required but does not certify them.
- A true public publish action still requires explicit approval and a separate
  implementation slice.
