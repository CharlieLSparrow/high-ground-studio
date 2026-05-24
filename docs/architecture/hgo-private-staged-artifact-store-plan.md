# HGO Private Staged Artifact Store Plan

Date: 2026-05-24

## Position

Persistence comes after the browser contract and roundtrip. The staged artifact
store saves review packets only after the artifact shape, review gate, and
safety boundaries have been proven without server writes.

The artifact is not the source. It is a projection packet plus validation and
review-gate state. Studio remains the private source/tagging cockpit.

## What Exists Now

The first private persistence slice exists:

- Prisma model: `HgoStagedProjectionArtifact`
- API route: `/api/hgo/staged-artifacts`
- team route: `/team/hgo-staged-artifacts`
- import route action: explicit `Save private review artifact` button on
  `/projection-stage/import`
- private review/archive controls on `/team/hgo-staged-artifacts`
- private episode-page publish-candidate packets on
  `/team/hgo-staged-artifacts`
- copy/download/open controls for immutable artifact JSON and derived
  publish-candidate packets on `/team/hgo-staged-artifacts`
- private episode publish queue at `/team/hgo-publish-queue`
- private per-artifact publish review detail pages at
  `/team/hgo-publish-queue/[recordId]`
- derived `hgo-episode-publish-review-brief-v1` packets for operator/agent
  handoff before any public route work starts
- derived `hgo-episode-publish-draft-v1` packets with proposed private MDX
  drafts and frontmatter
- private per-artifact render previews at
  `/team/hgo-publish-queue/[recordId]/preview`

The API is team-gated through the existing internal role rules. It saves only
validated `hgo-staged-artifact-v1` packets, keeps the embedded browser artifact
JSON immutable, and stores server persistence metadata outside the artifact
packet.

The first slice still does not publish pages, create public routes, call
providers, verify public safety, delete artifacts, or replace `/episodes`.

Approved staged artifacts can now derive an
`hgo-episode-publish-candidate-v1` packet. This packet names the proposed
`/episodes/...` route, carries blockers/warnings/human review actions, and
records rollback expectations. It is private planning metadata only: generating
it does not create route files, mutate the database, call providers, certify
public-safety review, or change the immutable staged artifact JSON.

The team shelf also exposes the saved artifact JSON as an operator handoff. An
operator can copy the artifact, download it, reopen it in
`/projection-stage/artifact`, copy the publish-candidate packet, or download the
publish-candidate packet. These controls are private convenience actions around
existing data; they do not publish, approve, call providers, or mutate the
stored artifact.

`/team/hgo-publish-queue` turns those saved artifact records into a private
episode-page review queue. It groups derived publish-candidate packets into
ready, not-ready, and archived lanes, keeps the proposed `/episodes/...` route
visible, carries blockers and warnings forward, and keeps artifact handoff
controls beside the human review and rollback posture. It is still planning
metadata only; it does not create route files, mutate public content, call
providers, or certify public-safety review.

Each queue item now links to `/team/hgo-publish-queue/[recordId]`, a private
operator detail page for that saved artifact. The detail page loads one staged
artifact record for the current owner, derives the publish-candidate packet,
derives an `hgo-episode-publish-review-brief-v1`, and shows proposed future
file targets, validation commands, safety flags, rollback notes, blockers, and
copy/download handoff controls. The review brief is still private planning
metadata only. Generating it does not create public routes, write content
files, mutate the database, call providers, mutate the staged artifact, publish
a live page, or certify public-safety review.

The detail page can also derive an `hgo-episode-publish-draft-v1` packet. That
packet carries proposed private MDX frontmatter/body text, the deferred public
file target, artifact identity, review blockers/warnings, and explicit safety
flags. It is a handoff packet, not a writer. Generating it does not write
`apps/web/content/_staging`, does not write `apps/web/content/publish`, does
not create a public route, does not mutate stored artifacts, does not call
providers, and does not certify citation or public-safety review.

`/team/hgo-publish-queue/[recordId]/preview` renders the embedded projection
from the saved staged artifact through the shared HGO projection renderer. This
is the private page-shape review surface before public `/episodes` work starts.
It is team-gated, read-only, and still separate from live publishing.

## Why This Came After The Lab

The current browser-only flow proves:

1. Studio-style projection JSON can enter HGO staged review.
2. HGO can generate a staged artifact packet from the projection and review gate.
3. HGO can import that artifact packet back into the browser.
4. HGO can validate the contract and render the embedded projection.
5. HGO can model session-only private-store lifecycle state without persisting
   the artifact.

Only after that roundtrip was stable did HGO add the first private store.
Otherwise the database/API would have guessed at a contract that had not been
exercised.

## Browser Store Lab

Before persistence, HGO now has a browser-session Store Lab:

- `/projection-stage/store-lab`
- `apps/web/src/lib/hgo/staged-artifact-store-lab.ts`
- `pnpm hgo:store-lab:test`

The Store Lab imports validated `hgo-staged-artifact-v1` packets into React
state only. It models review status, promotion readiness, archive behavior,
duplicate artifact handling, and event logs. It remains useful as a no-write
lifecycle simulator, even now that the first private API exists.

The lab intentionally keeps persistence metadata outside the embedded artifact.
The browser-created artifact remains unchanged with `persisted: false` and
`published: false`.

## Current Model

The table stores private staged artifacts with fields including:

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
- `ownerUserId`
- `ownerEmail`
- `recordId`
- `updatedAt`
- `reviewedAt`
- `reviewedByEmail`
- `archivedAt`
- `artifactJson`
- `artifactHash`
- `blockerCount`
- `warningCount`
- `containsRealContent`
- `eventLogJson`
- `artifactSummaryJson`

The stored JSON should be the validated artifact packet, not raw Studio draft
state.

## API Shape

API/server actions should remain private and explicit:

- create staged artifact from validated browser artifact JSON: implemented
- list staged artifacts visible to the current operator: implemented
- mark review status for a staged artifact: implemented
- archive staged artifact: implemented
- derive private episode-page publish-candidate packet: implemented
- derive private episode-page publish-review brief: implemented
- derive private episode-page publish-draft packet: implemented
- copy/download/reopen saved artifact handoff: implemented in the team route
- view private episode publish queue: implemented at `/team/hgo-publish-queue`
- load one staged artifact by id: implemented for private queue detail pages
- render one private staged artifact as a publish preview: implemented at
  `/team/hgo-publish-queue/[recordId]/preview`
- later, create a separate promotion candidate

No API should publish public pages as a side effect of saving a staged artifact.

## Access Control

The store uses access control:

- authenticated Studio/HGO operator only
- role gate for `OWNER`, `TEAM_SCHEDULER`, or `COACH`
- per-workspace or owner boundary if multiple workspaces arrive
- no anonymous artifact reads
- no public route serving private staged artifacts

If access control becomes more nuanced, add a narrower HGO editorial policy
before broadening access.

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

Before expanding DB/API work, confirm:

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

- public publishing
- live `/episodes` replacement
- QuipLore / Quote Engine authority layer
- simultaneous editing
- autosave
- deletion/destructive cleanup
- promotion candidate persistence
- public route generation
