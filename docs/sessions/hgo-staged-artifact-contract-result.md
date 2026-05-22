# HGO Staged Artifact Contract Result

Date: 2026-05-22

## Summary

Added a browser-only staged projection artifact contract and downloadable review
packet flow for `/projection-stage/import`.

The new helper lives at:

- `apps/web/src/lib/hgo/staged-projection-artifact.ts`

It creates an `hgo-staged-artifact-v1` packet from:

- pasted projection JSON
- validation warnings/errors
- staged review gate result
- projection/source identity
- browser-only safety flags

## Route Behavior

`/projection-stage/import` now shows an artifact summary after valid projection
JSON is pasted. Operators can:

- generate staged artifact JSON
- download staged artifact JSON through a Blob download

The generated artifact is not persisted by HGO and is not a publish action.

## Safety Boundary

This pass stayed browser-only:

- no local storage
- no server route
- no Prisma/schema change
- no Cloud SQL or Cloud Run change
- no public `/episodes` replacement
- no real publish action
- no real manuscript or real HGO content

The artifact declares:

- `persisted: false`
- `published: false`
- `containsRealContent: "unknown"`

## Automation

Extended `pnpm hgo:projection:browser-smoke` to confirm:

- staged artifact summary appears
- artifact JSON can be generated
- artifact JSON contains `artifactVersion`
- artifact JSON contains the projection slug
- artifact JSON contains `reviewGate`
- safety flags remain `persisted: false` and `published: false`

Extended `pnpm hgo:projection:visual-smoke` to capture:

- `projection-stage-import-artifact.png`

## Deferred

Still deferred:

- private staged projection artifact store
- database projection table
- Studio publish API
- live public promotion workflow
- real content ingestion
- QuipLore / Quote Engine authority layer
- autosave
- Yjs/collaboration
- deployment
