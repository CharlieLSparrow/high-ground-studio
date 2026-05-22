# HGO Staged Artifact Store Lab Result

Date: 2026-05-22

## Summary

Added a browser-only Store Lab for HGO staged artifacts:

- `/projection-stage/store-lab`

The route imports pasted `hgo-staged-artifact-v1` JSON into React session state
only, models private-store lifecycle states, renders the embedded review gate
and projection, and keeps the no-persistence/no-publish boundary visible.

## Pure Helper

Added:

- `apps/web/src/lib/hgo/staged-artifact-store-lab.ts`

The helper provides:

- empty lab state creation
- validated artifact import
- duplicate active artifact rejection
- human-review marking
- approved-for-future-staging marking
- simulated promotion-candidate creation
- archiving
- record lookup
- status grouping
- summary counts

The embedded artifact safety flags are not mutated. Imported artifacts still say
`persisted: false` and `published: false`.

## Tests

Added:

- `scripts/hgo-staged-artifact-store-lab.test.mjs`
- `pnpm hgo:store-lab:test`

The tests cover empty state, valid synthetic import, invalid import rejection,
persisted/published rejection, duplicate artifact behavior, review status
changes, simulated promotion-candidate gating, archive behavior, summary counts,
record lookup, and status grouping.

## Automation

Extended:

- `pnpm hgo:projection:browser-smoke`
- `pnpm hgo:projection:visual-smoke`

Browser smoke now includes a full synthetic Store Lab lifecycle after the staged
artifact roundtrip. Visual smoke now captures Store Lab empty, imported,
reviewed, and archived screenshots under ignored artifact paths.

## Safety Boundary

This result remains browser-only and synthetic-only:

- no real manuscript text
- no real HGO content
- no persistence
- no localStorage/sessionStorage writes
- no server route or API route
- no Prisma/schema change
- no Cloud SQL or Cloud Run change
- no deployment
- no OAuth bypass
- no autosave
- no Yjs/collaboration
- no public `/episodes` replacement
- no real publish action

## Deferred

Still deferred:

- private staged artifact database table
- server action or API route
- access-control implementation for stored staged artifacts
- migration and rollback plan
- live public route promotion
- QuipLore / Quote Engine authority layer
- real content ingestion
