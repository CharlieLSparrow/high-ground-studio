# HGO Projection System Plan

Date: 2026-05-21

## Position

Studio is the workshop. HGO is the stage.

Studio owns the private manuscript workflow: the long manuscript, author marks,
semantic tags, structure regions, cited quotations, quote review metadata,
recording handoff exports, publishing packet exports, and manual server
snapshots.

HGO should render approved or staged projections of that work. It should not
become the source-of-truth editing surface.

## Core Product Decision

HighGroundOdyssey.com adapts to Studio. Studio does not adapt to the old HGO
episode workflow.

The existing HGO episode page implementation can be replaced when the
projection model is ready. It should not be preserved out of sentiment if it
keeps HGO in a plain blog/archive pattern.

## Projection Lifecycle

The same renderer should support:

- `synthetic`: fake data for testing layout, filters, and handoff flows.
- `staged`: private or semi-private preview pages for Homer/Charlie review.
- `live`: approved public projections.
- `archived`: retired directions or historical projections that should remain
  visible to operators without becoming current.

Lifecycle is data. It should not require separate page code for staged versus
live versus archived.

## Visibility

Projection visibility should be explicit:

- `private`: internal-only.
- `staged`: previewable before public release.
- `public`: safe for public route surfaces.

The current prototype is synthetic-only and does not implement auth, release
gates, or deployment behavior. It demonstrates the data contract and renderer
shape.

## Why Staged Pages Matter

Charlie works across the whole book and all episodes at once. Homer needs to
see work-in-progress episode pages before the public does.

Staged pages make that possible:

- Charlie can show a page-shaped episode before launch.
- Homer can review flow, voice, and recording notes.
- Source/citation issues can remain visible without implying release-readiness.
- The public HGO site can later use the same renderer after approval.

## One Manuscript World, Multiple Lenses

Book pages and episode pages are different lenses over the same manuscript
world.

The system should support:

- book-only projections,
- episode-only projections,
- material that belongs to both book and episode,
- internal/private projection notes,
- public-safe filtered views.

These are not separate editorial worlds. They are public/staged renderings of
Studio's manuscript metadata and export state.

## Filters

The projection map should support filters for:

- `book-only`
- `episode-only`
- `book-and-episode`
- `internal`
- `public-safe`

The first implementation uses synthetic data and query-string filters under
`/projection-preview`.

## Shared Data Contract

The renderer should depend on a typed projection contract, not MDX page shape
or private Studio editor internals.

The current code-level contract lives at:

- `apps/web/src/lib/hgo/projection-types.ts`

It defines status, visibility, content scopes, audio state, citation state,
source note status, filters, and `HgoEpisodeProjection`.

Current citation state vocabulary:

- `synthetic`
- `needs-source`
- `needs-review`
- `verified`
- `do-not-use`

## Preview Routes

Current synthetic preview routes:

- `/projection-preview`: book/series map and filter surface.
- `/projection-preview/[slug]`: visual-heavy projection renderer.
- `/projection-preview/import`: browser-only pasted JSON import that validates a
  Studio-generated projection draft and renders it with the same preview
  component.
- `/projection-preview/synthetic-episode`: now served by the shared dynamic
  renderer, preserving the original preview URL.

## Staged Projection Surface

Current synthetic staged routes:

- `/projection-stage`: review-stage map for synthetic/staged/live/archived
  projection fixtures.
- `/projection-stage/[slug]`: staged detail route that wraps the shared
  projection renderer with review-boundary and citation-readiness warnings.

The staged surface is not public publishing and does not replace `/episodes`.
It exists to make the future HGO.com integration path visible: Studio produces
projection artifacts, HGO stages them for review, and only a later approval
workflow promotes them to live public routes.

Current staged data comes from:

- `apps/web/src/lib/hgo/projection-repository.ts`

That repository is synthetic fixture backed only. It has no database, API,
server write, or real content integration.

Detailed staged-surface notes:

- `docs/architecture/hgo-staged-projection-surface-plan.md`

## Studio Bridge

The first Studio-to-HGO bridge is manual and browser-only. Studio's private
`/manuscript` Publish mode can generate an HGO episode projection draft JSON
from synthetic or tagged manuscript metadata. HGO can then paste that JSON into
`/projection-preview/import` for renderer validation.

The bridge does not create server artifacts, mutate content files, write Prisma
data, or publish live pages. Its purpose is to prove the projection handoff:
sources are preserved, spans remain addressable in Studio, tags stay
actionable, and HGO renders only the projection.

Hardening note:

- A Studio-generated projection draft may contain quoted text, source titles,
  citation text, structure titles, author summary counts, and block counts.
- It is not public-safe until citation/public-safety review is complete.
- The browser import validator warns on Studio browser bridge origin, staged
  status/visibility, pull quote presence, unresolved citation states, live
  status, and public visibility.

Detailed bridge notes:

- `docs/architecture/studio-to-hgo-projection-bridge.md`

## What This Does Not Build Yet

- Auth-gated staged preview access.
- Server-side Studio export ingestion.
- Live public episode replacement.
- Canonical publishing database.
- Real HGO content migration.
- DNS, OAuth, billing, secrets, Cloud SQL, or Prisma changes.
- Yjs, collaboration, or autosave.

## Replacement Guidance

Old HGO episode code can be replaced when:

- the projection contract is stable enough,
- staged preview access is designed,
- Studio can export or publish approved projection data,
- public-safe citation rules are explicit,
- real content migration has a rollback plan.

Until then, the old route can coexist with the synthetic preview system.
