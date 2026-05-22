# HGO Staged Artifact Import Result

Date: 2026-05-22

## Summary

Added a browser-only HGO staged artifact inspection route:

- `/projection-stage/artifact`

The route accepts pasted `hgo-staged-artifact-v1` JSON in client state only,
validates the artifact contract, validates the embedded projection, displays
embedded review-gate state, shows artifact safety flags, and renders the
embedded projection through `EpisodeProjectionView`.

## Validation Helper

Extended:

- `apps/web/src/lib/hgo/staged-projection-artifact.ts`

New pure helpers:

- `validateHgoStagedProjectionArtifact`
- `parseHgoStagedProjectionArtifactJson`
- `summarizeHgoStagedProjectionArtifactImport`
- `listKnownHgoStagedArtifactStatuses`
- `listKnownHgoStagedArtifactNextActions`

The validator checks artifact version, id, creation time, browser-import source
metadata, projection identity, projection validation, review-gate identity,
review-gate title/status/visibility alignment, validation warnings/errors array
shape, known recommended next action, `persisted: false`, `published: false`,
`containsRealContent: "unknown"`, and absence of obvious browser storage,
cookie, token, or credential-like keys.

The validation result includes `ok`, `state`, `errors`, `warnings`, `artifact`,
and `summary` so browser routes and tests can inspect the contract without
guessing from UI state.

## Safety Boundary

This pass stayed browser-only:

- no local storage
- no server route
- no Prisma/schema change
- no Cloud SQL or Cloud Run change
- no public `/episodes` replacement
- no real publish action
- no real manuscript or real HGO content

The route explicitly says artifact inspection does not persist, publish, or
verify public safety.

## Automation

Extended `pnpm hgo:projection:browser-smoke` to cover the full synthetic artifact
round trip:

- paste synthetic projection JSON into `/projection-stage/import`
- generate staged artifact JSON
- paste staged artifact JSON into `/projection-stage/artifact`
- confirm validation passes
- confirm embedded review gate appears
- confirm embedded projection renderer appears
- confirm persisted/published false safety state is visible
- confirm known real-content markers remain absent

Extended `pnpm hgo:projection:visual-smoke` to capture:

- `projection-stage-artifact-empty.png`
- `projection-stage-artifact-rendered.png`

Added `pnpm hgo:artifact:test` for focused pure contract coverage.

Generated reports and screenshots remain under ignored `artifacts/` paths.

## Deferred

Still deferred:

- private staged projection artifact store
- Studio publish API
- DB projection table
- live public route promotion
- real content ingestion
- QuipLore / Quote Engine authority layer
- autosave
- Yjs/collaboration
- deployment
