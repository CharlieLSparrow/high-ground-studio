# Quipsly Current Agent Brief

Date: 2026-06-02

Read this first before touching Quipsly editor, manuscript, tagging, notebook,
publisher, or document-kernel work.

## Current Authority

Canonical docs:

- `docs/vision/quipsly-creative-os-north-star.md`
- `docs/architecture/quipsly-document-kernel.md`
- `docs/plans/quipsly-kernel-now-next-later.md`
- `docs/archive/quipsly-guidance-supersession.md`

Older Studio, Manuscript Desk, Content Studio, Quipsly/QuipLore, and
browser-local manuscript docs are historical source material when they conflict
with the above docs.

## Live App Reality

As of 2026-06-02:

- app package: `apps/quipsly`
- live app domain: `https://nest.quipsly.com`
- Cloud Run service still named `studio`
- current editor/tagger workbench: `/` and `/create`
- video editor: `/editor`
- notebook launcher: `/notebooks`
- file hub: `/files`
- study hub: `/study`
- hidden publisher overlay: open `/?publisher=1`
- kernel proof lab: `/kernel-lab`

## Product Rules

- Preserve the one continuous manuscript mental model.
- Do not add visible "Add paragraph" or block-builder UX as the primary writing
  model.
- Chapters and episodes are boundary markers.
- Stories are regions or story-thread fragments.
- Quotes and clips are inline annotations.
- Verified quotes can become durable entities.
- Publisher mode is an operator layer, not the default Homer writing surface.
- Romance Lab belongs in a private workspace, not the HGO workspace.

## Architecture Rules

- The Quipsly document kernel is the intended canonical brain.
- TipTap, Slate, Lexical, textareas, ReactFlow, and the video editor are
  adapters or surfaces.
- Current `StudioDocumentBlock` and `StudioTaggedSpan` records can be treated as
  materialized projections while the kernel is introduced.
- Agents should inspect kernel state and propose explicit operations, not
  silently mutate manuscript prose.

## First Files To Inspect

Current workbench:

- `apps/quipsly/src/app/create/Workspace.tsx`
- `apps/quipsly/src/app/create/Tagger.tsx`
- `apps/quipsly/src/app/create/actions.ts`
- `apps/quipsly/src/app/create/ViewFilter.tsx`

Old Manuscript Desk source material:

- `apps/quipsly/src/app/manuscript/manuscript-editor-model.ts`
- `apps/quipsly/src/app/manuscript/manuscript-editor-marks.ts`
- `apps/quipsly/src/app/manuscript/studio-manuscript-client.tsx`
- `apps/quipsly/src/app/manuscript/collaboration-lab/*`

Video editor surface:

- `apps/quipsly/src/app/editor/page.tsx`
- `apps/quipsly/src/app/editor/VisualTimeline.tsx`
- `apps/quipsly/src/app/editor/VideoSegmentDesk.tsx`

Deploy path:

- `apps/quipsly/Dockerfile`
- `cloudbuild.studio.yaml`
- `cloudbuild.studio.deploy.yaml`
- `scripts/studio-cloud-run-deploy.mjs`
- `scripts/sync-prisma-pnpm-clients.mjs`

## Current Known Deploy Notes

- Cloud Run service name remains `studio`.
- The Docker build uses `apps/quipsly/Dockerfile`.
- Docker runs `pnpm db:generate`, then
  `node scripts/sync-prisma-pnpm-clients.mjs`, then
  `pnpm --filter quipsly build`.
- `QUIPSLY_DOCKER_IGNORE_TYPE_ERRORS=1` is used in Docker build args to avoid
  Docker-only stale Prisma type breaks while local builds remain stricter.

## Immediate Next Implementation

Create `packages/quipsly-document-kernel` and prove:

- split node
- apply inline annotation
- preserve annotation across split/edit
- materialize blocks/spans

Do not replace the live editor until this proof exists.

## Kernel Package

The first kernel package now lives at:

- `packages/quipsly-document-kernel`

Useful scripts:

- `pnpm quipsly:kernel:typecheck`
- `pnpm quipsly:kernel:build`
- `pnpm quipsly:kernel:test`

Core source files:

- `src/document.ts`
- `src/anchors.ts`
- `src/operations.ts`
- `src/projections.ts`
- `src/context.ts`
- `src/validation.ts`
- `src/migrations.ts`
- `src/studioProjection.ts`
- `src/benjamin-franklin.test.ts`

App lab surface:

- `apps/quipsly/src/app/kernel-lab/page.tsx`
