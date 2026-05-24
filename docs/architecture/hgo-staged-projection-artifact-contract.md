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

## Browser-Only Artifact Import

`/projection-stage/artifact` can paste a staged artifact JSON file back into
HGO for browser-only contract inspection.

The import helper validates:

- `artifactVersion: "hgo-staged-artifact-v1"`
- artifact id and creation timestamp
- artifact status in the known contract vocabulary
- browser-import source metadata
- source projection id, slug, status, and visibility
- embedded projection shape through `validateHgoEpisodeProjection`
- embedded review gate presence
- review-gate projection id, slug, and title match the embedded projection
- review-gate status and visibility match the embedded projection
- validation warnings/errors are arrays
- `persisted: false`
- `published: false`
- `containsRealContent: "unknown"`
- known recommended next action
- absence of obvious browser storage, cookie, token, or credential-like keys

The route shows artifact errors, warnings, summary fields, embedded review-gate
state, and the embedded projection renderer. Artifact inspection does not
persist, publish, verify public safety, write local storage, or call a server
route. The separate staged import route can explicitly save a validated artifact
to the private staged artifact store for signed-in team operators.

The validation result is machine-readable and includes:

- `ok`
- `state`: `empty`, `invalid`, `valid`, or `warning`
- `errors`
- `warnings`
- `artifact`
- `summary`

Warnings are expected for valid browser artifacts because the contract keeps the
review boundary visible: artifacts may contain private/review-only projection
text, contain unknown real-content status, are review packets rather than
source, and are not public content.

Focused node tests cover the artifact helper through:

- `pnpm hgo:artifact:test`

## Browser-Session Store Lab

`/projection-stage/store-lab` models how a private staged artifact store might
hold artifacts after browser import, but it keeps everything in React session
state only.

The Store Lab can:

- import validated `hgo-staged-artifact-v1` JSON
- reject invalid, persisted, published, credential-marked, or duplicate active
  artifacts
- mark records for human review
- mark records approved for future staging
- create simulated promotion candidates only when eligible
- archive records
- show an event log
- render the embedded review gate and projection

The Store Lab metadata is separate from the artifact packet. The embedded
artifact still says `persisted: false` and `published: false`; the lab does not
write localStorage, call a server route, or publish anything.

Focused node tests cover the Store Lab through:

- `pnpm hgo:store-lab:test`

## Future Flow

1. Studio generates projection JSON.
2. HGO staged import review creates a browser artifact.
3. HGO staged artifact import validates the browser-created or clipboard-loaded
   artifact.
4. HGO Store Lab models browser-session lifecycle state.
5. A human reviews blocker and warning state.
6. The private staged store saves approved artifacts for team review.
7. The team shelf can copy, download, and reopen saved artifacts for review or
   publish-candidate handoff.
8. A later approved promotion workflow creates live public pages.

Future persistence planning lives in:

- `docs/architecture/hgo-private-staged-artifact-store-plan.md`

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
