# HGO Private Staged Artifact Store Plan

Date: 2026-05-22

## Position

Persistence comes after the browser contract and roundtrip. The staged artifact
store should save review packets only after the artifact shape, review gate, and
safety boundaries have been proven without server writes.

The artifact is not the source. It is a projection packet plus validation and
review-gate state. Studio remains the private source/tagging cockpit.

## Why This Comes Later

The current browser-only flow proves:

1. Studio-style projection JSON can enter HGO staged review.
2. HGO can generate a staged artifact packet from the projection and review gate.
3. HGO can import that artifact packet back into the browser.
4. HGO can validate the contract and render the embedded projection.
5. HGO can model session-only private-store lifecycle state without persisting
   the artifact.

Only after that roundtrip is stable should HGO add a private store. Otherwise
the database/API would be guessing at a contract that has not been exercised.

## Browser Store Lab

Before persistence, HGO now has a browser-session Store Lab:

- `/projection-stage/store-lab`
- `apps/web/src/lib/hgo/staged-artifact-store-lab.ts`
- `pnpm hgo:store-lab:test`

The Store Lab imports validated `hgo-staged-artifact-v1` packets into React
state only. It models review status, promotion readiness, archive behavior,
duplicate artifact handling, and event logs. It does not write localStorage,
call a server route, mutate Prisma, or publish anything.

The lab intentionally keeps persistence metadata outside the embedded artifact.
The browser-created artifact remains unchanged with `persisted: false` and
`published: false`.

## Proposed Future Model

A future table could store private staged artifacts with fields like:

- `id`
- `artifactVersion`
- `artifactId`
- `projectionId`
- `projectionSlug`
- `projectionStatus`
- `projectionVisibility`
- `artifactStatus`
- `recommendedNextAction`
- `createdAt`
- `createdByUserId`
- `updatedAt`
- `reviewedAt`
- `reviewedByUserId`
- `archivedAt`
- `artifactJson`
- `artifactHash`
- `blockerCount`
- `warningCount`
- `containsRealContent`

The stored JSON should be the validated artifact packet, not raw Studio draft
state.

## API Shape

Future API/server actions should remain private and explicit:

- create staged artifact from validated browser artifact JSON
- list staged artifacts visible to the current operator
- load one staged artifact by id
- archive staged artifact
- mark human-review status
- later, create a separate promotion candidate

No API should publish public pages as a side effect of saving a staged artifact.

## Access Control

The store requires access control before it exists:

- authenticated Studio/HGO operator only
- role gate for `OWNER`, `TEAM_SCHEDULER`, or a future HGO editorial role
- per-workspace or owner boundary if multiple workspaces arrive
- no anonymous artifact reads
- no public route serving private staged artifacts

If access control is unclear, persistence should stay blocked.

## Fields Never To Store

The staged artifact store should not store:

- browser cookies
- localStorage/sessionStorage blobs
- OAuth tokens
- auth storage state
- database passwords or secrets
- full TipTap/ProseMirror draft JSON
- raw canonical manuscript files
- Cloud SQL or filesystem paths
- generated screenshots or Playwright reports

The artifact validator should continue rejecting obvious browser storage,
cookie, token, and credential-like keys before storage is allowed.

## Approval And Promotion Boundary

Saving a staged artifact is not publishing.

Promotion should require a separate approved workflow that checks:

- citation states
- source note states
- public-safety review
- human approval
- route destination
- rollback plan
- public content rendering

The future promotion workflow should create or update live public routes only
after staged review passes. It should not reuse the artifact save action as a
publish action.

## Migration From Browser-Only Artifacts

The first persistence path can accept browser-created
`hgo-staged-artifact-v1` JSON if:

- artifact validation passes
- safety flags remain `persisted: false` and `published: false` at import time
- the server stamps its own persistence metadata separately
- the original artifact JSON is preserved as the submitted review packet
- server-side status is stored outside the artifact packet

The stored record may say persisted in database metadata, but the embedded
browser artifact should remain an immutable record of what the browser created.

## Future Migration Checklist

Before any DB/API work, confirm:

- access control is explicit and private by default
- schema adds no public reads or public publish behavior
- server validation reuses the artifact validator
- submitted artifact JSON is immutable after save
- persistence metadata lives outside the artifact packet
- duplicate artifact/version behavior is deliberate
- archive is the default rollback path
- promotion candidates remain separate from live public publishing
- generated reports and screenshots stay out of stored records
- operator approval is captured before applying schema or deploying

## Rollback And Retention

Rollback should be sacred:

- archive staged artifacts instead of deleting them by default
- keep submitted artifact JSON immutable
- store a hash to detect accidental mutation
- keep promotion records separate from artifact records
- allow a live page to point back to the staged artifact that approved it later

Destructive cleanup, retention windows, and permanent deletion should be
separate admin workflows, not part of the MVP store.

## Deferred

Still deferred:

- Prisma model
- DB migration or `db:push`
- Cloud SQL mutation
- API route or server action
- public publishing
- live `/episodes` replacement
- QuipLore / Quote Engine authority layer
- simultaneous editing
- autosave
- deployment
