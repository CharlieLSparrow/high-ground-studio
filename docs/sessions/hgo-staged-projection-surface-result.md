# HGO Staged Projection Surface Result

Date: 2026-05-22

## Scope

Added a synthetic-only staged projection surface for HGO. The work keeps Studio
as the private workbench and HGO as the projection review stage, without using
real manuscript text, real HGO content, persistence, deployment, or public
episode route replacement.

## Added

- `apps/web/src/lib/hgo/projection-repository.ts`
- `/projection-stage`
- `/projection-stage/[slug]`

The staged detail route wraps the shared `EpisodeProjectionView` renderer with a
review banner and citation/public-safety readiness summary. The renderer now
accepts optional route base props so preview pages continue linking to
`/projection-preview` while staged pages link within `/projection-stage`.

## Readiness Summary

The repository helper summarizes:

- unresolved pull quote count
- `needs-source` count
- `needs-review` count
- `do-not-use` count
- `isLiveSafe`
- warnings for synthetic fixture data, staged/internal material, unresolved
  citations, source-review issues, and live/public mismatch

## Smoke Coverage

The no-auth HGO browser smoke now covers:

- `/projection-preview/import`
- `/projection-stage`
- `/projection-stage/synthetic-field-radio`

It confirms the staged map loads, the detail route renders the shared projection
root, readiness warnings appear, known real-content markers are absent, and no
server write happens.

## Boundaries

This pass does not add a DB projection table, Studio publish API, public
deployment pipeline, live `/episodes` promotion, real content, QuipLore/Quote
Engine integration, autosave, Yjs/collaboration, OAuth automation, or cloud
configuration changes.
