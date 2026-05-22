# HGO Staged Projection Artifact Contract

Date: 2026-05-22

## Position

The staged artifact is not the source. It is a browser-created review packet
for a projection of tagged source material.

Studio remains the private source and tagging cockpit. HGO remains the staged
review and rendering surface. The artifact contract sits between today's pasted
JSON workflow and a future private staged artifact store.

## Why This Exists Before DB Persistence

The future staged store should not invent its database shape blindly. The
browser-only artifact contract lets HGO prove the shape of a storable review
packet before adding a table, API route, or server write.

The artifact bundles:

- projection JSON
- validation errors and warnings
- staged review gate result
- source/projection identity
- explicit browser-only safety flags
- recommended next action

It does not include browser cookies, local storage, server metadata, secrets,
filesystem paths, or raw Studio manuscript draft internals.

## Current Contract

The code-level helper lives at:

- `apps/web/src/lib/hgo/staged-projection-artifact.ts`

Artifact version:

- `hgo-staged-artifact-v1`

Artifact status values:

- `draft`
- `review-blocked`
- `review-ready`
- `live-candidate`

Recommended next actions:

- `fix-blockers`
- `human-review`
- `candidate-for-future-staging`
- `do-not-use`

Safety fields are explicit:

- `persisted: false`
- `published: false`
- `containsRealContent: "unknown"`
- operator warning that real projection drafts may contain private/review-only
  content

## Browser-Only Review Packet

`/projection-stage/import` can now create a staged artifact from pasted HGO
projection JSON and the current review gate result.

The operator can:

- inspect the artifact summary
- generate staged artifact JSON in the browser
- download the artifact JSON through a Blob download

HGO does not save the artifact. The route does not call a server action, write
local storage, create public content, persist to Prisma, or publish a page.

## Future Flow

1. Studio generates projection JSON.
2. HGO staged import review creates a browser artifact.
3. A human reviews blocker and warning state.
4. A future private staged store saves approved artifacts.
5. A later approved promotion workflow creates live public pages.

## Deferred

Not included:

- DB projection table
- API route
- public publishing
- real content ingestion
- QuipLore / Quote Engine authority layer
- simultaneous editing
- autosave
- deployment or cloud configuration changes
