# HGO Staged Projection Surface Plan

Date: 2026-05-22

## Position

Studio is the private workbench. HGO is the review stage for projections of
tagged source material.

The staged projection surface is the place where Charlie and Homer should
eventually review in-progress episode pages before public release. It is not
the editing source, not canonical manuscript truth, and not public publishing.

## Current Pass

This pass adds a synthetic-only staged route family:

- `/projection-stage`
- `/projection-stage/[slug]`
- `/projection-stage/review`

The routes use the same HGO projection contract and shared
`EpisodeProjectionView` renderer already used by `/projection-preview`. The data
source is still the synthetic fixture repository only. No real manuscript text,
real HGO content, database persistence, Studio publish API, deployment, or
public `/episodes` replacement is involved.

## Renderer Direction

The same renderer should eventually power:

- synthetic preview pages
- staged review pages
- live public episode pages
- archived pages

Lifecycle and visibility should remain projection data, not separate hand-built
page implementations.

## Staged Safety Boundary

Staged pages may contain real projection text later. Until public-safety and
citation review pass, they must remain private/review-only.

The staged surface must keep warning state visible for:

- unresolved pull quotes
- `needs-source`
- `needs-review`
- `do-not-use`
- staged or private visibility
- live/public status that does not satisfy citation checks

The current implementation uses synthetic data only, but it keeps the warning
shape visible so the later real workflow has a place to enforce review.

## Review Gate

The staged surface includes a synthetic-only review gate at
`/projection-stage/review`.

The gate groups projections into:

- blocked
- needs review
- live-safe

It uses pure helpers in:

- `apps/web/src/lib/hgo/projection-review-gate.ts`

The helper reports blocker, warning, and info issues. Blockers prevent future
live promotion. Warnings keep review context visible without performing any
real publish action.

Blocking conditions include:

- pull quotes marked `needs-source`
- pull quotes marked `needs-review`
- pull quotes marked `do-not-use`
- source notes marked `needs-review`
- source notes marked `do-not-use`
- archived status
- missing title or slug
- live/public projections that still contain live-blocking issues

Warnings include synthetic fixture data, staged/private visibility, pull quotes
present, unpublished audio, and Studio browser bridge origin.

The gate is not a publish UI. It intentionally says that promotion to live will
require a later approved workflow.

## Future Path

1. Synthetic staged surface.
2. Browser import from Studio projection JSON.
3. Private staged projection persistence.
4. Manual approval gates for citation and public-safety review.
5. Live public route promotion.

## Deferred

Not included in this pass:

- real content
- public `/episodes` replacement
- DB projection table
- Studio publish API
- QuipLore integration
- Quote Engine integration
- simultaneous editing
- autosave
- deployment or cloud configuration changes
