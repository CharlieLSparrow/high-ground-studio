# HGO Staged Import Review Result

Date: 2026-05-22

## Summary

Added a no-persistence HGO staged import review route:

- `/projection-stage/import`

The route accepts pasted HGO projection JSON in client state only, validates it
with `validateHgoEpisodeProjection`, runs `createHgoProjectionReviewGate` on
valid projections, displays blocker/warning/info issues, and renders the draft
with `EpisodeProjectionView` using staged route base props.

## Safety Boundary

This pass did not add persistence or publishing:

- no server route
- no local storage
- no Prisma or schema change
- no Cloud SQL or Cloud Run change
- no public `/episodes` replacement
- no real publish action
- no real manuscript or real HGO content

The route copy warns that real projection drafts may contain private or
review-only content and must not be pasted into public places.

## Automation

Extended `pnpm hgo:projection:browser-smoke` to cover:

- `/projection-stage/import`
- pasted synthetic JSON validation
- staged review gate display
- blocker/no-publish/no-persistence copy
- shared projection renderer mount
- known real-content marker absence

Extended `pnpm hgo:projection:visual-smoke` to capture:

- `projection-stage-import-empty.png`
- `projection-stage-import-rendered.png`

Generated reports and screenshots remain under ignored `artifacts/` paths.

## Deferred

Still deferred:

- private staged projection artifact store
- Studio publish API
- DB projection table
- live public route promotion
- real content ingestion
- QuipLore / Quote Engine integration
- autosave
- Yjs/collaboration
- deployment
